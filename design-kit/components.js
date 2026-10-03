/* design-kit · components.js — the behaviour behind a few ui-* components (docs/components.md)
 *
 *   AppUI.setTheme("auto" | "light" | "dark")   remember the choice, switch <html data-theme>, fire window "app:theme"
 *   AppUI.getTheme()                            the saved choice ("auto" when none)
 *   await AppUI.confirm(title, { message, ok, cancel, destructive })   → true / false   (HIG alert: Cancel leading, action trailing)
 *   AppUI.sheet(html, { wide, forced })         → the sheet element; [data-close] inside closes it, Esc too (unless forced)
 *   AppUI.toast(text, { icon, undo, ms })       a short result line; undo: () => {} adds an "실행 취소" button
 *   AppUI.back(fallback)                        go back in history, or to fallback when the page was opened directly
 *   AppUI.icons(root)                           render Lucide icons after inserting markup (no-op without Lucide)
 *
 * Labels default to Korean; pass your own (ok / cancel / undoLabel) for other languages.
 * Put this inline in <head> to set the theme before first paint (avoids a flash):
 *   <script>try{const t=localStorage.getItem("ui.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>
 */
(() => {
  const KEY = "ui.theme";
  const root = document.documentElement;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icons = (el = document) => { if (window.lucide && el.querySelector?.("i[data-lucide]")) window.lucide.createIcons(); };

  // ---------- theme ----------
  const getTheme = () => { try { return localStorage.getItem(KEY) || "auto"; } catch (e) { return "auto"; } };
  const setTheme = v => {
    try { v === "auto" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch (e) {}
    root.dataset.theme = v;
    window.dispatchEvent(new Event("app:theme"));   // canvases (charts) listen and re-read their colours
  };
  // the OS switched light/dark while on "auto": tell canvases too
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if ((root.dataset.theme || "auto") === "auto") window.dispatchEvent(new Event("app:theme")); });

  // ---------- layers: Esc closes the topmost ----------
  const stack = [];
  document.addEventListener("keydown", e => { if (e.key === "Escape" && stack.length) stack[stack.length - 1](); });
  const trapFocus = (box, e) => {
    if (e.key !== "Tab") return;
    const f = [...box.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(x => !x.disabled && x.offsetParent);
    if (!f.length) return;
    const [first, last] = [f[0], f[f.length - 1]];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  // ---------- alert (confirmation) ----------
  const confirm = (title, opts = {}) => new Promise(resolve => {
    const back = document.activeElement;
    const s = document.createElement("div");
    s.className = "ui-scrim";
    s.innerHTML = `<div class="ui-alert ui-glass strong" role="alertdialog" aria-modal="true" aria-labelledby="ui-alert-t">
      <h3 id="ui-alert-t">${esc(title)}</h3>${opts.message ? `<p>${esc(opts.message)}</p>` : ""}
      <div class="acts"><button class="ui-btn" data-v="0">${esc(opts.cancel || "취소")}</button>
      <button class="ui-btn ${opts.destructive ? "destructive" : "prominent"}" data-v="1">${esc(opts.ok || "확인")}</button></div></div>`;
    const done = v => { s.remove(); stack.splice(stack.indexOf(close), 1); back?.focus?.(); resolve(v); };
    const close = () => done(false);
    s.addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) done(b.dataset.v === "1"); else if (e.target === s) done(false); });
    s.addEventListener("keydown", e => { trapFocus(s, e); if (e.key === "Enter" && e.target.tagName !== "BUTTON") done(true); });
    document.body.appendChild(s); stack.push(close);
    s.querySelector('[data-v="1"]').focus();
  });

  // ---------- sheet (a focused task with fields; buttons bottom-right on desktop) ----------
  const sheet = (html, opts = {}) => {
    const back = document.activeElement;
    const s = document.createElement("div");
    s.className = "ui-scrim sheet";
    s.innerHTML = `<div class="ui-sheet${opts.wide ? " wide" : ""}" role="dialog" aria-modal="true"><div class="body">${html}</div></div>`;
    const close = () => { s.remove(); stack.splice(stack.indexOf(close), 1); back?.focus?.(); };
    s.addEventListener("click", e => { if ((!opts.forced && e.target === s) || e.target.closest("[data-close]")) close(); });
    s.addEventListener("keydown", e => trapFocus(s, e));
    document.body.appendChild(s); if (!opts.forced) stack.push(close);
    s.close = close;
    icons(s);
    (s.querySelector("input, textarea, select") || s.querySelector("button"))?.focus();
    return s;
  };

  // ---------- toast ----------
  let host, timer;
  const toast = (text, opts = {}) => {
    if (!host) { host = document.createElement("div"); host.className = "ui-toast-host"; host.setAttribute("role", "status"); document.body.appendChild(host); }
    host.innerHTML = `<span class="ui-toast ui-glass strong"><i data-lucide="${esc(opts.icon || "circle-check")}" class="ic"></i>${esc(text)}${opts.undo ? ` <button class="ui-btn plain small" data-undo>${esc(opts.undoLabel || "실행 취소")}</button>` : ""}</span>`;
    icons(host);
    const hide = () => host.classList.remove("show");
    host.querySelector("[data-undo]")?.addEventListener("click", () => { hide(); opts.undo(); });
    host.classList.add("show");
    clearTimeout(timer); timer = setTimeout(hide, opts.ms || 4000);
    host.onmouseenter = () => clearTimeout(timer);
    host.onmouseleave = () => { timer = setTimeout(hide, 1500); };
  };

  // ---------- back: history when there is some, else a fixed parent ----------
  const back = (fallback = "#/") => (history.length > 1 && document.referrer.startsWith(location.origin) ? history.back() : (location.href = fallback));

  window.AppUI = { getTheme, setTheme, confirm, sheet, toast, back, icons, esc };
})();
