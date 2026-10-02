/* Labsidian i18n — tiny KO/EN dictionary. t("key", {n: 3}) */
(() => {
  const DICT = {
    ko: {
      "nav.home": "홈", "nav.study": "스터디", "nav.graph": "그래프", "nav.people": "사람", "nav.papers": "논문", "nav.shared": "함께 읽은 논문",
      "search.ph": "논문·저자·키워드 검색  ( / )",
      // graph panel
      "g.find": "그래프에서 찾기", "g.find.ph": "제목·저자…", "g.colorBy": "색상 기준",
      "g.color.cluster": "주제 군집", "g.color.person": "읽은 사람", "g.color.tag": "분야 태그",
      "g.color.venue": "저널·학회", "g.color.year": "출판 연도",
      "g.filters": "필터", "g.reset": "초기화", "g.people": "사람", "g.tags": "분야", "g.methods": "방법론",
      "g.venues": "저널·학회", "g.venueType": "유형", "g.vt.journal": "저널", "g.vt.conference": "학회", "g.vt.preprint": "프리프린트",
      "g.year": "출판 연도", "g.yearUnknown": "연도 미상 포함", "g.rating": "최소 별점", "g.sharedOnly": "함께 읽은 논문만",
      "g.filterMode": "필터 방식", "g.mode.dim": "흐리게", "g.mode.hide": "숨기기",
      "g.layers": "표시", "g.l.regions": "군집 영역", "g.l.labels": "군집 이름", "g.l.people": "사람", "g.l.sim": "유사 연결선", "g.l.cite": "인용 관계",
      "g.timeline": "타임랩스 (리뷰 날짜)", "g.peopleLegend": "색 = 처음 읽은 사람", "g.all": "전체", "g.sharedRing": "흰 테두리 = 2명 이상 읽음",
      "g.total": "논문 {n}편", "g.venueSearch": "저널·학회 검색", "g.color.first": "처음 읽은 사람", "g.fit": "전체 보기", "g.settings": "표시 설정", "g.view.graph": "그래프", "g.view.map": "의미 지도",
      "g.l.readLinks": "사람–논문 연결선", "g.l.tags": "태그 노드", "g.l.timeline": "타임랩스",
      "g.physics": "물리", "g.ph.repel": "반발력", "g.ph.link": "링크 힘", "g.ph.distance": "링크 거리", "g.ph.anchor": "의미 위치 고정",
      "g.hint.graph": "노드를 끌어서 움직여보세요 · hover → 연결 강조 · 클릭 → 상세. 연결선 = 비슷한 논문(SPECTER2) · 읽은 사람 · 인용", "g.play": "재생", "g.pause": "정지",
      "g.matched": "{n} / {total}편", "g.more": "더보기", "g.less": "접기",
      "g.focus": "선택", "g.depth": "깊이", "g.clear": "해제", "g.legend": "범례",
      "g.hint": "스크롤 줌 · 드래그 이동 · 클릭 선택 · 군집 이름 클릭 → 확대",
      "g.umapNote": "논문 위치 = 제목·초록 기준 학술적 유사도(SPECTER2). 가까울수록 비슷하고, 먼 군집 사이 거리는 큰 의미 없음. 배경 영역 = 주제 군집.",
      "g.others": "기타", "g.emptyTerm": "선택한 학기에는 아직 리뷰가 없어요. 오른쪽 위 📅에서 학기를 바꿔보세요.", "g.unknown": "미상", "g.multi": "여러 명",
      // pages
      "people.title": "사람", "people.sub": "{n}명 · 리뷰 {r}개 · 논문 {p}편",
      "lab.domains": "연구실 전체 — 분야", "lab.methods": "연구실 전체 — 방법론",
      "pc.meta": "리뷰 {n}편 · 평균 ★{r}", "pc.similar": "관심사가 가장 비슷한 사람:", "pc.weekly": "주별 리뷰 수",
      "papers.title": "논문", "papers.search.ph": "이 목록에서 찾기 — 제목·저자·학회·리뷰 내용", "papers.count": "{n}편", "papers.query": " · “{q}” 검색 결과",
      "f.allTopics": "모든 주제", "f.allPeople": "모든 사람", "f.allRatings": "모든 별점", "f.r4": "★4 이상", "f.r3": "★3 이상",
      "f.recent": "최신순", "f.rating": "별점순", "f.readers": "많이 읽힌 순", "f.domains": "분야", "f.methods": "방법론",
      "papers.empty": "조건에 맞는 논문이 없어요", "papers.more": "더 보기 ({n}편 남음)",
      "shared.title": "함께 읽은 논문", "shared.sub": "두 명 이상이 리뷰한 논문 — 같은 논문, 다른 시선.",
      // drawer
      "d.reviewed": "리뷰한 논문", "d.avg": "평균 별점", "d.shared": "함께 읽은 논문", "d.domains": "관심 분야",
      "d.methods": "주로 쓰는 방법론", "d.similar": "관심사가 비슷한 사람", "d.together": "같이 {n}편",
      "d.recs": "추천 — 같은 분야에서 다른 사람이 읽은 논문", "d.none": "아직 없음",
      "d.recent": "최근 리뷰", "d.all": "전체 {n}편 보기 →",
      "d.domain": "분야", "d.method": "방법론", "d.papers": "논문", "d.readers": "읽은 사람",
      "d.who": "누가 많이 읽었나", "d.coMethods": "자주 같이 쓰인 방법론", "d.coDomains": "주로 적용된 분야",
      "d.top": "별점 높은 논문", "d.recentRead": "최근에 읽힌 논문", "d.topicAll": "이 주제 논문 전체 보기 →",
      "d.firstRead": "처음 읽힌 날", "d.reviews": "리뷰 {n}개", "d.related": "비슷한 논문",
      "d.year": "출판 연도", "d.cites": "인용 수", "d.cluster": "주제 군집", "d.abstract": "초록",
      "d.citesIn": "우리 연구실에서 읽은 논문 중 이 논문이 인용한 것",
      "d.showInGraph": "그래프에서 보기", "d.clusterPapers": "이 군집의 논문",
      "rv.expand": "펼치기", "rv.collapse": "접기", "rv.memo": "MEMO",
      "rv.late": "{n}일 늦게 등록", "rv.early": "{n}일 미리 작성", "rv.regAt": "실제 등록: {at}", "rv.diaryDate": "다이어리 날짜", "rv.pdf": "PDF", "d.pdf": "📄 PDF 보기", "d.studies": "논문 스터디", "d.studyCommon": "같이 읽은 논문", "d.studyPicked": "{names} 님이 가져온 논문", "d.studyWith": "함께 소개된 논문",
      "close": "닫기", "unknownPerson": "미상", "d.back": "뒤로", "d.fullPage": "크게 보기",
    },
    en: {
      "nav.home": "Home", "nav.study": "Study", "nav.graph": "Graph", "nav.people": "People", "nav.papers": "Papers", "nav.shared": "Read together",
      "search.ph": "Search papers, authors, keywords  ( / )",
      "g.find": "Find in graph", "g.find.ph": "Title, author…", "g.colorBy": "Color by",
      "g.color.cluster": "Topic cluster", "g.color.person": "Reader", "g.color.tag": "Field tag",
      "g.color.venue": "Venue", "g.color.year": "Year",
      "g.filters": "Filters", "g.reset": "Reset", "g.people": "People", "g.tags": "Fields", "g.methods": "Methods",
      "g.venues": "Venues", "g.venueType": "Type", "g.vt.journal": "Journal", "g.vt.conference": "Conference", "g.vt.preprint": "Preprint",
      "g.year": "Publication year", "g.yearUnknown": "Include unknown year", "g.rating": "Min rating", "g.sharedOnly": "Read by 2+ people",
      "g.filterMode": "Filter mode", "g.mode.dim": "Dim", "g.mode.hide": "Hide",
      "g.layers": "Layers", "g.l.regions": "Cluster regions", "g.l.labels": "Cluster labels", "g.l.people": "People", "g.l.sim": "Similarity links", "g.l.cite": "Citations",
      "g.timeline": "Time-lapse (review date)", "g.peopleLegend": "Colour = first reader", "g.all": "All", "g.sharedRing": "White ring = read by 2+",
      "g.total": "{n} papers", "g.venueSearch": "Search venues", "g.color.first": "First reader", "g.fit": "Fit", "g.settings": "Display settings", "g.view.graph": "Graph", "g.view.map": "Semantic map",
      "g.l.readLinks": "Reader links", "g.l.tags": "Tag nodes", "g.l.timeline": "Time-lapse",
      "g.physics": "Physics", "g.ph.repel": "Repel", "g.ph.link": "Link force", "g.ph.distance": "Link distance", "g.ph.anchor": "Semantic anchor",
      "g.hint.graph": "Drag nodes around · hover to highlight links · click for details. Links = similar papers (SPECTER2) · readers · citations", "g.play": "Play", "g.pause": "Pause",
      "g.matched": "{n} / {total} papers", "g.more": "More", "g.less": "Less",
      "g.focus": "Selected", "g.depth": "Depth", "g.clear": "Clear", "g.legend": "Legend",
      "g.hint": "Scroll to zoom · drag to pan · click to select · click a cluster label to zoom",
      "g.umapNote": "Position = scholarly similarity of title+abstract (SPECTER2). Nearby = similar; distances between far clusters are not meaningful. Background regions = topic clusters.",
      "g.others": "Others", "g.emptyTerm": "No reviews in the selected term(s) yet. Change terms with 📅 at the top right.", "g.unknown": "Unknown", "g.multi": "Multiple",
      "people.title": "People", "people.sub": "{n} members · {r} reviews · {p} papers",
      "lab.domains": "Whole lab — fields", "lab.methods": "Whole lab — methods",
      "pc.meta": "{n} reviews · avg ★{r}", "pc.similar": "Most similar interests:", "pc.weekly": "Reviews per week",
      "papers.title": "Papers", "papers.search.ph": "Filter this list — title, authors, venue, review text", "papers.count": "{n} papers", "papers.query": " · results for “{q}”",
      "f.allTopics": "All topics", "f.allPeople": "Everyone", "f.allRatings": "Any rating", "f.r4": "★4+", "f.r3": "★3+",
      "f.recent": "Most recent", "f.rating": "Top rated", "f.readers": "Most read", "f.domains": "Fields", "f.methods": "Methods",
      "papers.empty": "No papers match these filters", "papers.more": "Show more ({n} left)",
      "shared.title": "Read together", "shared.sub": "Papers reviewed by two or more people — same paper, different eyes.",
      "d.reviewed": "Reviews", "d.avg": "Avg rating", "d.shared": "Read together", "d.domains": "Fields of interest",
      "d.methods": "Methods used", "d.similar": "Similar interests", "d.together": "{n} together",
      "d.recs": "Suggested — read by others in your fields", "d.none": "Nothing yet",
      "d.recent": "Recent reviews", "d.all": "See all {n} →",
      "d.domain": "Field", "d.method": "Method", "d.papers": "Papers", "d.readers": "Readers",
      "d.who": "Who reads this most", "d.coMethods": "Common methods", "d.coDomains": "Applied to fields",
      "d.top": "Top rated", "d.recentRead": "Recently read", "d.topicAll": "All papers on this topic →",
      "d.firstRead": "First read", "d.reviews": "{n} reviews", "d.related": "Similar papers",
      "d.year": "Year", "d.cites": "Citations", "d.cluster": "Topic cluster", "d.abstract": "Abstract",
      "d.citesIn": "Lab-read papers this one cites",
      "d.showInGraph": "Show in graph", "d.clusterPapers": "Papers in this cluster",
      "rv.expand": "Expand", "rv.collapse": "Collapse", "rv.memo": "MEMO",
      "rv.late": "posted {n}d late", "rv.early": "written {n}d ahead", "rv.regAt": "Actually posted: {at}", "rv.diaryDate": "Diary date", "rv.pdf": "PDF", "d.pdf": "📄 Open PDF", "d.studies": "Paper studies", "d.studyCommon": "read together", "d.studyPicked": "brought by {names}", "d.studyWith": "Introduced alongside",
      "close": "Close", "unknownPerson": "Unknown", "d.back": "Back", "d.fullPage": "Open full page",
    },
  };
  let lang = "ko";
  try { lang = localStorage.getItem("lab.lang") || (navigator.language.startsWith("ko") ? "ko" : "en"); } catch (e) {}
  if (!DICT[lang]) lang = "ko";
  const t = (key, vars) => {
    let s = DICT[lang][key] ?? DICT.ko[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
    return s;
  };
  const setLang = l => { try { localStorage.setItem("lab.lang", l); } catch (e) {} location.reload(); };
  // static markup: <el data-i18n="key"> and <input data-i18n-ph="key">
  const apply = (root = document) => {
    root.querySelectorAll("[data-i18n]").forEach(el => (el.textContent = t(el.dataset.i18n)));
    root.querySelectorAll("[data-i18n-ph]").forEach(el => (el.placeholder = t(el.dataset.i18nPh)));
    root.querySelectorAll("[data-i18n-title]").forEach(el => (el.title = t(el.dataset.i18nTitle)));
    document.documentElement.lang = lang;
  };
  // page scripts add their own strings: I18N.extend({ ko: {...}, en: {...} })
  const extend = more => Object.keys(more).forEach(l => Object.assign(DICT[l] ||= {}, more[l]));
  window.I18N = { t, lang, setLang, apply, extend };
})();
