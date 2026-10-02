import React from "react";
import { Composition, staticFile } from "remotion";
import { Demo, type DemoProps } from "./Demo";
import { layout, type Timeline } from "./timeline";
import "./font";

const W = 1920, H = 1080, FPS = 30;
const empty: DemoProps = { layout: { fps: FPS, total: 1, scenes: [] }, video: "raw.mp4" };

const load = async (): Promise<Timeline> => (await fetch(staticFile("timeline.json"))).json();

export const Root: React.FC = () => (
  <>
    {/* the full film: every scene, with act cards, chips, captions and spotlights */}
    <Composition id="Demo" component={Demo} width={W} height={H} fps={FPS} durationInFrames={1} defaultProps={empty}
      calculateMetadata={async ({ props }) => {
        const tl = await load();
        const l = layout(tl);
        return { durationInFrames: l.total, fps: tl.fps, props: { ...props, layout: l, video: tl.video } };
      }} />
    {/* the short cut for the README (→ gif): only scenes with `hero`, captions only */}
    <Composition id="Hero" component={Demo} width={W} height={H} fps={FPS} durationInFrames={1} defaultProps={{ ...empty, hero: true }}
      calculateMetadata={async ({ props }) => {
        const tl = await load();
        const l = layout(tl, true);
        return { durationInFrames: l.total, fps: tl.fps, props: { ...props, layout: l, video: tl.video, hero: true } };
      }} />
  </>
);
