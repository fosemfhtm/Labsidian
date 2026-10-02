import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "./font";
import type { Laid } from "./timeline";

const ACC = "#a882ff";
const ease = (f: number, from: number, to: number, a = 0, b = 1) => interpolate(f, [from, to], [a, b], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
// fade in over `inF` frames, fade out over the last `outF` frames of [0, dur)
const inOut = (f: number, dur: number, inF = 10, outF = 8) => Math.min(ease(f, 0, inF), ease(f, dur - outF, dur, 1, 0));

// the site's logo (site/logo.svg, copied to public/) — colours and shape stay as designed
export const Logo: React.FC<{ size?: number }> = ({ size = 76 }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: size * 0.24, fontSize: size, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", fontFamily: FONT }}>
    <Img src={staticFile("logo.svg")} style={{ width: size * 0.9, height: size * 0.9, filter: `drop-shadow(0 0 ${size * 0.5}px rgba(97,85,245,.55))` }} />
    Labsidian
  </div>
);

/** Full-screen "act" card (월요일 · 지난주에 무슨 일이 있었지?) over the dimmed, blurred page. */
export const ActCard: React.FC<{ title: string; sub: string; frames: number }> = ({ title, sub, frames }) => {
  const f = useCurrentFrame();
  if (f >= frames) return null;
  const o = Math.min(ease(f, 0, 6), ease(f, frames - 12, frames, 1, 0));
  const rise = ease(f, 0, 14, 18, 0);
  return (
    <AbsoluteFill style={{ background: `rgba(10,10,16,${0.86 * o})`, backdropFilter: `blur(${10 * o}px)`, display: "grid", placeItems: "center", fontFamily: FONT }}>
      <div style={{ textAlign: "center", opacity: o, transform: `translateY(${rise}px)` }}>
        <div style={{ fontSize: 30, fontWeight: 600, color: ACC, letterSpacing: "0.12em" }}>{title}</div>
        <div style={{ fontSize: 64, fontWeight: 800, color: "#f4f4fa", marginTop: 14, letterSpacing: "-0.02em" }}>{sub}</div>
      </div>
    </AbsoluteFill>
  );
};

/** Top-left chip: which feature is on screen. */
export const Chip: React.FC<{ text: string; delay: number; dur: number }> = ({ text, delay, dur }) => {
  const f = useCurrentFrame() - delay;
  if (f < 0 || !text) return null;
  const o = inOut(f, dur - delay, 8, 6);
  return (
    <div style={{ position: "absolute", left: 28, top: 84, opacity: o, transform: `translateX(${ease(f, 0, 8, -12, 0)}px)`, fontFamily: FONT,
      background: "rgba(14,14,20,.72)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 999, padding: "8px 18px 8px 14px",
      fontSize: 22, fontWeight: 700, color: "#e8e8f2", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 10, height: 10, borderRadius: 5, background: ACC, boxShadow: `0 0 12px ${ACC}` }} />{text}
    </div>
  );
};

/** Bottom caption: one Korean sentence (what you can do here) + a small English line. */
export const Caption: React.FC<{ ko: string; en: string; delay: number; dur: number }> = ({ ko, en, delay, dur }) => {
  const f = useCurrentFrame() - delay;
  if (f < 0 || !ko) return null;
  const o = inOut(f, dur - delay, 10, 8);
  return (
    <div style={{ position: "absolute", left: "50%", bottom: 56, transform: `translate(-50%, ${ease(f, 0, 10, 14, 0)}px)`, opacity: o, fontFamily: FONT, textAlign: "center",
      background: "rgba(14,14,20,.8)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: "16px 30px 14px", maxWidth: 1300 }}>
      <div style={{ fontSize: 34, fontWeight: 700, color: "#f4f4fa", letterSpacing: "-0.02em", lineHeight: 1.35, wordBreak: "keep-all" }}>{ko}</div>
      {en ? <div style={{ fontSize: 18, color: "#a3a3b5", marginTop: 6 }}>{en}</div> : null}
    </div>
  );
};

/** Spotlight: dim everything except a rounded box around the element, with a thin accent ring. */
export const Spots: React.FC<{ s: Laid }> = ({ s }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <>
      {s.spotFrames.map((sp, i) => {
        const g = f - sp.from;
        if (g < 0 || g >= sp.dur) return null;
        const o = inOut(g, sp.dur, 8, 8);
        const grow = ease(g, 0, 8, 1.06, 1);
        const cx = sp.x + sp.w / 2, cy = sp.y + sp.h / 2, w = sp.w * grow, h = sp.h * grow, x = cx - w / 2, y = cy - h / 2;
        return (
          <svg key={i} width={width} height={height} style={{ position: "absolute", inset: 0, opacity: o }}>
            <defs>
              <mask id={`hole${i}`}><rect width={width} height={height} fill="#fff" /><rect x={x} y={y} width={w} height={h} rx={14} fill="#000" /></mask>
            </defs>
            <rect width={width} height={height} fill="rgba(6,6,10,.58)" mask={`url(#hole${i})`} />
            <rect x={x} y={y} width={w} height={h} rx={14} fill="none" stroke={ACC} strokeWidth={3} style={{ filter: `drop-shadow(0 0 10px ${ACC})` }} />
            {sp.label ? (
              <text x={x + 2} y={y + h + 34} fill="#f4f4fa" fontFamily={FONT} fontSize={22} fontWeight={700}>{sp.label}</text>
            ) : null}
          </svg>
        );
      })}
    </>
  );
};

/** Opening: logo + one line over the map gathering itself. */
export const Opening: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = Math.min(ease(f, 0, 12), ease(f, dur - fps * 0.9, dur - fps * 0.2, 1, 0));
  const o2 = ease(f, fps * 0.8, fps * 1.4);
  return (
    <AbsoluteFill style={{ display: "grid", placeItems: "center", fontFamily: FONT, opacity: o }}>
      <div style={{ textAlign: "center", background: "rgba(14,14,20,.5)", padding: "40px 64px", borderRadius: 26, backdropFilter: "blur(4px)" }}>
        <Logo />
        <div style={{ fontSize: 30, color: "#dcdce6", marginTop: 20, fontWeight: 600, opacity: o2 }}>매주 쓰는 Paper Diary를 연구실의 지식 그래프로</div>
        <div style={{ fontSize: 19, color: "#a3a3b5", marginTop: 8, opacity: o2 }}>The lab's weekly paper diary, as a knowledge graph — one member's week</div>
      </div>
    </AbsoluteFill>
  );
};

/** Ending card. */
export const Ending: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = ease(f, fps * 0.3, fps * 1.0);
  const fade = ease(f, dur - fps * 0.7, dur, 0, 1);
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AbsoluteFill style={{ background: `rgba(10,10,16,${0.55 * o})`, display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", opacity: o }}>
          <Logo size={88} />
          <div style={{ fontSize: 28, color: "#dcdce6", marginTop: 22, fontWeight: 600 }}>연구실 Paper Diary를 지식 그래프로 · 댓글 · 스터디 · 내 AI 연결</div>
          <div style={{ fontSize: 20, color: "#a3a3b5", marginTop: 10 }}>github.com/fosemfhtm/Labsidian · 영상 속 연구실과 리뷰는 가상 데이터예요</div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: fade }} />
    </AbsoluteFill>
  );
};
