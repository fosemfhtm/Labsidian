/* #/admin — members (issue accounts / reset passwords / roles), tags (rename · merge · create · AI cleanup),
 * terms (diary targets), data (export/import for the DB migration), change log. Admin role only. */
(() => {
  const { t, lang } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;
  const $ = (s, r = document) => r.querySelector(s);

  I18N.extend({
    ko: {
      "ad.title": "관리자", "ad.only": "관리자만 볼 수 있어요",
      "ad.tab.members": "멤버", "ad.tab.tags": "태그", "ad.tab.terms": "학기", "ad.tab.data": "데이터", "ad.tab.log": "변경 기록",
      "ad.name": "이름", "ad.role": "역할", "ad.reviews": "다이어리", "ad.status": "상태", "ad.pending": "첫 로그인 전", "ad.active": "사용 중", "ad.disabled": "비활성",
      "ad.reset": "비밀번호 초기화", "ad.disable": "비활성화", "ad.enable": "활성화", "ad.add": "멤버 추가", "ad.color": "색", "ad.c.red": "빨강", "ad.c.orange": "주황", "ad.c.yellow": "노랑", "ad.c.green": "초록", "ad.c.mint": "민트", "ad.c.teal": "청록", "ad.c.cyan": "하늘", "ad.c.blue": "파랑", "ad.c.indigo": "남색", "ad.c.purple": "보라", "ad.c.pink": "분홍", "ad.c.brown": "갈색", "ad.c.gray2": "회색",
      "ad.tempTitle": "임시 비밀번호", "ad.tempSub": "{name} 님에게 전달하세요. 첫 로그인 때 본인이 바꾸게 돼요. 이 창을 닫으면 다시 볼 수 없어요.",
      "ad.copy": "복사", "ad.close": "닫기", "ad.exists": "같은 이름이 이미 있어요",
      "ad.axis": "축", "ad.ko": "한국어", "ad.en": "English", "ad.uses": "사용", "ad.mergeInto": "병합 →", "ad.save": "저장", "ad.merge": "병합",
      "ad.mergeConfirm": "“{from}” 태그를 “{into}”(으)로 병합할까요? (변경 기록에서 되돌릴 수 있어요)", "ad.newTag": "새 태그",
      "ad.similar": "비슷해 보이는 태그 후보", "ad.noSimilar": "후보 없음",
      "ad.ai": "AI로 태그 정리 (내 Claude · Codex)", "ad.aiHint": "태그 목록이 담긴 프롬프트를 복사해 AI에 붙여넣고, 받은 JSON을 붙여넣으면 병합 제안을 미리 볼 수 있어요. 체크한 것만 적용돼요.",
      "ad.aiCopy": "프롬프트 복사", "ad.aiPaste": "AI 답변 붙여넣기", "ad.aiPreview": "미리보기", "ad.aiApply": "선택한 병합 적용", "ad.aiBad": "JSON을 읽지 못했어요",
      "ad.ops": "태그 변경 이력", "ad.undo": "되돌리기", "ad.domain": "분야", "ad.method": "방법론", "ad.free": "키워드",
      "ad.termLabel": "이름", "ad.start": "시작", "ad.end": "끝", "ad.target": "목표 편수", "ad.addTerm": "학기 추가",
      "ad.targetAuto": "자동 (작성일 수)", "ad.offDays": "연구실 쉬는 날", "ad.offHint": "주말과 공휴일(대체공휴일 포함)은 자동으로 빠져요. 셧다운·학회처럼 연구실이 쉬는 평일만 넣으면 그만큼 작성 목표가 줄어요 (학기 목표 편수를 비워 두면 '작성일 수'가 목표). 선거일·임시공휴일처럼 자동으로 모르는 휴일은 '공휴일'로 추가하세요.",
      "ad.autoHolidays": "자동 공휴일 {y}", "ad.noOff": "아직 없어요 — 셧다운이나 학회 기간을 넣어 주세요",
      "ad.kind": "종류", "ad.kind.holiday": "공휴일", "ad.kind.shutdown": "셧다운", "ad.kind.event": "학회·행사", "ad.offLabel": "이름", "ad.addOff": "쉬는 날 추가", "ad.remove": "삭제",
      "ad.export": "전체 변경 데이터 JSON 내보내기", "ad.import": "JSON 가져오기", "ad.resetAll": "이 브라우저의 데이터 초기화",
      "ad.resetConfirm": "이 브라우저에 저장된 계정·다이어리·댓글을 모두 지울까요? (가져온 다이어리 원본은 남아요)",
      "ad.dataNote": "지금은 데모 모드라 데이터가 이 브라우저에만 있어요. DB를 연결할 때 이 JSON으로 그대로 이관해요.",
      "ad.done": "적용했어요", "ad.when": "시각", "ad.who": "누가", "ad.what": "무엇을",
      "ad.duty": "작성 의무", "ad.dutyOn": "있음", "ad.dutyOff": "면제", "ad.rate": "작성률", "ad.term": "학기",
      "ad.dutyHint": "시작일·끝난 날을 넣으면 그 기간만큼 목표가 비례 계산돼요 (예: 9월 입학 신입생, 졸업·퇴소한 멤버). 포닥 등은 '면제'. 목표 칸을 비우면 자동, 숫자를 넣으면 그 학기만 고정.",
      "ad.mcpTip": "태그 정리·작성 의무 설정은 관리자 본인의 Claude/Codex에 Labsidian MCP를 연결해서 말로 시킬 수도 있어요 (README 참고).",
    },
    en: {
      "ad.title": "Admin", "ad.only": "Admins only",
      "ad.tab.members": "Members", "ad.tab.tags": "Tags", "ad.tab.terms": "Terms", "ad.tab.data": "Data", "ad.tab.log": "Change log",
      "ad.name": "Name", "ad.role": "Role", "ad.reviews": "Reviews", "ad.status": "Status", "ad.pending": "Not signed in yet", "ad.active": "Active", "ad.disabled": "Disabled",
      "ad.reset": "Reset password", "ad.disable": "Disable", "ad.enable": "Enable", "ad.add": "Add member", "ad.color": "Colour", "ad.c.red": "Red", "ad.c.orange": "Orange", "ad.c.yellow": "Yellow", "ad.c.green": "Green", "ad.c.mint": "Mint", "ad.c.teal": "Teal", "ad.c.cyan": "Cyan", "ad.c.blue": "Blue", "ad.c.indigo": "Indigo", "ad.c.purple": "Purple", "ad.c.pink": "Pink", "ad.c.brown": "Brown", "ad.c.gray2": "Gray",
      "ad.tempTitle": "Temporary password", "ad.tempSub": "Give this to {name}. They'll change it on first sign-in. It won't be shown again.",
      "ad.copy": "Copy", "ad.close": "Close", "ad.exists": "That name already exists",
      "ad.axis": "Axis", "ad.ko": "Korean", "ad.en": "English", "ad.uses": "Uses", "ad.mergeInto": "Merge →", "ad.save": "Save", "ad.merge": "Merge",
      "ad.mergeConfirm": "Merge “{from}” into “{into}”? (You can undo it from the history)", "ad.newTag": "New tag",
      "ad.similar": "Possibly duplicate tags", "ad.noSimilar": "None found",
      "ad.ai": "Clean up tags with AI (your Claude · Codex)", "ad.aiHint": "Copy a prompt with the tag list into your AI, paste back its JSON to preview merge suggestions. Only ticked ones are applied.",
      "ad.aiCopy": "Copy prompt", "ad.aiPaste": "Paste the AI answer", "ad.aiPreview": "Preview", "ad.aiApply": "Apply selected merges", "ad.aiBad": "Couldn't read that JSON",
      "ad.ops": "Tag change history", "ad.undo": "Undo", "ad.domain": "Field", "ad.method": "Method", "ad.free": "Keyword",
      "ad.termLabel": "Label", "ad.start": "Start", "ad.end": "End", "ad.target": "Target", "ad.addTerm": "Add term",
      "ad.targetAuto": "auto (writing days)", "ad.offDays": "Lab days off", "ad.offHint": "Weekends and public holidays (substitute days included) never count. Add the lab's own days off — shutdowns, conferences — and targets shrink to match (leave a term's target empty to use the number of writing days). Holidays the rules can't know, like elections or one-off days, go in as 'Public holiday'.",
      "ad.autoHolidays": "Automatic public holidays {y}", "ad.noOff": "None yet — add shutdowns or conference weeks",
      "ad.kind": "Kind", "ad.kind.holiday": "Public holiday", "ad.kind.shutdown": "Shutdown", "ad.kind.event": "Conference / event", "ad.offLabel": "Name", "ad.addOff": "Add day off", "ad.remove": "Remove",
      "ad.export": "Export all changes as JSON", "ad.import": "Import JSON", "ad.resetAll": "Reset this browser's data",
      "ad.resetConfirm": "Delete all accounts, reviews and comments stored in this browser? (The imported diary stays)",
      "ad.dataNote": "Demo mode keeps data in this browser only. When the DB is connected, this JSON is migrated as-is.",
      "ad.done": "Applied", "ad.when": "When", "ad.who": "Who", "ad.what": "What",
      "ad.duty": "Diary duty", "ad.dutyOn": "Yes", "ad.dutyOff": "Exempt", "ad.rate": "Rate", "ad.term": "Term",
      "ad.dutyHint": "Start / end dates prorate the target to that period (e.g. a student joining in September, a member who graduated or left). Postdocs etc. → Exempt. Leave target empty for automatic, or set a number for that term only.",
      "ad.mcpTip": "You can also ask your own Claude/Codex to clean up tags or set duties via the Labsidian MCP server (see README).",
    },
  });

  const view = document.createElement("section");
  view.id = "view-admin"; view.className = "view page";
  document.querySelector("main").appendChild(view);
  let tab = "members", memberTerm = null;

  function render(params) {
    const me = S.auth.current();
    if (!me || me.role !== "admin") { view.innerHTML = `<div class="ui-empty">${t("ad.only")}</div>`; return; }
    tab = params.get("tab") || tab;
    const tabs = ["members", "tags", "terms", "data", "log"];
    view.innerHTML = `<div class="page-head"><h1>${t("ad.title")}</h1></div>
      <div class="ui-seg page-tabs">${tabs.map(x => `<a href="#/admin?tab=${x}" aria-current="${x === tab ? "page" : "false"}">${t("ad.tab." + x)}</a>`).join("")}</div>
      <div id="ad-body"></div>`;
    ({ members, tags, terms, data, log })[tab]($("#ad-body", view));
  }

  // ---------------- members ----------------
  async function members(el) {
    const users = (await S.users.list()).sort((a, b) => (a.role === "admin" ? -1 : 1) - (b.role === "admin" ? -1 : 1) || a.name.localeCompare(b.name));
    const terms = S.terms.list();
    const term = terms.find(x => x.id === memberTerm) || S.terms.current();
    const written = id => Object.values(UI.R).filter(r => r.person === id && r.date >= term.start && r.date <= term.end).length;
    el.innerHTML = `<div class="ui-card">
      <div class="row-between"><p class="hint">${t("ad.dutyHint")}</p>
        <label class="muted">${t("ad.term")} <select id="ad-mterm">${terms.map(x => `<option value="${x.id}" ${x.id === term.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t("ad.name")}</th><th>${t("ad.role")}</th><th>${t("ad.duty")}</th><th>${t("ad.start")}</th><th>${t("ad.end")}</th><th>${t("ad.target")}</th><th>${t("ad.rate")}</th><th>${t("ad.status")}</th><th></th></tr></thead><tbody>
      ${users.map(u => {
        const member = !!UI.P[u.id], full = S.users.get(u.id), q = member ? S.quota(u.id, term) : null, n = member ? written(u.id) : 0;
        const rate = q && !q.exempt && q.target ? Math.round(100 * n / q.target) : null;
        return `<tr data-id="${u.id}">
        <td class="nowrap">${member ? UI.avatar(u.id) : `<span class="avatar admin">A</span>`} ${esc(u.name)}</td>
        <td><select data-act="role"><option value="member" ${u.role === "member" ? "selected" : ""}>member</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option></select></td>
        <td>${member ? `<select data-f="exempt"><option value="0">${t("ad.dutyOn")}</option><option value="1" ${full.quota.exempt ? "selected" : ""}>${t("ad.dutyOff")}</option></select>` : "—"}</td>
        <td>${member ? `<input type="date" data-f="start" value="${full.quota.start || ""}">` : ""}</td>
        <td>${member ? `<input type="date" data-f="end" value="${full.quota.end || ""}">` : ""}</td>
        <td>${member ? `<input type="number" min="0" data-f="target" style="width:70px" placeholder="${q.exempt ? "—" : q.auto ?? q.target}" value="${full.quota.targets?.[term.id] ?? ""}">` : ""}</td>
        <td class="nowrap">${member ? (q.exempt ? `<span class="muted">${n} · ${t("ad.dutyOff")}</span>` : `<b class="${rate >= 90 ? "ok" : rate >= 70 ? "" : "warn"}">${rate}%</b> <span class="muted">${n}/${q.target}</span>`) : ""}</td>
        <td>${u.disabled ? t("ad.disabled") : u.pending ? `<span class="ui-pill warn">${t("ad.pending")}</span>` : t("ad.active")}</td>
        <td class="right nowrap">${member ? `<button class="ui-btn small" data-act="quota">${t("ad.save")}</button>` : ""}
          <button class="ui-btn small" data-act="reset">${t("ad.reset")}</button>
          ${u.id !== S.auth.current().id ? `<button class="ui-btn small" data-act="toggle">${u.disabled ? t("ad.enable") : t("ad.disable")}</button>` : ""}</td></tr>`;
      }).join("")}
      </tbody></table></div>
      <form class="inline-form" id="ad-add"><b>${t("ad.add")}</b>
        <input name="name" placeholder="${t("ad.name")}" required><label class="muted">${t("ad.color")} <input name="color" type="color" value="#ff9cac"></label>
        <label class="muted">${t("ad.start")} <input name="start" type="date"></label>
        <label class="check"><input name="exempt" type="checkbox"> ${t("ad.dutyOff")}</label>
        <button class="ui-btn prominent small">${t("ad.add")}</button></form></div>`;
    $("#ad-mterm", el).onchange = e => { memberTerm = e.target.value; members(el); };
    el.querySelectorAll("[data-act]").forEach(b => {
      const tr = b.closest("tr"), id = tr?.dataset.id, f = k => tr.querySelector(`[data-f="${k}"]`)?.value;
      if (b.dataset.act === "role") b.onchange = async () => { await S.users.setRole(id, b.value); LabToast(t("ad.done")); };
      if (b.dataset.act === "quota") b.onclick = async () => {
        await S.users.setQuota(id, { exempt: f("exempt") === "1", start: f("start") || null, end: f("end") || null, targets: { [term.id]: f("target") === "" ? null : +f("target") } });
        LabToast(t("ad.done")); members(el);
      };
      if (b.dataset.act === "reset") b.onclick = async () => { const r = await S.users.resetPassword(id); showTemp(users.find(u => u.id === id).name, r.tempPassword); members(el); };
      if (b.dataset.act === "toggle") b.onclick = async () => { await S.users.setDisabled(id, !users.find(u => u.id === id).disabled); members(el); };
    });
    $("#ad-add", el).onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      try {
        const r = await S.users.create({ name: f.name.value, color: f.color.value });
        if (f.start.value || f.exempt.checked) await S.users.setQuota(r.id, { start: f.start.value || null, exempt: f.exempt.checked });
        showTemp(r.name, r.tempPassword, true);
      } catch (x) { LabToast(t("ad.exists")); }
    };
  }
  function showTemp(name, pw, reload) {
    const m = LabModal(`<h2>${t("ad.tempTitle")}</h2><p class="sub">${t("ad.tempSub", { name: esc(name) })}</p>
      <div class="temp-pw"><code>${esc(pw)}</code><button class="ui-btn small" id="cp">${t("ad.copy")}</button></div>
      <div class="modal-foot"><button class="ui-btn prominent" data-close>${t("ad.close")}</button></div>`);
    m.querySelector("#cp").onclick = () => navigator.clipboard?.writeText(pw).then(() => LabToast("✓"));
    // a new member changes the dataset (people list) → rebuild after closing
    if (reload) m.addEventListener("click", e => { if (e.target.closest("[data-close]")) LabReload("#/admin?tab=members"); });
  }

  // ---------------- tags ----------------
  const axisName = a => t(a === "domain" ? "ad.domain" : a === "method" ? "ad.method" : "ad.free");
  function similarPairs(list) {
    const toks = x => new Set((x.label + " " + x.labelEn).toLowerCase().split(/[\s·&,/()\-]+/).filter(w => w.length > 1 && !["and", "the", "of"].includes(w)));
    const out = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.axis !== b.axis) continue;
      const A = toks(a), B = toks(b), inter = [...A].filter(w => B.has(w)).length;
      const jac = inter / (A.size + B.size - inter || 1);
      if (jac >= 0.34 || a.label === b.label) out.push([a, b, jac]);
    }
    return out.sort((x, y) => y[2] - x[2]).slice(0, 12);
  }
  function tags(el) {
    const usage = S.tags.usage();
    // tag colours are system colour names, so they follow the theme (data-viz.md §2); an older custom hex stays selectable
    const SYS = ["red", "orange", "yellow", "green", "mint", "teal", "cyan", "blue", "indigo", "purple", "pink", "brown", "gray2"];
    const colorSelect = (c, attr) => {
      const cur = (String(c || "").match(/var\(--([a-z0-9]+)\)/) || [, c])[1], custom = !SYS.includes(cur) && /^#/.test(cur || "");
      return `<select ${attr}>${custom ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ""}${SYS.map(n => `<option value="${n}" ${n === cur ? "selected" : ""}>${t("ad.c." + n)}</option>`).join("")}</select>`;
    };
    const list = Object.values(UI.T).sort((a, b) => a.axis.localeCompare(b.axis) || (usage[b.id] || 0) - (usage[a.id] || 0));
    const opts = (x) => list.filter(y => y.axis === x.axis && y.id !== x.id).map(y => `<option value="${esc(y.id)}">${esc(UI.tl(y))}</option>`).join("");
    const pairs = similarPairs(list);
    el.innerHTML = `<div class="ui-card"><table class="tbl tags-tbl"><thead><tr><th>${t("ad.axis")}</th><th></th><th>${t("ad.ko")}</th><th>${t("ad.en")}</th><th>${t("ad.uses")}</th><th>${t("ad.mergeInto")}</th></tr></thead><tbody>
      ${list.map(x => `<tr data-id="${esc(x.id)}"><td class="muted">${axisName(x.axis)}</td>
        <td>${colorSelect(x.color, 'data-f="color"')}</td>
        <td><input data-f="label" value="${esc(x.label)}"></td><td><input data-f="labelEn" value="${esc(x.labelEn || "")}"></td>
        <td>${usage[x.id] || 0}</td>
        <td class="nowrap"><button class="ui-btn small" data-act="save">${t("ad.save")}</button>
          <select data-f="into"><option value="">—</option>${opts(x)}</select><button class="ui-btn small" data-act="merge">${t("ad.merge")}</button></td></tr>`).join("")}
      </tbody></table>
      <form class="inline-form" id="ad-newtag"><b>${t("ad.newTag")}</b>
        <select name="axis"><option value="domain">${t("ad.domain")}</option><option value="method">${t("ad.method")}</option></select>
        <input name="label" placeholder="${t("ad.ko")}" required><input name="labelEn" placeholder="${t("ad.en")}">${colorSelect("gray2", 'name="color"')}
        <button class="ui-btn prominent small">${t("ad.newTag")}</button></form></div>
      <p class="hint">🤖 ${t("ad.mcpTip")}</p>
      <div class="me-grid">
        <div class="ui-card"><h3>${t("ad.similar")}</h3>${pairs.map(([a, b]) => `<div class="pair">
          <span class="ui-tag"><span class="dot" style="background:${a.color}"></span>${esc(UI.tl(a))} · ${usage[a.id] || 0}</span> ↔
          <span class="ui-tag"><span class="dot" style="background:${b.color}"></span>${esc(UI.tl(b))} · ${usage[b.id] || 0}</span>
          <button class="ui-btn text" data-pmerge="${esc(a.id)}|${esc(b.id)}">${(usage[a.id] || 0) < (usage[b.id] || 0) ? "→" : "←"} ${t("ad.merge")}</button></div>`).join("") || `<p class="muted">${t("ad.noSimilar")}</p>`}</div>
      </div>
      <div class="ui-card"><h3>${t("ad.ops")}</h3>${S.tags.ops().map((op, i) => `<div class="op"><code>${esc(op.op)}</code> ${esc(op.from || op.id)} ${op.into ? "→ " + esc(op.into) : op.label ? "“" + esc(op.label) + "”" : ""}
        <span class="muted">${op.at ? LabAgo(op.at) : ""}</span><button class="ui-btn text" data-undo="${i}">${t("ad.undo")}</button></div>`).reverse().join("") || `<p class="muted">—</p>`}</div>`;

    el.querySelectorAll("tbody tr").forEach(tr => {
      const id = tr.dataset.id, f = k => tr.querySelector(`[data-f="${k}"]`).value;
      tr.querySelector('[data-act="save"]').onclick = async () => { await S.tags.rename(id, f("label"), f("labelEn"), f("color")); LabReload("#/admin?tab=tags", t("ad.done")); };
      tr.querySelector('[data-act="merge"]').onclick = () => doMerge(id, f("into"));
    });
    el.querySelectorAll("[data-pmerge]").forEach(b => b.onclick = () => {
      const [a, c] = b.dataset.pmerge.split("|");
      const from = (usage[a] || 0) < (usage[c] || 0) ? a : c, into = from === a ? c : a;
      doMerge(from, into);
    });
    el.querySelectorAll("[data-undo]").forEach(b => b.onclick = async () => { await S.tags.undo(+b.dataset.undo); LabReload("#/admin?tab=tags", t("ad.done")); });
    $("#ad-newtag", el).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      await S.tags.create({ axis: f.axis.value, label: f.label.value, labelEn: f.labelEn.value || f.label.value, color: f.color.value });
      LabReload("#/admin?tab=tags", t("ad.done"));
    };
  }
  async function doMerge(from, into) {
    if (!into) return;
    if (!(await LabConfirm(t("ad.mergeConfirm", { from: UI.tl(UI.T[from]), into: UI.tl(UI.T[into]) })))) return;
    await S.tags.merge(from, into);
    LabReload("#/admin?tab=tags", t("ad.done"));
  }

  // ---------------- terms ----------------
  function terms(el) {
    const list = S.terms.list();
    el.innerHTML = `<div class="ui-card"><table class="tbl"><thead><tr><th>ID</th><th>${t("ad.termLabel")}</th><th>${t("ad.start")}</th><th>${t("ad.end")}</th><th>${t("ad.target")}</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr data-id="${esc(x.id)}"><td>${esc(x.id)}</td><td><input data-f="label" value="${esc(x.label)}"></td><td><input type="date" data-f="start" value="${x.start}"></td>
        <td><input type="date" data-f="end" value="${x.end}"></td><td><input type="number" min="1" data-f="target" value="${x.target ?? ""}" placeholder="${t("ad.targetAuto")}" style="width:120px"></td>
        <td><button class="ui-btn small" data-act="save">${t("ad.save")}</button></td></tr>`).join("")}</tbody></table>
      <form class="inline-form" id="ad-term"><b>${t("ad.addTerm")}</b><input name="id" placeholder="2027H1" required><input name="label" placeholder="2027 상반기" required>
        <input type="date" name="start" required><input type="date" name="end" required><input type="number" name="target" placeholder="${t("ad.targetAuto")}" style="width:120px">
        <button class="ui-btn prominent small">${t("ad.addTerm")}</button></form></div>
      <div class="ui-card ad-sec"><h3>${t("ad.offDays")}</h3><p class="hint">${t("ad.offHint")}</p>
        ${S.calendar.list().length ? `<table class="tbl"><thead><tr><th>${t("ad.start")}</th><th>${t("ad.end")}</th><th>${t("ad.offLabel")}</th><th>${t("ad.kind")}</th><th></th></tr></thead><tbody>
        ${S.calendar.list().map(o => `<tr data-off="${esc(o.id)}"><td>${o.start}</td><td>${o.end}</td><td>${esc(o.label)}</td><td>${t("ad.kind." + o.kind)}</td>
          <td><button class="ui-btn small" data-act="off-del">${t("ad.remove")}</button></td></tr>`).join("")}</tbody></table>` : `<p class="muted">${t("ad.noOff")}</p>`}
        <form class="inline-form" id="ad-off"><b>${t("ad.addOff")}</b><input type="date" name="start" required><input type="date" name="end">
          <input name="label" placeholder="${t("ad.offLabel")}" required><select name="kind">${["shutdown", "event", "holiday"].map(k => `<option value="${k}">${t("ad.kind." + k)}</option>`).join("")}</select>
          <button class="ui-btn prominent small">${t("ad.addOff")}</button></form>
        <p class="hint ad-holidays"><b>${t("ad.autoHolidays", { y: S.today().slice(0, 4) })}</b> · ${S.calendar.holidays(S.today().slice(0, 4))
          .filter(h => !S.calendar.isWeekend(h.date)).map(h => `${+h.date.slice(5, 7)}/${+h.date.slice(8)} ${esc(h.label)}`).join(", ")}</p></div>`;
    el.querySelectorAll('[data-act="off-del"]').forEach(b => b.onclick = async () => { await S.calendar.remove(b.closest("tr").dataset.off); terms(el); });
    $("#ad-off", el).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      try { await S.calendar.save({ start: f.start.value, end: f.end.value || f.start.value, label: f.label.value, kind: f.kind.value }); terms(el); }
      catch (x) { LabToast("⚠️ " + x.message); }
    };
    el.querySelectorAll("tbody tr[data-id]").forEach(tr => tr.querySelector("[data-act]").onclick = async () => {
      const f = k => tr.querySelector(`[data-f="${k}"]`).value;
      await S.terms.save({ id: tr.dataset.id, label: f("label"), start: f("start"), end: f("end"), target: f("target") === "" ? null : +f("target") });
      LabToast(t("ad.done"));
    });
    $("#ad-term", el).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      await S.terms.save({ id: f.id.value, label: f.label.value, start: f.start.value, end: f.end.value, target: f.target.value === "" ? null : +f.target.value });
      terms(el);
    };
  }

  // ---------------- data ----------------
  function data(el) {
    el.innerHTML = `<div class="ui-card"><p>${t("ad.dataNote")}</p><div class="btn-row">
      <button class="ui-btn" id="ad-exp">⬇ ${t("ad.export")}</button>
      <label class="ui-btn">⬆ ${t("ad.import")}<input type="file" accept=".json" id="ad-imp" hidden></label>
      <button class="ui-btn destructive" id="ad-reset">${t("ad.resetAll")}</button></div></div>`;
    $("#ad-exp", el).onclick = () => {
      const blob = new Blob([S.admin.exportJSON()], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `labsidian-${S.today()}.json`; a.click();
    };
    $("#ad-imp", el).onchange = async e => { const f = e.target.files[0]; if (!f) return; await S.admin.importJSON(await f.text()); LabReload("#/admin?tab=data", t("ad.done")); };
    $("#ad-reset", el).onclick = async () => { if (await LabConfirm(t("ad.resetConfirm"), { destructive: true })) { await S.admin.reset(); LabReload("#/home"); } };
  }

  // ---------------- log ----------------
  function log(el) {
    el.innerHTML = `<div class="ui-card"><table class="tbl"><thead><tr><th>${t("ad.when")}</th><th>${t("ad.who")}</th><th>${t("ad.what")}</th><th></th></tr></thead><tbody>
      ${S.admin.log().map(l => `<tr><td class="muted nowrap">${new Date(l.at).toLocaleString(lang === "ko" ? "ko-KR" : "en-US")}</td><td>${esc(UI.P[l.actor]?.name || l.actor || "")}</td>
        <td><code>${esc(l.action)}</code></td><td>${esc(l.detail || "")}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">—</td></tr>`}</tbody></table></div>`;
  }

  (window.LabPages ||= {}).admin = { render };
})();
