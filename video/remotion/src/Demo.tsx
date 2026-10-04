import React, { useMemo } from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "./font";
import { type Cam, type Laid, segAt, toOut, toRaw } from "./timeline";

/* Stage 1920×1080: a soft backdrop, a macOS window holding the recording, a camera that eases onto what matters.
 * Captions, the chapter strip and overlays sit above the camera (they don't zoom). */
const SW = 1920, SH = 1080;
// three bands: chapter strip (top) · the window · captions (bottom), so a caption never covers the app at zoom 1
const CW = 1392, CH = 870, TB = 30;                // window content and title bar (1440×900 page at 0.97)
const WX = (SW - CW) / 2, WY = 76;                 // window top-left (content starts at WY + TB); bottom edge at 976
const CAP_BAND = 104;                              // caption band height at the bottom
// zoomed in, the camera centres its target in the space above the caption band
const yCentre = (s: number) => SH / 2 - (CAP_BAND / 2) * clamp((s - 1) / 0.3, 0, 1);
const ACC = "#5e5ce6";
const CHAPTERS = ["지도", "찾기", "읽기", "쓰기", "나누기", "함께 읽기", "돌아보기"];
const DUR = 0.85;                                  // camera move, output seconds

// the frame around the recording follows the site's theme (timeline.json "theme")
const PAL = {
  light: { bg: "linear-gradient(135deg, #e8e6f6 0%, #dfe7f3 55%, #e9eef5 100%)", win: "#fff", bar: "#f2f1f6", barLine: "rgba(0,0,0,.12)", barText: "#6e6e73",
    winShadow: "0 30px 70px rgba(40,40,80,.22), 0 0 0 0.5px rgba(0,0,0,.18)", cap: "rgba(28,28,32,.86)", capLine: "transparent",
    pill: "rgba(255,255,255,.8)", pillText: "#3a3a44", pillLine: "rgba(0,0,0,.12)", dim: "#8e8e93", acc: ACC,
    card: "rgba(246,246,250,A)", title: "#1c1c1e", sub: "#3a3a3c" },
  dark: { bg: "linear-gradient(135deg, #17161f 0%, #1c1a2a 55%, #121218 100%)", win: "#000", bar: "#2c2c2e", barLine: "rgba(255,255,255,.10)", barText: "#98989d",
    winShadow: "0 30px 80px rgba(0,0,0,.55), 0 0 0 0.5px rgba(255,255,255,.16)", cap: "rgba(44,44,48,.92)", capLine: "rgba(255,255,255,.14)",
    pill: "rgba(44,44,48,.85)", pillText: "#e5e5ea", pillLine: "rgba(255,255,255,.14)", dim: "#8e8e93", acc: "#7d7aff",
    card: "rgba(14,14,18,A)", title: "#f2f2f7", sub: "#c7c7cc" },
};
type Pal = typeof PAL.light;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const fade = (o: number, a: number, b: number, f = 0.25) => Math.min(smooth((o - a) / f), smooth((b - o) / f));

export type DemoProps = { laid: Laid | null; from?: number };

// ---------------------------------------------------------------- camera
type View = { s: number; cx: number; cy: number };
const HOME: View = { s: 1, cx: SW / 2, cy: SH / 2 };

function camTargets(l: Laid) {
  const k = CW / l.tl.css.w;
  const target = (c: Cam): View => {
    if (c.reset || c.w == null) return HOME;
    const bx = WX + c.x! * k, by = WY + TB + c.y! * k, bw = c.w * k, bh = c.h! * k;
    const s = c.zoom ?? clamp(Math.min((SW * 0.8) / bw, (SH * 0.7) / bh), 1, 2.1);
    return { s, cx: bx + bw / 2, cy: by + bh / 2 };
  };
  const keys = l.tl.cam.map(c => ({ o: toOut(l, c.t), to: target(c), from: HOME }));
  let cur = HOME;
  keys.forEach((kf, i) => {
    kf.from = cur;
    const nxt = keys[i + 1];
    const p = nxt ? smooth((nxt.o - kf.o) / DUR) : 1;
    cur = lerpView(kf.from, kf.to, p);
  });
  return keys;
}
const lerpView = (a: View, b: View, p: number): View => ({ s: a.s + (b.s - a.s) * p, cx: a.cx + (b.cx - a.cx) * p, cy: a.cy + (b.cy - a.cy) * p });

