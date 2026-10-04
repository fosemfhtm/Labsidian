/* Render the film, one chapter at a time; a chapter whose footage, timeline slice and overlay code are unchanged comes
 * from the cache (out/parts), so fixing a caption or a camera move re-renders that chapter only.
 *   node render.mjs           → out/labsidian_demo.mp4 (1080p) + out/labsidian_demo_readme.mp4 (< 10 MB, for the README)
 *   node render.mjs --preview → out/preview.mp4 (half size, from a 960×600 copy of the recording; quick check)
 *   node render.mjs --all     → ignore the cache
 *   node render.mjs Loop      → out/loop.mp4 (the ~12 s README loop)
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out"), PUB = path.join(here, "public");
const preview = process.argv.includes("--preview"), force = process.argv.includes("--all");
const id = process.argv.slice(2).find(a => !a.startsWith("--")) || "Demo";
const PARTS = path.join(OUT, preview ? "parts-preview" : "parts");
fs.mkdirSync(PARTS, { recursive: true });

if (preview) {   // decoding the 2880×1800 recording is the slow part: preview from a 960×600 copy
  const src = path.join(PUB, "raw.mp4"), dst = path.join(PUB, "raw_proxy.mp4");
  if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(src).mtimeMs)
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", "scale=960:-2", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-g", "30", dst]);
}
console.log("bundling…");
const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), webpackOverride: c => c });
const inputProps = preview ? { proxy: true } : {};
const comp = await selectComposition({ serveUrl, id, inputProps });
console.log(`${id}: ${(comp.durationInFrames / comp.fps).toFixed(1)}s`);
const opts = { composition: comp, serveUrl, codec: "h264", crf: preview ? 24 : 16, scale: preview ? 0.5 : 1, jpegQuality: preview ? 60 : 80,
  inputProps: comp.props, muted: true, logLevel: "error", concurrency: preview ? 8 : 6 };
const dst = path.join(OUT, preview ? "preview.mp4" : id === "Demo" ? "labsidian_demo.mp4" : "loop.mp4");

if (id !== "Demo") {
  await renderMedia({ ...opts, outputLocation: dst });
  console.log("→", dst);
  process.exit(0);
}

// ---- chapters → frame ranges, each keyed by what it shows
const { laid } = comp.props, tl = laid.tl, fps = comp.fps;
const sha = s => createHash("sha1").update(s).digest("hex").slice(0, 12);
const toOut = t => { for (const s of laid.segs) { if (t < s.t0) return s.o0; if (t <= s.t1) return s.o0 + (t - s.t0) / s.speed; } return laid.total; };
const fileSig = p => { const st = fs.statSync(p); return `${st.size}:${st.mtimeMs}`; };
const codeSig = sha(fs.readdirSync(path.join(here, "src")).sort().map(f => fs.readFileSync(path.join(here, "src", f), "utf8")).join("\n")
  + fileSig(path.join(PUB, "logo.svg")) + fileSig(path.join(PUB, preview ? "raw_proxy.mp4" : "raw.mp4")) + `${opts.crf}:${opts.scale}`);
const marks = [...tl.chapters].sort((a, b) => a.t - b.t);
const cuts = [...new Set([0, ...marks.slice(1).map(m => Math.round(toOut(m.t) * fps)), comp.durationInFrames])]
  .filter(f => f <= comp.durationInFrames).sort((a, b) => a - b);
const inRaw = (t, a, b) => t >= a && t <= b;
const clips = [];
let rendered = 0;
for (let i = 0; i + 1 < cuts.length; i++) {
  const f0 = cuts[i], f1 = cuts[i + 1] - 1;
  if (f1 < f0) continue;
  // the raw-time window this chunk shows and everything in the timeline touching it (+ the camera/mouse state carried in)
  const segs = laid.segs.filter(s => s.o1 * fps > f0 && s.o0 * fps <= f1);
  const a = segs.length ? segs[0].t0 : 0, b = segs.length ? segs[segs.length - 1].t1 : 0;
  const slice = {
    segs: segs.map(s => [s.t0, s.t1, s.speed, Math.round(s.o0 * fps) - f0]), len: f1 - f0, theme: tl.theme,
    caps: tl.caps.filter(c => c.t1 >= a && c.t0 <= b), chips: tl.chips.filter(c => c.t1 >= a && c.t0 <= b),
    chapters: tl.chapters.filter(c => c.t <= b), overlays: tl.overlays.filter(o => o.t1 >= a && o.t0 <= b),
    cam: [...tl.cam.filter(c => c.t < a).slice(-2), ...tl.cam.filter(c => inRaw(c.t, a, b))],
    mouse: [...tl.mouse.filter(m => m[0] < a).slice(-1), ...tl.mouse.filter(m => inRaw(m[0], a, b))],
    clicks: tl.clicks.filter(c => inRaw(c[0], a - 1, b)),
  };
  const clip = path.join(PARTS, `${String(i).padStart(2, "0")}-${sha(JSON.stringify(slice) + codeSig)}.mp4`);
  clips.push(clip);
  if (!force && fs.existsSync(clip)) continue;
  process.stdout.write(`  part ${i} (${((f1 - f0 + 1) / fps).toFixed(1)}s)… `);
  await renderMedia({ ...opts, frameRange: [f0, f1], outputLocation: clip });
  rendered++;
  console.log("ok");
}
for (const f of fs.readdirSync(PARTS)) if (f.endsWith(".mp4") && !clips.includes(path.join(PARTS, f))) fs.unlinkSync(path.join(PARTS, f));
const list = path.join(PARTS, "list.txt");
fs.writeFileSync(list, clips.map(c => `file '${c.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", dst]);
console.log(`${rendered} part(s) rendered, ${clips.length - rendered} from cache → ${dst}`);

if (!preview) {
  // GitHub takes videos up to 10 MB: 1080p with a bitrate cap sized to the film's length (~9 MB)
  const readme = path.join(OUT, "labsidian_demo_readme.mp4");
  const kbps = Math.floor((9 * 8000) / (comp.durationInFrames / fps));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", dst, "-c:v", "libx264", "-preset", "veryslow", "-tune", "stillimage", "-crf", "28",
    "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`, "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", readme]);
  console.log("→", readme, (fs.statSync(readme).size / 1e6).toFixed(1), "MB");
}
