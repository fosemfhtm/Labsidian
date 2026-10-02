/* Review footer actions: reactions, comment/question threads with @mentions, translation, reading list. */
(() => {
  const { t, lang } = window.I18N, UI = window.LabUI, S = window.Store;
  const esc = UI.esc;

  I18N.extend({
    ko: {
      "s.like": "좋아요", "s.want": "나도 읽어볼래요", "s.comments": "댓글", "s.translate": "번역", "s.edit": "수정",
      "s.addReading": "읽을 목록에 추가", "s.inReading": "읽을 목록에 있음", "s.writeThis": "이 논문 다이어리 쓰기",
      "s.kind.comment": "댓글", "s.kind.question": "질문", "s.kind.idea": "아이디어", "s.reply": "답글", "s.resolve": "해결됨으로 표시",
      "s.resolved": "해결됨", "s.reopen": "다시 열기", "s.delete": "삭제", "s.post": "남기기", "s.ph": "@이름으로 언급할 수 있어요",
      "s.noComments": "아직 댓글이 없어요. 첫 질문을 남겨보세요.", "s.translated": "번역 (브라우저 내장 번역 · 기기 안에서 처리)",
      "s.trNone": "이 브라우저에선 내장 번역을 쓸 수 없어요 (최신 Chrome 데스크톱 필요).", "s.trMcp": "MCP를 연결한 Claude/Codex에 “Labsidian에서 ‘{title}’ 리뷰 번역해줘”라고 하면 돼요.",
      "s.trLoading": "번역 중…", "s.added": "읽을 목록에 담았어요", "s.removed": "읽을 목록에서 뺐어요",
    },
    en: {
      "s.like": "Like", "s.want": "Want to read", "s.comments": "Comments", "s.translate": "Translate", "s.edit": "Edit",
      "s.addReading": "Add to reading list", "s.inReading": "In reading list", "s.writeThis": "Write a diary for this paper",
      "s.kind.comment": "Comment", "s.kind.question": "Question", "s.kind.idea": "Idea", "s.reply": "Reply", "s.resolve": "Mark resolved",
      "s.resolved": "Resolved", "s.reopen": "Reopen", "s.delete": "Delete", "s.post": "Post", "s.ph": "Mention people with @name",
      "s.noComments": "No comments yet. Ask the first question.", "s.translated": "Translation (browser built-in · on-device)",
      "s.trNone": "Built-in translation isn't available in this browser (needs recent desktop Chrome).", "s.trMcp": "Ask your MCP-connected Claude/Codex: “translate the reviews of ‘{title}’ on Labsidian”.",
      "s.trLoading": "Translating…", "s.added": "Added to reading list", "s.removed": "Removed from reading list",
    },
  });

  const me = () => S.auth.current();
  const KIND_ICON = { comment: "💬", question: "❓", idea: "💡" };

  function footer(r) {
    const re = S.reactions.get(r.id), u = me(), n = S.comments.count(r.id);
    const mine = u && (u.id === r.person || u.role === "admin");
    return `<div class="rv-foot" data-rid="${r.id}">
      <button class="rf ${u && re.like.includes(u.id) ? "on" : ""}" data-act="like" title="${t("s.like")}">👍 <span>${re.like.length || ""}</span></button>
      <button class="rf ${u && re.want.includes(u.id) ? "on" : ""}" data-act="want" title="${t("s.want")}">📚 <span class="hide-sm">${t("s.want")}</span> <span>${re.want.length || ""}</span></button>
      <button class="rf" data-act="thread">💬 <span>${n || ""}</span> <span class="hide-sm">${t("s.comments")}</span></button>
      <button class="rf" data-act="translate">🌐 <span class="hide-sm">${t("s.translate")}</span></button>
      ${mine ? `<a class="rf" href="#/write?review=${r.id}">✎ <span class="hide-sm">${t("s.edit")}</span></a>` : ""}
    </div>
    <div class="translation" hidden></div>
    <div class="thread" hidden></div>`;
  }

  // ---------- comments ----------
  const names = () => Object.values(UI.P).map(p => p.name).sort((a, b) => b.length - a.length);
  function renderBody(body) {
    let h = esc(body);
    names().forEach(nm => { const e = esc(nm); h = h.split("@" + e).join(`<span class="mention">@${e}</span>`); });
    return h.replace(/\n/g, "<br>");
  }
  async function renderThread(rid, box, focusId) {
    const list = await S.comments.list(rid), u = me(), review = UI.R[rid];
    const roots = list.filter(c => !c.parent), kids = p => list.filter(c => c.parent === p);
    const item = c => {
      const canDel = u && (u.id === c.author || u.role === "admin");
      const canResolve = u && c.kind === "question" && (u.id === c.author || u.id === review?.person || u.role === "admin");
      return `<div class="cm ${c.kind} ${c.resolved ? "resolved" : ""} ${c.id === focusId ? "flash" : ""}" data-cid="${c.id}">
        ${UI.avatar(c.author)}
        <div class="cm-main">
          <div class="cm-head"><b>${esc(UI.P[c.author]?.name || c.author)}</b>
            ${c.kind !== "comment" ? `<span class="kind">${KIND_ICON[c.kind]} ${t("s.kind." + c.kind)}</span>` : ""}
            ${c.resolved ? `<span class="kind ok">✓ ${t("s.resolved")}</span>` : ""}
            <span class="muted">${window.LabAgo(c.at)}</span></div>
          <div class="cm-body">${renderBody(c.body)}</div>
          <div class="cm-acts">
            ${!c.parent ? `<button class="link-btn" data-cact="reply">${t("s.reply")}</button>` : ""}
            ${canResolve ? `<button class="link-btn" data-cact="resolve">${c.resolved ? t("s.reopen") : t("s.resolve")}</button>` : ""}
            ${canDel ? `<button class="link-btn danger" data-cact="delete">${t("s.delete")}</button>` : ""}
          </div>
          ${!c.parent ? `<div class="cm-kids">${kids(c.id).map(item).join("")}</div>` : ""}
        </div></div>`;
    };
    box.innerHTML = (roots.map(item).join("") || `<div class="muted cm-empty">${t("s.noComments")}</div>`) + composer();
    wireComposer(box, rid, null);
  }
  function composer(parent) {
    return `<form class="cm-form" ${parent ? `data-parent="${parent}"` : ""}>
      ${parent ? "" : `<div class="seg small cm-kind">${["comment", "question", "idea"].map((k, i) => `<button type="button" data-k="${k}" class="${i ? "" : "on"}">${KIND_ICON[k]} ${t("s.kind." + k)}</button>`).join("")}</div>`}
      <div class="cm-input"><textarea rows="2" placeholder="${t("s.ph")}"></textarea><div class="mention-pop" hidden></div></div>
      <button class="btn primary small">${t("s.post")}</button></form>`;
  }
  function wireComposer(scope, rid) {
    scope.querySelectorAll(".cm-form").forEach(f => {
      if (f.dataset.wired) return; f.dataset.wired = 1;
      let kind = "comment";
      f.querySelector(".cm-kind")?.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        kind = b.dataset.k; f.querySelectorAll(".cm-kind button").forEach(x => x.classList.toggle("on", x === b));
      });
      const ta = f.querySelector("textarea"), pop = f.querySelector(".mention-pop");
      ta.addEventListener("input", () => {
        const m = ta.value.slice(0, ta.selectionStart).match(/@([^\s@]{0,12})$/);
        if (!m) { pop.hidden = true; return; }
        const q = m[1].toLowerCase(), hits = Object.values(UI.P).filter(p => p.name.toLowerCase().includes(q)).slice(0, 6);
        pop.hidden = !hits.length;
        pop.innerHTML = hits.map(p => `<div data-name="${esc(p.name)}">${UI.avatar(p.id)} ${esc(p.name)}</div>`).join("");
        pop.onclick = e => {
          const d = e.target.closest("[data-name]"); if (!d) return;
          const pos = ta.selectionStart, before = ta.value.slice(0, pos).replace(/@([^\s@]{0,12})$/, "@" + d.dataset.name + " ");
          ta.value = before + ta.value.slice(pos); pop.hidden = true; ta.focus();
        };
      });
      ta.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) f.requestSubmit(); });
      f.onsubmit = async e => {
        e.preventDefault();
        if (!ta.value.trim()) return;
        const cm = await S.comments.add({ reviewId: rid, parent: f.dataset.parent || null, kind: f.dataset.parent ? "comment" : kind, body: ta.value });
        const box = f.closest(".thread");
        await renderThread(rid, box, cm.id);
        updateCount(rid);
      };
    });
  }
  function updateCount(rid) {
    document.querySelectorAll(`.rv-foot[data-rid="${rid}"] [data-act="thread"] span:first-child`).forEach(s => (s.textContent = S.comments.count(rid) || ""));
  }
  async function openThread(rid, focusId, root = document) {
    // prefer the copy that's visible (drawer vs full page can both contain the review)
    const foots = [...root.querySelectorAll(`.rv-foot[data-rid="${rid}"]`)];
    const foot = foots.find(f => f.offsetParent) || foots[0]; if (!foot) return;
    const box = foot.parentElement.querySelector(".thread");
    box.hidden = false;
    await renderThread(rid, box, focusId);
  }

  // ---------- translation ----------
  async function translate(rid, box) {
    const r = UI.R[rid], text = [r.content, r.memo].filter(Boolean).join("\n\n");
    const ko = (text.match(/[가-힣]/g) || []).length > text.length * 0.08;
    const src = ko ? "ko" : "en", tgt = src === lang ? (src === "ko" ? "en" : "ko") : lang;
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<div class="muted">${t("s.trLoading")}</div>`;
    const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
    try {
      if ("Translator" in self) {
        const av = await self.Translator.availability({ sourceLanguage: src, targetLanguage: tgt });
        if (av !== "unavailable") {
          // the on-device model may need a download the first time — don't wait forever
          const tr = await Promise.race([self.Translator.create({ sourceLanguage: src, targetLanguage: tgt }), timeout(av === "available" ? 4000 : 15000)]);
          const out = await Promise.race([tr.translate(text), timeout(15000)]);
          box.innerHTML = `<div class="tr-h">${t("s.translated")}</div><div class="tr-body">${esc(out)}</div>`;
          return;
        }
      }
    } catch (e) { /* no on-device translator → point to the member's own AI via MCP */ }
    box.innerHTML = `<div class="tr-h">${t("s.trNone")}</div><div class="hint">${t("s.trMcp", { title: esc(UI.PA[r.paper]?.title || "") })}</div>`;
  }

  // ---------- event delegation ----------
  document.addEventListener("click", async e => {
    const btn = e.target.closest(".rv-foot .rf[data-act]");
    if (btn) {
      e.stopPropagation();
      const foot = btn.closest(".rv-foot"), rid = foot.dataset.rid, card = foot.parentElement;
      const act = btn.dataset.act;
      if (act === "like" || act === "want") {
        const re = await S.reactions.toggle(rid, act);
        btn.classList.toggle("on", re[act].includes(me().id));
        btn.querySelector("span:last-child").textContent = re[act].length || "";
        if (act === "want") LabToast(re.want.includes(me().id) ? t("s.added") : t("s.removed"));
      }
      if (act === "thread") {
        const box = card.querySelector(".thread");
        if (box.hidden) await openThread(rid); else box.hidden = true;
      }
      if (act === "translate") translate(rid, card.querySelector(".translation"));
      return;
    }
    const c = e.target.closest("[data-cact]");
    if (c) {
      const cm = c.closest(".cm"), cid = cm.dataset.cid, box = c.closest(".thread");
      const rid = box.parentElement.querySelector(".rv-foot").dataset.rid;
      if (c.dataset.cact === "reply") {
        const kidBox = cm.querySelector(".cm-kids");
        if (!kidBox.querySelector(".cm-form")) { kidBox.insertAdjacentHTML("beforeend", composer(cid)); wireComposer(kidBox, rid); }
        kidBox.querySelector("textarea").focus();
      }
      if (c.dataset.cact === "resolve") { await S.comments.resolve(cid, !cm.classList.contains("resolved")); await renderThread(rid, box); }
      if (c.dataset.cact === "delete") { await S.comments.remove(cid); await renderThread(rid, box); updateCount(rid); }
      return;
    }
    const rd = e.target.closest("[data-reading]");
    if (rd) {
      const added = await S.reading.toggle(rd.dataset.reading);
      rd.textContent = added ? "✓ " + t("s.inReading") : "📚 " + t("s.addReading");
      LabToast(added ? t("s.added") : t("s.removed"));
    }
  }, true);

  window.LabSocial = { footer, openThread };
})();
