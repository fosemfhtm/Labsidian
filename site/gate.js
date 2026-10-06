/* Sign-in screen. Shared by the site (auth.js) and the server's login page (login.html → login.js), which the
 * server shows instead of the site until you're signed in.
 *
 *   LabGate({ signIn(name, pw), demo: [{ id, name, avatar }] + demoSignIn(id) → one-click demo accounts, hint })
 */
(() => {
  const { t, lang } = window.I18N;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  I18N.extend({
    ko: {
      "a.title": "연구실 Paper Diary", "a.id": "이름", "a.pw": "비밀번호", "a.login": "로그인", "a.fail": "이름 또는 비밀번호가 맞지 않아요",
      "a.tooMany": "로그인 시도가 너무 많아요. 10분 뒤에 다시 해 주세요.", "a.offline": "서버에 연결하지 못했어요",
      "a.issued": "계정은 관리자가 발급해요. 처음이면 관리자에게 임시 비밀번호를 받아 주세요.",
      "a.demoPick": "데모 계정으로 둘러보기", "a.demoAdmin": "관리자", "a.orPw": "이름·비밀번호로 로그인",
    },
    en: {
      "a.title": "Lab Paper Diary", "a.id": "Name", "a.pw": "Password", "a.login": "Sign in", "a.fail": "Wrong name or password",
      "a.tooMany": "Too many sign-in attempts. Try again in 10 minutes.", "a.offline": "Couldn't reach the server",
      "a.issued": "Accounts are issued by an admin. First time here? Ask them for a temporary password.",
      "a.demoPick": "Explore with a demo account", "a.demoAdmin": "Admin", "a.orPw": "Sign in with name & password",
    },
  });

  // the server's sign-in API (scripts/serve.py) — store.js uses it too; errors: login.fail · login.tooMany · login.offline · pw.wrong · pw.short
  const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
    .catch(() => { throw new Error("login.offline"); })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "login.fail"); return j; });
  window.LabServerAuth = {
    signIn: (name, password) => post("/api/login", { name, password }),
    demoSignIn: id => post("/api/login", { id }),
    signOut: () => post("/api/logout"),
    changePassword: (old, pw) => post("/api/password", { old, new: pw }),
  };

  window.LabGate = ({ signIn, demo, demoSignIn, hint }) => {
    const g = document.createElement("div");
    g.className = "gate";
    g.innerHTML = `<form class="gate-card" id="login-form" autocomplete="on">
      <div class="gate-logo"><img class="logo-mark" src="logo.svg" alt="">Labsidian</div>
      <p class="sub">${t("a.title")}</p>
      ${demo ? `<div class="gate-demo"><b>${t("a.demoPick")}</b>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
        <div class="gate-people">${demo.map(p => `<button type="button" data-demo="${esc(p.id)}">${p.avatar}<span>${esc(p.name)}</span></button>`).join("")}
        <button type="button" data-demo="admin"><span class="avatar admin">A</span><span>${t("a.demoAdmin")}</span></button></div></div>
      <details class="gate-pw"><summary>${t("a.orPw")}</summary>` : ""}
      <label>${t("a.id")}<input name="name" autocomplete="username" required></label>
      <label>${t("a.pw")}<input name="pw" type="password" autocomplete="current-password" required></label>
      <p class="err" id="login-err" role="alert"></p>
      <button class="ui-btn prominent large">${t("a.login")}</button>
      ${demo ? "</details>" : hint ? `<p class="hint">${esc(hint)}</p>` : ""}
      <div class="lang ui-seg small gate-lang"><button type="button" data-v="ko">KO</button><button type="button" data-v="en">EN</button></div>
    </form>`;
    document.body.appendChild(g);
    g.querySelectorAll(".gate-lang button").forEach(b => { b.setAttribute("aria-pressed", b.dataset.v === lang); b.onclick = () => I18N.setLang(b.dataset.v); });
    const err = g.querySelector("#login-err");
    const fail = x => { err.textContent = t(["login.tooMany", "login.offline"].includes(x?.message) ? x.message.replace("login.", "a.") : "a.fail"); };
    g.querySelector("form").onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      try { await signIn(f.name.value, f.pw.value); location.reload(); } catch (x) { fail(x); }
    };
    g.querySelectorAll("[data-demo]").forEach(b => b.onclick = async () => {
      try { await demoSignIn(b.dataset.demo); location.reload(); } catch (x) { fail(x); }
    });
    if (!demo) setTimeout(() => g.querySelector("input").focus(), 50);
    return g;
  };
})();
