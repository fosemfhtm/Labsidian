import { loadFont } from "@remotion/fonts";

// Pretendard (same family the site uses); loaded from the CDN at render time
export const FONT = "Pretendard";
loadFont({ family: FONT, url: "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2", weight: "100 900" });
