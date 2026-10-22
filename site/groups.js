/* #/group/<id> — one regular study (정기 스터디): its rhythm, place, members and every session; #/group/new — start one.
 * A session is an ordinary study with groupId. "Next session" opens the study form with the date on the group's rhythm,
 * its time and place, whose turn it is to present and the members invited. The study list shows the groups on top.
 */
(() => {
  const { t } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;
  const $ = (s, r = document) => r.querySelector(s);

  I18N.extend({
    ko: {
      "grp.title": "정기 스터디", "grp.new": "정기 스터디", "grp.newTitle": "새 정기 스터디",
      "grp.name": "이름", "grp.name.ph": "예: 최신 AI 논문 스터디", "grp.desc": "소개", "grp.desc.ph": "어떤 논문을 읽고 무엇을 이야기하는지",
      "grp.members": "참여자", "grp.cadence": "주기", "grp.every1": "매주", "grp.every2": "격주", "grp.weekday": "요일", "grp.noWeekday": "정하지 않음",
      "grp.time": "시간", "grp.place": "장소", "grp.wd": "일,월,화,수,목,금,토", "grp.rhythm": "{every} {wd}요일 {time}",
      "grp.count": "참여 {n}명", "grp.rounds": "{n}회 진행", "grp.by": "{name} 만듦", "grp.nextAt": "다음 회차 {d}", "grp.planned": "다음 예정 {d} · 발표 차례 {name}",
      "grp.join": "참여", "grp.leave": "나가기", "grp.newSession": "다음 회차 만들기", "grp.nextSession": "다음 회차",
      "grp.round": "{n}회차", "grp.notesDone": "정리 있음", "grp.presenter": "발표 {name}", "grp.noSessions": "아직 회차가 없어요. 첫 회차를 만들어 보세요.",
      "grp.sessions": "회차", "grp.manage": "관리", "grp.edit": "편집", "grp.delete": "삭제", "grp.deleteQ": "이 정기 스터디를 삭제할까요?",
      "grp.deleteMsg": "지난 회차는 단발 스터디로 남아요.", "grp.create": "만들기", "grp.save": "저장", "grp.cancel": "취소", "grp.needName": "이름을 입력해 주세요",
    },
    en: {
      "grp.title": "Regular study", "grp.new": "Regular study", "grp.newTitle": "New regular study",
      "grp.name": "Name", "grp.name.ph": "e.g. Recent AI papers", "grp.desc": "About", "grp.desc.ph": "What you read and what you talk about",
      "grp.members": "Members", "grp.cadence": "Every", "grp.every1": "Every week", "grp.every2": "Every other week", "grp.weekday": "Day", "grp.noWeekday": "Not set",
      "grp.time": "Time", "grp.place": "Place", "grp.wd": "Sun,Mon,Tue,Wed,Thu,Fri,Sat", "grp.rhythm": "{every}, {wd} {time}",
      "grp.count": "{n} members", "grp.rounds": "{n} sessions so far", "grp.by": "by {name}", "grp.nextAt": "Next session {d}", "grp.planned": "Due {d} · {name}'s turn to present",
      "grp.join": "Join", "grp.leave": "Leave", "grp.newSession": "Set up the next session", "grp.nextSession": "Next session",
      "grp.round": "Session {n}", "grp.notesDone": "Notes", "grp.presenter": "{name} presents", "grp.noSessions": "No sessions yet. Set up the first one.",
      "grp.sessions": "Sessions", "grp.manage": "Manage", "grp.edit": "Edit", "grp.delete": "Delete", "grp.deleteQ": "Delete this regular study?",
      "grp.deleteMsg": "Past sessions stay as one-off studies.", "grp.create": "Create", "grp.save": "Save", "grp.cancel": "Cancel", "grp.needName": "Please enter a name",
    },
  });

  const view = document.createElement("section");
  view.id = "view-group"; view.className = "view page";
  document.querySelector("main").appendChild(view);

  const name = id => UI.P[id]?.name || id;
  const wdName = i => t("grp.wd").split(",")[i] || "";
  const rhythm = g => { const c = g.cadence; return c ? t("grp.rhythm", { every: t("grp.every" + (c.every || 1)), wd: wdName(c.weekday), time: c.time || "" }).trim() : ""; };
  const info = g => [rhythm(g), g.place, t("grp.count", { n: g.members.length })].filter(Boolean).map(esc).join(" · ");
  const shortDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString(I18N.lang === "en" ? "en-US" : "ko-KR", { month: "short", day: "numeric", weekday: "short" }) : "";
  const back = () => `<a class="ui-btn text back" href="#/study">← ${t("st.title")}</a>`;

  // the coming session, or (none set up yet) the next date on the rhythm and whose turn it is
  function nextLine(g) {
    const up = S.groups.upcoming(g);
    if (up) return t("grp.nextAt", { d: shortDate(up.date) || t("st.noDate") }) + (up.presenter ? " · " + t("grp.presenter", { name: name(up.presenter) }) : "");
    const d = S.groups.nextDate(g);
    return d ? t("grp.planned", { d: shortDate(d), name: name(S.groups.nextPresenter(g)) }) : "";
  }
  const doneRounds = g => S.groups.sessions(g).filter(st => st.closed).length;

  // a card on the study list
  function tile(g) {
    return `<a class="ui-card grp-tile" href="#/group/${encodeURIComponent(g.id)}"><div class="grp-tile-t">${esc(g.title)}</div>
      <p class="grp-info">${[rhythm(g), doneRounds(g) && t("grp.rounds", { n: doneRounds(g) })].filter(Boolean).map(esc).join(" · ")}</p>
      ${nextLine(g) ? `<p class="grp-info">${esc(nextLine(g))}</p>` : ""}
      ${UI.avStack(g.members, 6)}</a>`;
  }

  function form(g) {
    const me = S.auth.current(), c = g?.cadence, picked = new Set(g ? g.members : [me.id]), people = Object.values(UI.P);
    return `<form class="ui-card write-form grp-form" id="grp-form" autocomplete="off">
      <label class="fld"><span>${t("grp.name")}</span><input name="title" required maxlength="120" placeholder="${t("grp.name.ph")}" value="${esc(g?.title || "")}"></label>
      <label class="fld"><span>${t("grp.desc")}</span><textarea name="desc" rows="2" placeholder="${t("grp.desc.ph")}">${esc(g?.desc || "")}</textarea></label>
      <div class="fld"><span>${t("grp.members")}</span><div class="chips" id="grp-members">
        ${people.map(p => `<button type="button" class="ui-chip" aria-pressed="${picked.has(p.id)}" data-u="${esc(p.id)}" ${p.id === (g?.owner || me.id) ? "disabled" : ""}><span class="dot" style="--c:${UI.safeColor(p.color)};background:var(--c)"></span>${esc(p.name)}</button>`).join("")}</div></div>
      <div class="grp-cad">
        <label class="fld"><span>${t("grp.cadence")}</span><select name="every"><option value="1">${t("grp.every1")}</option><option value="2" ${c?.every === 2 ? "selected" : ""}>${t("grp.every2")}</option></select></label>
        <label class="fld"><span>${t("grp.weekday")}</span><select name="weekday"><option value="">${t("grp.noWeekday")}</option>${[1, 2, 3, 4, 5, 6, 0].map(i => `<option value="${i}" ${c && c.weekday === i ? "selected" : ""}>${wdName(i)}</option>`).join("")}</select></label>
        <label class="fld"><span>${t("grp.time")}</span><input type="time" name="time" value="${esc(c?.time || "")}"></label>
        <label class="fld"><span>${t("grp.place")}</span><input name="place" maxlength="80" value="${esc(g?.place || "")}"></label></div>
      <p class="err" id="grp-err"></p>
      <div class="form-foot"><a class="ui-btn" href="${g ? "#/group/" + encodeURIComponent(g.id) : "#/study"}">${t("grp.cancel")}</a><button class="ui-btn prominent">${g ? t("grp.save") : t("grp.create")}</button></div></form>`;
  }

  function wireForm(g) {
    const f = $("#grp-form", view);
    $("#grp-members", view).onclick = e => { const c = e.target.closest(".ui-chip"); if (c && !c.disabled) c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true"); };
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.title.value.trim()) { $("#grp-err", view).textContent = t("grp.needName"); return; }
      const data = { title: f.title.value, desc: f.desc.value, place: f.place.value,
        members: [...view.querySelectorAll('#grp-members .ui-chip[aria-pressed="true"]')].map(c => c.dataset.u),
        cadence: { weekday: f.weekday.value, time: f.time.value, every: f.every.value } };
      const id = g ? (await S.groups.update(g.id, data), g.id) : await S.groups.create(data);
      location.hash = "#/group/" + encodeURIComponent(id);
    };
  }

  function page(g, me) {
    const sts = S.groups.sessions(g), next = S.groups.upcoming(g), member = S.groups.member(g), canManage = S.groups.canManage(g);
    const acts = (me && me.id !== g.owner ? `<button class="ui-btn small" id="grp-join" data-on="${member ? "0" : "1"}">${member ? t("grp.leave") : t("grp.join")}</button>` : "")
      + (!next && (member || canManage) ? `<a class="ui-btn small prominent" href="#/study/new?group=${encodeURIComponent(g.id)}">👥 ${t("grp.newSession")}</a>` : "");
    return `${back()}
      <div class="page-head row-head"><div><h1>${esc(g.title)}</h1>
          <p class="sub grp-by">${UI.avatar(g.owner)} ${t("grp.by", { name: esc(name(g.owner)) })}</p></div>
        ${canManage ? `<details class="st-manage grp-manage"><summary>⋯ ${t("grp.manage")}</summary><div class="menu-pop ui-popover">
          <a class="ui-btn text" href="#/group/${encodeURIComponent(g.id)}?edit=1">${t("grp.edit")}</a><hr><button class="ui-btn text destructive" id="grp-del">${t("grp.delete")}</button></div></details>` : ""}</div>
      ${g.desc ? `<p class="grp-desc">${esc(g.desc)}</p>` : ""}
      <div class="ui-card grp-card">
        <div class="row-between"><div><p class="grp-info">${info(g)} ${UI.avStack(g.members, 8)}</p>${!next && nextLine(g) ? `<p class="grp-info">${esc(nextLine(g))}</p>` : ""}</div>${acts ? `<div class="btn-row">${acts}</div>` : ""}</div>
        <h3>${t("grp.sessions")}</h3>
        ${sts.length ? `<ol class="grp-rounds">${sts.map((st, i) => `<li class="${st.closed ? "" : "next"}"><a class="ui-row" href="#/study/${encodeURIComponent(st.id)}${st.closed && st.notes ? "?tab=notes" : ""}">
            <span class="r">${t("grp.round", { n: i + 1 })}</span><span class="d">${esc(shortDate(st.date))}</span><span class="tt">${esc(st.title)}</span>
            <span class="m">${st.closed ? (st.notes ? `✓ ${t("grp.notesDone")}` : "") : `<span class="ui-pill accent">${t("grp.nextSession")}</span> ${st.presenter ? t("grp.presenter", { name: esc(name(st.presenter)) }) : ""}`}</span></a></li>`).join("")}</ol>`
          : `<p class="muted">${t("grp.noSessions")}</p>`}</div>`;
  }

  function render(params, arg) {
    const me = S.auth.current(); if (!me) return;
    const rerender = () => render(new URLSearchParams(location.hash.split("?")[1] || ""), arg);
    if (arg === "new") {
      view.innerHTML = `${back()}<div class="page-head"><h1>${t("grp.newTitle")}</h1></div>${form(null)}`;
      return wireForm(null);
    }
    const g = S.groups.get(arg);
    if (!g) { view.innerHTML = `${back()}<div class="ui-empty">404</div>`; return; }
    if (params.get("edit") === "1" && S.groups.canManage(g)) {
      view.innerHTML = `${back()}<div class="page-head"><h1>${esc(g.title)}</h1></div>${form(g)}`;
      return wireForm(g);
    }
    view.innerHTML = page(g, me);
    $("#grp-join", view)?.addEventListener("click", async e => { await S.groups.join(g.id, e.currentTarget.dataset.on === "1"); rerender(); });
    $("#grp-del", view)?.addEventListener("click", async () => {
      if (!(await LabConfirm(t("grp.deleteQ"), { message: t("grp.deleteMsg"), ok: t("grp.delete"), destructive: true }))) return;
      await S.groups.remove(g.id); location.hash = "#/study";
    });
  }

  window.LabGroups = { tile, rhythm };
  (window.LabPages ||= {}).group = { render };
})();
