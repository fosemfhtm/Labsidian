/* Incremental render: one clip per scene, cached by content hash, then concatenated with ffmpeg.
 *   node render.mjs            → out/labsidian_demo.mp4   (only scenes whose footage/caption/overlay code changed are re-rendered)
 *   node render.mjs --all      → ignore the cache
 * A scene's clip is keyed by: its timeline entry (times, captions, spots), the overlay sources (src/), the logo and the raw footage.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out"), PARTS = path.join(OUT, "parts");
const force = process.argv.includes("--all");
fs.mkdirSync(PARTS, { recursive: true });

const sha = s => createHash("sha1").update(s).digest("hex").slice(0, 10);
const fileSig = p => { const st = fs.statSync(p); return `${p}:${st.size}:${st.mtimeMs}`; };
const srcSig = sha(fs.readdirSync(path.join(here, "src")).sort().map(f => fs.readFileSync(path.join(here, "src", f), "utf8")).join("\n")
  + fileSig(path.join(here, "public", "logo.svg")) + fileSig(path.join(here, "public", "raw.mp4")));

console.log("bundling…");
const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), webpackOverride: c => c });
const comp = await selectComposition({ serveUrl, id: "Demo", inputProps: {} });
const { layout } = comp.props;
console.log(`${layout.scenes.length} scenes, ${(comp.durationInFrames / comp.fps).toFixed(1)}s`);

const clips = [];
let rendered = 0;
for (const s of layout.scenes) {
  const key = sha(JSON.stringify(s) + srcSig);
  const clip = path.join(PARTS, `${s.id}-${key}.mp4`);
  clips.push(clip);
  if (!force && fs.existsSync(clip)) continue;
  process.stdout.write(`  ${s.id} (${(s.dur / comp.fps).toFixed(1)}s)… `);
  await renderMedia({ composition: comp, serveUrl, codec: "h264", crf: 18, outputLocation: clip, inputProps: comp.props,
    frameRange: [s.from, s.from + s.dur - 1], muted: true, logLevel: "error" });
  rendered++;
  console.log("ok");
}
// old clips of a scene whose hash changed are no longer needed
for (const f of fs.readdirSync(PARTS)) if (!clips.includes(path.join(PARTS, f))) fs.unlinkSync(path.join(PARTS, f));

const list = path.join(PARTS, "list.txt");
fs.writeFileSync(list, clips.map(c => `file '${c.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
const dst = path.join(OUT, "labsidian_demo.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", dst]);
console.log(`${rendered} scene(s) rendered, ${clips.length - rendered} from cache → ${dst}`);
