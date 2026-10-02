import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useVideoConfig } from "remotion";
import { ActCard, Caption, Chip, Ending, Opening, Spots } from "./overlays";
import { ACT_HOLD, type Laid, type Layout } from "./timeline";

export type DemoProps = { layout: Layout; video: string; hero?: boolean };

const SceneView: React.FC<{ s: Laid; video: string; hero: boolean }> = ({ s, video, hero }) => {
  const { fps } = useVideoConfig();
  const actFrames = s.act && !hero ? Math.round(ACT_HOLD * fps) : 0;
  const textDelay = actFrames ? actFrames - 4 : 8;
  return (
    <AbsoluteFill style={{ background: "#0e0e14" }}>
      <OffthreadVideo src={staticFile(video)} startFrom={s.startFrom} playbackRate={s.speed} muted style={{ width: "100%", height: "100%" }} />
      {!hero && <Spots s={s} />}
      {s.overlay === "opening" ? <Opening dur={s.dur} /> : null}
      {s.overlay === "ending" ? <Ending dur={s.dur} /> : null}
      {!hero && s.chip ? <Chip text={s.chip} delay={textDelay} dur={s.dur} /> : null}
      <Caption ko={s.ko} en={hero ? "" : s.en} delay={textDelay} dur={s.dur} />
      {s.act && !hero ? <ActCard title={s.act[0]} sub={s.act[1]} frames={actFrames} /> : null}
    </AbsoluteFill>
  );
};

export const Demo: React.FC<DemoProps> = ({ layout, video, hero = false }) => (
  <AbsoluteFill style={{ background: "#0e0e14" }}>
    {layout.scenes.map(s => (
      <Sequence key={s.id} from={s.from} durationInFrames={s.dur} name={s.id}>
        <SceneView s={s} video={video} hero={hero} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