function viewAt(keys: ReturnType<typeof camTargets>, o: number): View {
  let i = -1;
  for (let j = 0; j < keys.length; j++) if (keys[j].o <= o) i = j;
  if (i < 0) return HOME;
  const kf = keys[i];
  const v = lerpView(kf.from, kf.to, smooth((o - kf.o) / DUR));
  return { s: v.s, cx: keepIn(v.cx, v.s, WX, WX + CW, SW / 2, SW - SW / 2), cy: keepIn(v.cy, v.s, WY, WY + TB + CH, yCentre(v.s), SH - CAP_BAND - yCentre(v.s)) };
}
// zoomed in, keep the view inside the window (no empty backdrop at an edge); at zoom 1 the whole stage shows
function keepIn(c: number, s: number, a: number, b: number, before: number, after: number) {
  const lo = a + before / s, hi = b - after / s;
  const inWin = lo <= hi ? clamp(c, lo, hi) : (a + b) / 2;
  const w = clamp((s - 1) / 0.25, 0, 1);
  return c + (inWin - c) * w;
}

// ---------------------------------------------------------------- cursor
function mouseAt(l: Laid, rt: number): [number, number] | null {
  const m = l.tl.mouse;
  if (!m.length || rt < m[0][0]) return null;
  let lo = 0, hi = m.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (m[mid][0] <= rt) lo = mid; else hi = mid - 1; }
  const a = m[lo], b = m[lo + 1];
  if (!b || b[0] - a[0] > 0.2) return [a[1], a[2]];
  const p = (rt - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
}

const Cursor: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <svg width={26} height={30} viewBox="0 0 22 26" style={{ position: "absolute", left: x - 3, top: y - 3, filter: "drop-shadow(0 1.5px 2px rgba(0,0,0,.35))" }}>
    <path d="M2 2 L2 21 L7 16.5 L10.5 24 L13.5 22.6 L10 15.3 L17 15.3 Z" fill="#111" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
  </svg>
);

