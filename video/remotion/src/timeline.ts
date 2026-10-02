/* timeline.json (written by video/record.py) → frame layout. The output is the kept scenes back to back, in `order`. */
export type Spot = { t0: number; t1: number; x: number; y: number; w: number; h: number; label?: string };
export type Scene = {
  id: string; order: number; t0: number; t1: number;
  chip: string; ko: string; en: string;
  act: [string, string] | null;          // act card shown over the first seconds of this scene
  overlay: "opening" | "ending" | null;
  hero: number;                           // seconds of this scene to use in the short hero cut (0 = not in it)
  spots: Spot[];
};
export type Timeline = { fps: number; width: number; height: number; video: string; scenes: Scene[] };

export type Laid = Scene & { from: number; dur: number; startFrom: number; speed: number; spotFrames: { from: number; dur: number; x: number; y: number; w: number; h: number; label?: string }[] };
export type Layout = { fps: number; total: number; scenes: Laid[] };

export const ACT_HOLD = 1.7;   // seconds the act card stays (the page holds still under it)
export const SPEED = 1.5;      // the screen recording is played back this much faster (the opening/ending stay at 1×)

export function layout(tl: Timeline, hero = false): Layout {
  const fps = tl.fps;
  let from = 0;
  const scenes: Laid[] = [];
  for (const s of [...tl.scenes].sort((a, b) => a.order - b.order)) {
    if (hero && !s.hero) continue;
    const speed = s.overlay ? 1 : SPEED;
    const len = (hero ? Math.min(s.t1 - s.t0, s.hero) : s.t1 - s.t0) / speed;   // seconds of output
    const dur = Math.round(len * fps);
    const spotFrames = s.spots
      .map(sp => ({ from: Math.round((sp.t0 - s.t0) / speed * fps), dur: Math.round((Math.min(sp.t1, s.t0 + len * speed) - sp.t0) / speed * fps), x: sp.x, y: sp.y, w: sp.w, h: sp.h, label: sp.label }))
      .filter(sp => sp.dur > 6 && sp.from < dur);
    scenes.push({ ...s, from, dur, startFrom: Math.round(s.t0 * fps), speed, spotFrames });
    from += dur;
  }
  return { fps, total: Math.max(1, from), scenes };
}
