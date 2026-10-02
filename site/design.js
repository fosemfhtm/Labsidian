/* #/design — specimen of the Apple-HIG redesign (docs/DESIGN.md, P0).
 * Every token and component, rendered side by side in light and dark (and increased contrast) so it can be
 * reviewed before it is applied to the real pages. Uses only tokens.css ([data-ui] scope) + Lucide icons.
 */
(() => {
  const view = document.createElement("section");
  view.id = "view-design"; view.className = "view page wide";
  document.querySelector("main").appendChild(view);

  const I = (name, cls = "") => `<i data-lucide="${name}" class="ic ${cls}"></i>`;
  const SYS = ["red", "orange", "yellow", "green", "mint", "teal", "cyan", "blue", "indigo", "purple", "pink", "brown"];
  const GRAYS = ["gray", "gray2", "gray3", "gray4", "gray5", "gray6"];
  const SEM = [["label", "글자"], ["label-2", "보조 글자"], ["label-3", "3차 글자"], ["label-4", "비활성"], ["sys-bg", "바탕"], ["sys-bg-2", "카드"], ["sys-bg-3", "떠 있는 면"],
    ["separator", "구분선"], ["fill", "채우기 1"], ["fill-2", "채우기 2"], ["fill-3", "채우기 3"], ["fill-4", "채우기 4"], ["accent", "강조(Indigo)"], ["link", "링크"]];
  const TYPE = [["large-title", "Large Title", "34/41 Bold", "논문 스터디"], ["title1", "Title 1", "28/34 Bold", "Drive Like a Human"], ["title2", "Title 2", "22/28 Bold", "다이어리 비교"],
    ["title3", "Title 3", "20/25 Semibold", "질문 보드"], ["headline", "Headline", "17/22 Semibold", "예시 멤버 · ★★★★"], ["body", "Body", "17/22", "긴 구간을 굴릴수록 물리·기하 일관성이 무너지고 오차가 쌓인다."],
    ["callout", "Callout", "16/21", "입력창 · 버튼 글자"], ["subhead", "Subhead", "15/20", "목록 보조 정보 · 탭"], ["footnote", "Footnote", "13/18", "2026-10-02 · 7일 늦게 등록"],
    ["caption1", "Caption 1", "12/16", "배지 · 칩"], ["caption2", "Caption 2", "11/13", "그래프 라벨 (최소 크기)"]];
  const av = (n, c, size = 28) => `<span class="sp-av" style="width:${size}px;height:${size}px;background:rgb(var(--${c}))">${n.slice(-2)}</span>`;

  function gallery() {
    return `
    <section><h2 class="t-title2">글자 · Typography</h2>
      <p class="t-footnote c-2">iOS 텍스트 스타일(기본 크기). 글꼴: Apple 기기는 SF + Apple SD Gothic Neo, 그 외 Pretendard.</p>
      <div class="ui-list">${TYPE.map(([k, n, spec, ex]) => `<div class="ui-row sp-type"><span class="sp-k t-caption1 c-2">${n}<br>${spec}</span><span class="t-${k} grow">${ex}</span></div>`).join("")}</div>
    </section>

    <section><h2 class="t-title2">색 · Color</h2>
      <p class="ui-list-h">시스템 색</p>
      <div class="sp-swatches">${SYS.map(c => `<div><span style="background:rgb(var(--${c}))"></span><b class="t-caption1">${c}</b></div>`).join("")}</div>
      <p class="ui-list-h">회색</p>
      <div class="sp-swatches">${GRAYS.map(c => `<div><span style="background:rgb(var(--${c}))"></span><b class="t-caption1">${c}</b></div>`).join("")}</div>
      <p class="ui-list-h">의미 색</p>
      <div class="sp-swatches sem">${SEM.map(([k, n]) => `<div><span style="background:var(--${k})"></span><b class="t-caption1">${n}</b><i class="t-caption2 c-3">--${k}</i></div>`).join("")}</div>
    </section>

    <section><h2 class="t-title2">버튼 · Buttons</h2>
      <p class="t-footnote c-2">한 화면에 눈에 띄는 버튼은 1–2개. 우선순위는 크기가 아니라 스타일로. 위험한 동작은 주요 버튼으로 두지 않는다.</p>
      <div class="sp-row">
        <button class="ui-btn prominent">${I("pen-line")}다이어리 쓰기</button>
        <button class="ui-btn">${I("users")}참가하기</button>
        <button class="ui-btn plain">더 보기</button>
        <button class="ui-btn destructive">${I("trash-2")}삭제</button>
        <button class="ui-btn" disabled>비활성</button>
      </div>
      <div class="sp-row">
        <button class="ui-btn prominent large">스터디 열기</button>
        <button class="ui-btn small">${I("plus")}질문</button>
        <button class="ui-btn icon" aria-label="알림">${I("bell")}</button>
        <button class="ui-btn prominent is-loading" data-demo="loading">게시하는 중…</button>
      </div>
    </section>

    <section><h2 class="t-title2">세그먼트 · 칩 · 배지</h2>
      <div class="sp-row"><div class="ui-seg" data-demo="seg"><button aria-pressed="true">준비</button><button>다이어리</button><button>소개 순서</button><button>정리</button></div></div>
      <div class="sp-row">${["교통 예측", "자율주행", "강화학습", "월드모델"].map((x, i) => `<button class="ui-chip" aria-pressed="${i === 1}" data-demo="chip"><span class="dot" style="background:rgb(var(--${SYS[i * 3]}))"></span>${x}</button>`).join("")}
        <span class="sp-badge-demo">${I("bell")}<span class="ui-badge">3</span></span><span class="ui-badge">12</span></div>
    </section>

    <section><h2 class="t-title2">입력 · Fields</h2>
      <div class="sp-grid2">
        <div><label class="ui-label">논문 제목</label><input class="ui-field" placeholder="DOI · 링크 · 제목으로 찾기"></div>
        <div><label class="ui-label">검색</label><div class="ui-search">${I("search")}<input class="ui-field" placeholder="논문·저자·리뷰 검색"></div></div>
        <div class="span2"><label class="ui-label">Memo (critic)</label><textarea class="ui-field" rows="3" placeholder="한계, 가정, 내 연구와의 연결…"></textarea></div>
      </div>
      <div class="sp-row"><label class="ui-check"><input type="checkbox" checked>먼저 쓰고 보기</label><label class="ui-check"><input type="checkbox">각자 관련 논문 1편씩</label></div>
    </section>

    <section><h2 class="t-title2">목록 · Inset grouped list</h2>
      <p class="ui-list-h">다가오는 스터디</p>
      <div class="ui-list">
        <a class="ui-row has-icon" href="javascript:void 0"><span class="tile" style="background:rgb(var(--indigo))">${I("book-open")}</span><span class="grow">Drive Like a Human<div class="sub">10월 3일 (토) 14:00 · 세미나실</div></span><span class="t-footnote c-2">D-1</span>${I("chevron-right", "chev")}</a>
        <a class="ui-row has-icon" href="javascript:void 0"><span class="tile" style="background:rgb(var(--orange))">${I("users")}</span><span class="grow">World Models<div class="sub">날짜 미정 · 3명</div></span>${I("chevron-right", "chev")}</a>
        <div class="ui-row has-icon"><span class="tile" style="background:rgb(var(--green))">${I("bell-ring")}</span><span class="grow">D-1 알림</span><input type="checkbox" class="ui-switch" checked></div>
      </div>
      <p class="ui-list-f">스위치는 목록 행 안에서만 (HIG).</p>
    </section>

    <section><h2 class="t-title2">내 준비 (체크리스트)</h2>
      <div class="ui-list">${[["같이 읽는 논문 다이어리 쓰기", 1], ["가져올 논문 올리기", 1], ["가져온 논문 다이어리 쓰기", 0], ["궁금한 점 올리기 (선택)", 0]].map(([x, d]) =>
        `<button class="ui-row sp-todo ${d ? "done" : ""}" data-demo="todo"><span class="sp-circle">${d ? I("check") : ""}</span><span class="grow">${x}</span>${d ? "" : I("chevron-right", "chev")}</button>`).join("")}</div>
    </section>

    <section><h2 class="t-title2">리뷰 카드 (콘텐츠 층 — 유리 없음)</h2>
      <article class="ui-card sp-review">
        <div class="sp-rv-head">${av("예시", "red", 36)}<div class="grow"><div class="t-headline">예시 멤버</div><div class="t-footnote c-2"><span class="sp-stars">★★★★<span>★</span></span> · 2026-09-25 · <span class="sp-pill warn">7일 늦게 등록</span></div></div>
          <button class="ui-btn plain icon" aria-label="더 보기">${I("ellipsis")}</button></div>
        <a class="t-headline sp-paper" href="javascript:void 0">STAGE: A Stream-Centric Generative World Model for Long-Horizon Driving-Scene Simulation</a>
        <p class="t-body">긴 구간 생성에서 장면 전체를 매 프레임 다시 만드는 대신, 스트림 단위로 상태를 이어 붙여 일관성을 유지한다.</p>
        <div class="sp-memo"><span class="t-caption1">MEMO</span><p class="t-subhead">길게 굴릴수록 물리·기하 일관성이 무너지고 오차가 쌓이는 문제는 여전하다.</p></div>
        <div class="sp-row tight">${["월드모델", "생성 모델"].map((x, i) => `<span class="ui-chip"><span class="dot" style="background:rgb(var(--${["teal", "purple"][i]}))"></span>${x}</span>`).join("")}</div>
        <div class="sp-actions"><button class="ui-btn plain small neutral">${I("thumbs-up")}3</button><button class="ui-btn plain small neutral">${I("bookmark-plus")}나도 읽어볼래요</button>
          <button class="ui-btn plain small neutral">${I("message-circle")}2</button><button class="ui-btn plain small neutral">${I("languages")}번역</button></div>
      </article>
    </section>

    <section><h2 class="t-title2">머티리얼 · 툴바 · 메뉴 (내비게이션 층 — Liquid Glass)</h2>
      <p class="t-footnote c-2">유리는 컨트롤·내비게이션에만, 화면 가장자리에서 떨어져 떠 있는 캡슐로. 색은 주요 동작 하나(쓰기)에만.</p>
      <div class="sp-glass-stage">
        <div class="sp-glass-bg">${Array.from({ length: 18 }, (_, i) => `<span style="background:rgb(var(--${SYS[i % 12]}))"></span>`).join("")}</div>
        <div class="ui-toolbar">
          <div class="zone"><span class="ui-glass-group ui-glass sp-brand"><span class="sp-logo"></span><span class="title">Labsidian</span></span></div>
          <div class="zone mid"><span class="ui-glass-group ui-glass">${["홈", "그래프", "논문", "스터디"].map((x, i) => `<button class="ui-btn small ${i ? "" : "sp-on"}">${x}</button>`).join("")}</span></div>
          <div class="zone"><span class="ui-glass-group ui-glass"><button class="ui-btn icon" aria-label="검색">${I("search")}</button><span class="sp-badge-demo">${I("bell")}<span class="ui-badge">2</span></span></span>
            <button class="ui-btn glass prominent">${I("pen-line")}쓰기</button></div>
        </div>
        <div class="sp-under t-body">${"스크롤되는 콘텐츠가 유리 아래로 비쳐 보여요. ".repeat(6)}</div>
        <div class="ui-menu ui-glass strong sp-menu-demo">
          <button>${I("calendar")}일정·장소 수정…</button><button>${I("eye-off")}먼저 쓰고 보기</button><hr>
          <button>${I("circle-check")}스터디 마치기</button><hr><button class="destructive">${I("trash-2")}삭제</button>
        </div>
      </div>
    </section>

    <section><h2 class="t-title2">알림 · 시트</h2>
      <p class="t-footnote c-2">확인창은 버튼 최대 3개, "취소"는 왼쪽·실행은 오른쪽. 폰에서 시트는 아래에서 올라옴.</p>
      <div class="sp-row"><button class="ui-btn" data-demo="alert">${I("triangle-alert")}알림 열기</button><button class="ui-btn" data-demo="sheet">${I("panel-bottom-open")}시트 열기</button></div>
    </section>

    <section><h2 class="t-title2">진행 · 빈 상태 · 토스트</h2>
      <div class="sp-row"><div class="ui-progress" style="width:220px"><i style="width:62%"></i></div><span class="t-footnote c-2 num">PDF 올리는 중 · 62%</span><div class="ui-spinner"></div></div>
      <div class="ui-card ui-empty">${I("notebook-pen")}<h4>아직 정리 노트가 없어요</h4><p>모임이 끝나면 누구든 정리해 주세요. 남은 질문은 질문 보드에서 가져올 수 있어요.</p><button class="ui-btn prominent">${I("pen-line")}정리 쓰기</button></div>
      <div class="sp-row"><span class="ui-toast ui-glass">${I("circle-check")}게시했어요 <button class="ui-btn plain small">실행 취소</button></span></div>
    </section>

    <section><h2 class="t-title2">간격 · 모서리</h2>
      <div class="sp-row">${[4, 8, 12, 16, 20, 24, 32, 44].map(n => `<span class="sp-space"><i style="width:${n}px;height:${n}px"></i><b class="t-caption2 c-2">${n}</b></span>`).join("")}</div>
      <div class="sp-row">${[["시트", 20], ["카드", 14], ["컨트롤", 10], ["칩", 999]].map(([n, r]) => `<span class="sp-radius" style="border-radius:${Math.min(r, 28)}px"><b class="t-caption1">${n} ${r === 999 ? "완전" : r}</b></span>`).join("")}</div>
      <p class="t-footnote c-2">동심원 규칙: 안쪽 반지름 = 바깥 반지름 − 여백 (예: 카드 14 · 여백 4 → 안쪽 10).</p>
    </section>`;
  }

  const mode = { view: "side", contrast: "normal", transparency: "normal" };
  function panel(theme) {
    return `<div class="sp-panel" data-ui data-theme="${theme}" data-contrast="${mode.contrast === "more" ? "more" : ""}" data-transparency="${mode.transparency === "reduce" ? "reduce" : ""}">
      <div class="sp-panel-h t-footnote c-2">${{ light: "라이트", dark: "다크", auto: "자동 (기기 설정)" }[theme]}${mode.contrast === "more" ? " · 고대비" : ""}</div>${gallery()}</div>`;
  }
  function render() {
    const themes = mode.view === "side" ? ["light", "dark"] : [mode.view];
    view.innerHTML = `
      <div class="page-head"><h1>디자인 견본</h1><p class="sub">Apple HIG 기반 리뉴얼 (docs/DESIGN.md P0). 아직 실제 화면에는 적용되지 않았어요.</p></div>
      <div class="sp-controls" data-ui data-theme="dark">
        <div class="ui-seg" data-k="view">${[["side", "나란히"], ["light", "라이트"], ["dark", "다크"], ["auto", "자동"]].map(([v, n]) => `<button data-v="${v}" aria-pressed="${mode.view === v}">${n}</button>`).join("")}</div>
        <div class="ui-seg" data-k="contrast">${[["normal", "표준 대비"], ["more", "고대비"]].map(([v, n]) => `<button data-v="${v}" aria-pressed="${mode.contrast === v}">${n}</button>`).join("")}</div>
        <div class="ui-seg" data-k="transparency">${[["normal", "투명 효과"], ["reduce", "투명도 줄이기"]].map(([v, n]) => `<button data-v="${v}" aria-pressed="${mode.transparency === v}">${n}</button>`).join("")}</div>
      </div>
      <div class="sp-panels ${themes.length > 1 ? "two" : ""}">${themes.map(panel).join("")}</div>`;
    view.querySelectorAll(".sp-controls .ui-seg button").forEach(b => (b.onclick = () => { mode[b.closest(".ui-seg").dataset.k] = b.dataset.v; render(); }));
    view.querySelectorAll('[data-demo="seg"] button').forEach(b => (b.onclick = () => b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b))));
    view.querySelectorAll('[data-demo="chip"]').forEach(b => (b.onclick = () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true")));
    view.querySelectorAll('[data-demo="todo"]').forEach(b => (b.onclick = () => { b.classList.toggle("done"); b.querySelector(".sp-circle").innerHTML = b.classList.contains("done") ? I("check") : ""; window.lucide?.createIcons(); }));
    view.querySelectorAll('[data-demo="alert"]').forEach(b => (b.onclick = () => overlay(b, `<div class="ui-alert ui-glass strong"><h3>스터디를 삭제할까요?</h3><p>질문과 정리 노트도 함께 지워지고 되돌릴 수 없어요.</p>
      <div class="acts"><button class="ui-btn neutral" data-close>취소</button><button class="ui-btn destructive" data-close>삭제</button></div></div>`)));
    view.querySelectorAll('[data-demo="sheet"]').forEach(b => (b.onclick = () => overlay(b, `<div class="ui-sheet"><header><button class="ui-btn plain" data-close>취소</button><span class="t">일정·장소 수정</span><span class="r"><button class="ui-btn plain" data-close><b>완료</b></button></span></header>
      <div class="body"><div><label class="ui-label">날짜</label><input class="ui-field" type="date" value="2026-10-03"></div><div><label class="ui-label">장소</label><input class="ui-field" value="세미나실"></div>
      <div><label class="ui-label">소개 · 읽을 범위</label><textarea class="ui-field" rows="3">3장까지 읽어오기</textarea></div></div></div>`, "sheet")));
    window.lucide?.createIcons();
  }
  function overlay(btn, html, kind = "") {
    const host = btn.closest("[data-ui]");
    const s = document.createElement("div");
    s.className = "ui-scrim " + kind; s.setAttribute("data-ui", ""); s.dataset.theme = host.dataset.theme; s.dataset.contrast = host.dataset.contrast; s.dataset.transparency = host.dataset.transparency;
    s.style.background = "rgb(0 0 0 / .32)"; s.innerHTML = html;
    s.onclick = e => { if (e.target === s || e.target.closest("[data-close]")) s.remove(); };
    document.body.appendChild(s); window.lucide?.createIcons();
  }

  (window.LabPages ||= {}).design = { render };
})();
