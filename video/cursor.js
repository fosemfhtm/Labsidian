// Injected into every page during the demo recording: a visible cursor + click ripple (the recorded video has no cursor).
// Captions, title cards and spotlights are NOT drawn here — Remotion adds them afterwards (video/remotion), so they can be
// edited without re-recording.
(() => {
  if (window.__cur) return;
  const css = `
  #vid-cursor{position:fixed;width:22px;height:26px;margin:-3px 0 0 -3px;left:-50px;top:-50px;pointer-events:none;z-index:2147483647}
  #vid-cursor svg{filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}
  .vid-ripple{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid #a882ff;pointer-events:none;z-index:2147483646;animation:vidr .55s ease-out forwards}
  @keyframes vidr{from{transform:scale(.3);opacity:1}to{transform:scale(1.3);opacity:0}}`;
  function mount() {
    if (document.getElementById("vid-cursor")) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const cur = document.createElement("div"); cur.id = "vid-cursor";
    cur.innerHTML = `<svg width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16.5 L10.5 24 L13.5 22.6 L10 15.3 L17 15.3 Z" fill="#fff" stroke="#16161e" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    document.body.appendChild(cur);
    addEventListener("mousemove", e => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", e => {
      const r = document.createElement("div"); r.className = "vid-ripple"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      document.body.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
  }
  window.__cur = { mount };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount); else mount();
})();