// ---------------------------------------------------------------- the film
export const Demo: React.FC<DemoProps> = ({ laid: l, from = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const keys = useMemo(() => (l ? camTargets(l) : []), [l]);
  if (!l) return null;
  const o = from + frame / fps, rt = toRaw(l, o), k = CW / l.tl.css.w;
  const v = viewAt(keys, o);
  const seg = segAt(l, o);
  const mouse = mouseAt(l, rt);
  const ov = l.tl.overlays.map(x => ({ ...x, o0: toOut(l, x.t0), o1: toOut(l, x.t1) })).filter(x => o >= x.o0 && o < x.o1);
  const terminal = ov.find(x => x.kind === "terminal");
  const P: Pal = PAL[(l.tl as { theme?: string }).theme === "dark" ? "dark" : "light"];
  return (
    <AbsoluteFill style={{ background: P.bg, fontFamily: FONT, overflow: "hidden" }}>
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${SW / 2 - v.cx * v.s}px, ${yCentre(v.s) - v.cy * v.s}px) scale(${v.s})` }}>
        {/* window */}
        <div style={{ position: "absolute", left: WX, top: WY, width: CW, height: CH + TB, borderRadius: 12, overflow: "hidden", background: P.win,
          boxShadow: P.winShadow }}>
          <div style={{ height: TB, background: P.bar, borderBottom: `0.5px solid ${P.barLine}`, display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
            {["#ff5f57", "#febc2e", "#28c840"].map(c => <i key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, display: "inline-block" }} />)}
            <span style={{ flex: 1, textAlign: "center", fontSize: 13, color: P.barText, marginRight: 60 }}>localhost — Labsidian</span>
          </div>
          <div style={{ position: "relative", width: CW, height: CH, overflow: "hidden" }}>
            {l.segs.map((s, i) => (
              <Sequence key={i} from={Math.round((s.o0 - from) * fps)} durationInFrames={Math.max(1, Math.round((s.o1 - s.o0) * fps))} layout="none">
                <OffthreadVideo src={staticFile(l.tl.video)} startFrom={Math.round((s.t0 - l.tl.offset) * fps)} playbackRate={s.speed} muted
                  style={{ position: "absolute", inset: 0, width: CW, height: CH }} />
              </Sequence>
            ))}
            {l.tl.clicks.map(([t, x, y], i) => {
              const c = toOut(l, t), g = o - c;
              if (g < 0 || g > 0.45) return null;
              const r = 10 + g * 60;
              return <div key={i} style={{ position: "absolute", left: x * k - r, top: y * k - r, width: r * 2, height: r * 2, borderRadius: r,
                background: `rgba(94,92,230,${0.28 * (1 - g / 0.45)})` }} />;
            })}
            {mouse && !terminal ? <Cursor x={mouse[0] * k} y={mouse[1] * k} /> : null}
          </div>
        </div>
      </AbsoluteFill>

      <Chapters l={l} o={o} s={v.s} P={P} />
      {seg && seg.speed >= 2 ? <div style={{ position: "absolute", right: WX, top: 24, fontSize: 18, fontWeight: 700, color: P.pillText, background: P.pill,
        border: `0.5px solid ${P.pillLine}`, borderRadius: 999, padding: "5px 14px", boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}>▶▶ ×{seg.speed}</div> : null}
      {terminal ? <Terminal p={(o - terminal.o0) / (terminal.o1 - terminal.o0)} dur={terminal.o1 - terminal.o0} /> : null}
      {ov.filter(x => x.kind === "intro" || x.kind === "logo" || x.kind === "ending").map(x => <TitleCard key={x.kind} kind={x.kind} o={o} o0={x.o0} o1={x.o1} P={P} />)}
      {l.tl.chips.map((c, i) => { const a = toOut(l, c.t0), b = toOut(l, c.t1); const f = fade(o, a, b);
        return f > 0 ? <div key={i} style={{ position: "absolute", left: WX, top: 24, transform: `translateY(${(1 - f) * 8}px)`, opacity: f,
          fontSize: 22, fontWeight: 700, color: "#fff", background: P.acc, borderRadius: 999, padding: "7px 20px" }}>🕒 {c.text}</div> : null; })}
      {l.tl.caps.map((c, i) => { const a = toOut(l, c.t0), b = toOut(l, c.t1); const f = fade(o, a, b, 0.3);
        return f > 0 ? <div key={i} style={{ position: "absolute", left: "50%", bottom: (CAP_BAND - 66) / 2 - 2, transform: `translateX(-50%) translateY(${(1 - f) * 8}px)`, opacity: f,
          maxWidth: 1700, whiteSpace: "nowrap", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff",
          background: P.cap, border: `0.5px solid ${P.capLine}`, borderRadius: 16, padding: "12px 30px", boxShadow: "0 10px 30px rgba(0,0,0,.18)" }}>{c.text}</div> : null; })}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- chapter strip (top, outside the window)
const Chapters: React.FC<{ l: Laid; o: number; s: number; P: Pal }> = ({ l, o, s, P }) => {
  const marks = l.tl.chapters.map(c => ({ n: c.n, o: toOut(l, c.t) }));
  let n = 0, since = 0;
  for (const m of marks) if (m.o <= o) { n = m.n; since = m.o; }
  const show = n >= 1 && n <= CHAPTERS.length;
  const firstO = marks.find(m => m.n === 1)?.o ?? 0, endO = marks.find(m => m.n === CHAPTERS.length + 1)?.o ?? l.total;
  // hidden while the camera is zoomed in (it would sit on the app's own top bar)
  const vis = Math.min(smooth((o - firstO) / 0.5), smooth((endO - o) / 0.5), clamp(1 - (s - 1) / 0.12, 0, 1));
  if (!show && vis <= 0) return null;
  const pop = smooth((o - since) / 0.5);
  return (
    <div style={{ position: "absolute", left: "50%", top: 16, transform: "translateX(-50%)", opacity: vis, display: "flex", alignItems: "center", gap: 6,
      background: P.pill, border: `0.5px solid ${P.pillLine}`, borderRadius: 999, padding: "6px 8px", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }}>
      {CHAPTERS.map((name, i) => {
        const on = i + 1 === n, done = i + 1 < n;
        return (
          <React.Fragment key={name}>
            {i ? <span style={{ width: 18, height: 2, borderRadius: 1, background: done || on ? P.acc : P.pillLine }} /> : null}
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 19, fontWeight: on ? 800 : 600, padding: "6px 14px", borderRadius: 999,
              color: on ? "#fff" : done ? P.acc : P.dim, background: on ? P.acc : "transparent", transform: on ? `scale(${1 + 0.06 * (1 - pop)})` : undefined }}>
              {name}</span>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- her own AI: a terminal window over the site
const LINES = [
  { at: 0.36, html: "⏺ <b>labsidian · my_reading_list</b>()" },
  { at: 0.46, html: "⏺ <b>labsidian · create_draft</b>(title: \"Diffusion Convolutional Recurrent Neural Network…\", rating: 4)" },
];
const ANSWER = "읽을 목록의 DCRNN 논문으로 다이어리 초안을 만들었어요. Labsidian 알림에서 확인하고, 고친 뒤 게시해 주세요.";
const PROMPT = "읽을 목록에 넣은 DCRNN 논문 읽고 다이어리 초안 만들어줘";

const Terminal: React.FC<{ p: number; dur: number }> = ({ p, dur }) => {
  const f = Math.min(smooth(p / 0.08), smooth((1 - p) / 0.06));
  const typed = PROMPT.slice(0, Math.floor(PROMPT.length * clamp((p - 0.06) / 0.26, 0, 1)));
  const ans = ANSWER.slice(0, Math.floor(ANSWER.length * clamp((p - 0.58) / 0.28, 0, 1)));
  return (
    <AbsoluteFill style={{ background: `rgba(30,30,50,${0.18 * f})` }}>
      <div style={{ position: "absolute", left: "50%", top: "47%", width: 1180, height: 560, transform: `translate(-50%, -50%) translateY(${(1 - f) * 30}px) scale(${0.97 + 0.03 * f})`,
        opacity: f, borderRadius: 12, overflow: "hidden", background: "#1e1e24", boxShadow: "0 40px 90px rgba(0,0,0,.35), 0 0 0 0.5px rgba(255,255,255,.2)" }}>
        <div style={{ height: 34, background: "#2a2a31", display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map(c => <i key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, display: "inline-block" }} />)}
          <span style={{ flex: 1, textAlign: "center", fontSize: 14, color: "#9a9aa6", marginRight: 60 }}>~/research — claude · labsidian MCP 연결됨</span>
        </div>
        <div style={{ padding: "28px 34px", fontSize: 22, lineHeight: 1.7, color: "#e6e6ee", fontFamily: `"Cascadia Code", Consolas, ${FONT}` }}>
          <div><span style={{ color: "#a99bff", fontWeight: 700 }}>&gt; </span><span style={{ fontFamily: FONT }}>{typed}</span>
            {p < 0.34 ? <span style={{ display: "inline-block", width: 10, height: 24, background: "#a99bff", verticalAlign: -4, marginLeft: 2, opacity: Math.floor(p * dur * 2) % 2 ? 0 : 1 }} /> : null}</div>
          <div style={{ height: 14 }} />
          {LINES.filter(x => p >= x.at).map((x, i) => <div key={i} style={{ fontSize: 18, color: "#8d8d9a" }} dangerouslySetInnerHTML={{ __html: x.html.replace("<b>", '<b style="color:#7ee0c3;font-weight:600">') }} />)}
          <div style={{ height: 14 }} />
          <div style={{ fontFamily: FONT, fontSize: 23 }}>{ans}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- logo cards
const TitleCard: React.FC<{ kind: string; o: number; o0: number; o1: number; P: Pal }> = ({ kind, o, o0, o1, P }) => {
  // intro: an opaque card the map gathers behind; it lifts away over the last second
  const intro = kind === "intro";
  const f = intro ? smooth((o1 - o) / 1.0) : Math.min(smooth((o - o0) / 0.5), kind === "ending" ? 1 : smooth((o1 - o) / 0.5));
  const t = intro ? smooth((o - o0 - 0.2) / 0.7) * f : f;
  return (
    <AbsoluteFill style={{ background: P.card.replace("A", String((intro ? 1 : kind === "ending" ? 0.82 : 0.62) * f)), display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center", opacity: t, transform: `translateY(${(1 - t) * 14}px) scale(${intro ? 0.96 + 0.04 * smooth((o - o0) / 1.2) : 1})` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, fontSize: 92, fontWeight: 800, color: P.title, letterSpacing: "-0.03em" }}>
          <Img src={staticFile("logo.svg")} style={{ width: 92, height: 92 }} />Labsidian
        </div>
        <div style={{ fontSize: 32, color: P.sub, marginTop: 18, fontWeight: 600 }}>
          {kind === "ending" ? "github.com/fosemfhtm/Labsidian" : "연구실의 논문 다이어리를, 함께 보는 지도로"}</div>
        {kind === "ending" ? <div style={{ fontSize: 18, color: P.dim, marginTop: 26 }}>영상 속 연구실과 다이어리는 가상 데이터예요</div> : null}
      </div>
    </AbsoluteFill>
  );
};
