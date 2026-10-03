# design-kit

**맥·아이폰 앱처럼 느껴지는 웹 앱**을 위한 디자인 키트. Apple Human Interface Guidelines(HIG)를 웹으로 옮긴 토큰·컴포넌트·규칙집·검사 스크립트다.
Labsidian에서 떼어 낸 범용 부분이고, 프레임워크 없이(순수 CSS·JS) 어디에나 넣을 수 있다.

## 들어 있는 것

| 파일 | 내용 |
|---|---|
| `tokens.css` | 토큰 — 글자(데스크톱 macOS / 폰 iOS "작게"), 시스템 색 12개 + 회색, 의미 색(설정 앱 색), 간격, 둥글기, 그림자, 유리 효과, 모션, 라이트·다크·고대비·투명도 줄이기·동작 줄이기 |
| `components.css` | `ui-*` 컴포넌트 — 버튼, 세그먼트, 입력(기본 입력창 자동), 체크박스·스위치, 칩·태그·필·배지, 카드, 목록 행, 표, 메뉴·팝오버·툴팁, 알림·시트, 토스트, 빈 상태, 진행, 안내줄, 할 일 체크, 앱 껍데기(상단 바 + 폰 하단 탭 바) |
| `components.js` | `AppUI` — 테마 전환, 확인창, 시트, 토스트 |
| `specimen.html` | 견본 페이지 — 모든 토큰·컴포넌트를 라이트·다크로 나란히. 브라우저로 바로 열면 된다 |
| `docs/` | 규칙집 — `foundations` · `components` · `patterns` · `data-viz` · `writing` · `decisions` |
| `design_lint.py` | 토큰을 거치지 않은 값(px 글자 크기, hex 색, 임의 둥글기 …)이 늘어나면 실패하는 검사. 설정: `design_lint.json` (예: `design_lint.example.json`) |
| `CLAUDE.md.template` | Claude가 UI 작업 전에 규칙집을 따르게 하는 지시문 틀 |

## 시작하기

```html
<!doctype html>
<html lang="ko" data-ui data-theme="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <script>try { const t = localStorage.getItem("ui.theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (e) {}</script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="design-kit/tokens.css">
  <link rel="stylesheet" href="design-kit/components.css">
  <link rel="stylesheet" href="app.css">          <!-- 내 페이지 CSS: 배치(그리드·폭·간격)만 -->
</head>
<body>
  <header class="ui-topbar">
    <a class="brand" href="#">My App</a>
    <nav class="ui-nav">
      <a href="#" aria-current="page"><i data-lucide="house" class="ic"></i><span>홈</span></a>
      <a href="#"><i data-lucide="file-text" class="ic"></i><span>문서</span></a>
    </nav>
    <span class="spacer"></span>
    <button class="ui-btn prominent small"><i data-lucide="plus" class="ic"></i>새로 만들기</button>
  </header>
  <main class="ui-main">
    <section class="ui-card"><h3 class="t-title3">카드 제목</h3><p>본문</p></section>
  </main>
  <script defer src="https://cdn.jsdelivr.net/npm/lucide@1.49.0/dist/umd/lucide.min.js" onload="lucide.createIcons()"></script>
  <script src="design-kit/components.js"></script>
</body>
</html>
```

- 폰(760px 이하)에서는 `.ui-nav`가 자동으로 아래 탭 바가 되고, 글자가 iOS 크기로 바뀐다.
- 컴포넌트 선택자는 `:where([data-ui]) .ui-x`라 우선순위가 클래스 하나와 같다. 내 CSS를 **키트 뒤에** 불러오면 `.my-list { display: grid; … }` 한 줄로 배치를 바꿀 수 있다.
- 상태는 `.on` 대신 `aria-pressed` / `aria-current`로 표시한다.

```js
AppUI.setTheme("dark");                                       // "auto" | "light" | "dark" — window "app:theme" 이벤트
if (await AppUI.confirm("이 항목을 삭제할까요?", { message: "되돌릴 수 없어요.", ok: "삭제", destructive: true })) { … }
const s = AppUI.sheet(`<input class="ui-field"><div class="acts"><button class="ui-btn" data-close>취소</button><button class="ui-btn prominent">저장</button></div>`);
AppUI.toast("저장했어요", { undo: () => { … } });
AppUI.back("#/projects");                                     // 방문 기록이 없으면 이 주소로
```

## 내 프로젝트에 맞추기

- **강조색**: `tokens.css`의 `--accent-rgb: var(--indigo);` 한 줄. 시스템 색 이름(`blue`, `teal` …) 중에서 고른다. 링크도 이 색을 쓴다.
- **글꼴**: Apple 기기는 시스템 글꼴(SF)로, 그 외에는 Pretendard로 보인다. 다른 글꼴은 `--font`.
- **규칙**: `docs/writing.md`의 용어집과 `docs/decisions.md`의 "프로젝트 결정"을 채운다. 키트 규칙과 다르게 정한 것은 이유와 함께 거기 적는다.
- **Claude**: `CLAUDE.md.template`을 프로젝트의 `CLAUDE.md`에 붙이고 경로를 맞춘다.

## 이미 있는 프로젝트에 들일 때

1. `tokens.css` → `components.css` → 기존 CSS 순서로 불러온다. 기존 화면은 대부분 그대로 보인다.
2. `design_lint.json`을 만들고 `python design-kit/design_lint.py`를 한 번 돌린다. 지금 개수가 **기준선**이 된다.
3. 새 코드는 토큰과 `ui-*`만 쓴다 → 검사가 늘어나는 것을 막는다.
4. 화면을 하나씩 옮기면서 개수를 줄이고 `--update`로 기준선을 낮춘다.

## 쓸 수 없는 것 (라이선스)

| 항목 | 이유 | 대신 |
|---|---|---|
| SF Pro · SF Mono · New York 폰트 파일 | Apple Font License — 웹폰트로 올리기 금지 | CSS `-apple-system` / `system-ui` (Apple 기기에서 SF로 그려짐), 그 외 Pretendard (OFL) |
| SF Symbols | Apple 플랫폼 앱·시안 전용 | Lucide (ISC) |
| Apple 로고·UI 키트 이미지, apple.com 디자인 흉내 | 상표 가이드라인 | HIG 규칙을 따른 고유 디자인 |

## Labsidian과의 관계

이 키트는 Labsidian(`site/tokens.css`, `docs/design/`)에서 범용 부분만 떼어 낸 **복사본**이다. 두 쪽은 자동으로 맞춰지지 않는다.
한쪽에서 규칙을 바꾸면 다른 쪽에도 옮겨야 한다.
