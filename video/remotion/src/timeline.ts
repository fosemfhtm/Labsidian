/* timeline.json (written by video/record.py) → output timing.
 * Raw time = seconds since the recording started. Only `keep` segments reach the film, back to back, each at its speed. */
export type Keep = { t0: number; t1: number; speed: number };
export type Span = { t0: number; t1: number; text: string };
export type Cam = { t: number; reset?: boolean; x?: number; y?: number; w?: number; h?: number; zoom?: number | null };
export type Timeline = {
  fps: number; width: number; height: number; css: { w: number; h: number }; video: string; offset: number;
  keep: Keep[]; caps: Span[]; chips: Span[]; chapters: { t: number; n: number }[]; cam: Cam[];
  mouse: [number, number, number][]; clicks: [number, number, number][]; overlays: { kind: string; t0: number; t1: number }[];
};
export type Seg = Keep & { o0: number; o1: number };
export type Laid = { tl: Timeline; segs: Seg[]; total: number };

export function lay(tl: Timeline): Laid {
  let o = 0;
  const segs = [...tl.keep].sort((a, b) => a.t0 - b.t0).map(k => {
    const d = (k.t1 - k.t0) / k.speed, s = { ...k, o0: o, o1: o + d };
    o += d; return s;
  });
  return { tl, segs, total: o };
}

/** raw → output seconds (a cut moment snaps to the start of the next kept segment) */
export function toOut(l: Laid, t: number): number {
  for (const s of l.segs) {
    if (t < s.t0) return s.o0;
    if (t <= s.t1) return s.o0 + (t - s.t0) / s.speed;
  }
  return l.total;
}

/** output → raw seconds */
export function toRaw(l: Laid, o: number): number {
  for (const s of l.segs) if (o < s.o1) return s.t0 + Math.max(0, o - s.o0) * s.speed;
  const last = l.segs[l.segs.length - 1];
  return last ? last.t1 : 0;
}

export function segAt(l: Laid, o: number): Seg | null {
  return l.segs.find(s => o >= s.o0 && o < s.o1) || null;
}
