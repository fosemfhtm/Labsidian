import React from "react";
import { Composition, staticFile } from "remotion";
import { Demo, type DemoProps } from "./Demo";
import { lay, toOut, type Timeline } from "./timeline";
import "./font";

const W = 1920, H = 1080, FPS = 30;
const load = async (): Promise<Timeline> => (await fetch(staticFile("timeline.json"))).json();

export const Root: React.FC = () => (
  <>
    {/* the full film */}
    <Composition id="Demo" component={Demo} width={W} height={H} fps={FPS} durationInFrames={1} defaultProps={{ laid: null } as DemoProps}
      calculateMetadata={async ({ props }) => {
        const tl = await load();
        if ((props as { proxy?: boolean }).proxy) tl.video = "raw_proxy.mp4";   // --preview: a small copy of the recording
        const l = lay(tl);
        return { durationInFrames: Math.max(1, Math.round(l.total * FPS)), props: { ...props, laid: l, from: 0 } };
      }} />
    {/* README loop (~14 s): the map — a member's papers light up, then the people a shared paper connects */}
    <Composition id="Loop" component={Demo} width={W} height={H} fps={FPS} durationInFrames={1} defaultProps={{ laid: null } as DemoProps}
      calculateMetadata={async ({ props }) => {
        const l = lay(await load());
        const c = l.tl.caps.find(x => x.text.startsWith("사람은 자기가"));
        return { durationInFrames: 14 * FPS, props: { ...props, laid: l, from: c ? Math.max(0, toOut(l, c.t0) - 0.3) : 0 } };
      }} />
  </>
);
