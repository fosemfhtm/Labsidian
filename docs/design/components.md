# 컴포넌트 — Components

각 컴포넌트는 **언제 쓰나 · 규칙 · 코드 · 지금 → 옮기기** 순서로 적는다.
코드의 `ui-*` 클래스는 `site/tokens.css`에 있고, 모양은 `#/design` 견본 페이지에서 볼 수 있다.
각 절의 "옛 클래스" 표는 2026-10-03에 옮긴 기록이다. 옛 이름이 배치용 고리로 남아 있는 곳(예: `.tp-row`)은 칸 배치만 맡는다.

**우선순위 규칙**: 컴포넌트 선택자는 `:where([data-ui]) .ui-x`라서 우선순위가 클래스 하나와 같고, `tokens.css`가 다른 CSS보다 먼저 불린다.
그래서 페이지 CSS의 `.내-행 { display: grid; … }` 한 줄로 컴포넌트의 배치를 바꿀 수 있다. `!important`나 선택자 늘리기를 쓰지 않는다.

> 크기는 데스크톱(macOS) 기준으로 적었다. 폰에서는 [foundations.md §8](foundations.md#8-컨트롤-크기와-누르기-영역)에 따라 44로 커진다.

목차: [버튼](#1-버튼) · [링크와 뒤로](#2-링크와-뒤로) · [세그먼트](#3-세그먼트-컨트롤) · [입력](#4-입력) · [체크박스·스위치](#5-체크박스스위치할-일-체크) · [태그·칩·필·배지](#6-태그칩필배지) · [아바타](#7-아바타) · [별점](#8-별점) · [카드](#9-카드) · [목록](#10-목록과-행) · [표](#11-표) · [다이어리 카드](#12-다이어리-카드) · [메뉴](#13-메뉴) · [팝오버·툴팁](#14-팝오버와-툴팁) · [알림](#15-알림-확인창) · [시트](#16-시트모달) · [서랍](#17-서랍인스펙터) · [토스트](#18-토스트) · [안내줄](#19-안내줄) · [빈 상태](#20-빈-상태) · [불러오는 중·진행](#21-불러오는-중과-진행) · [검색](#22-검색) · [대응표 요약](#옛-클래스--목표-컴포넌트-요약)

---

## 1. 버튼

**언제**: 동작을 실행할 때. 다른 화면으로 *이동*만 하면 링크(§2)를 쓴다.

**역할과 모양**

| 역할 | 클래스 | 모양 | 쓰는 곳 |
|---|---|---|---|
| 기본 | `.ui-btn` | 회색 채움(fill-3) + 검정 글자 (macOS 푸시 버튼) | 대부분의 동작, 취소 |
| 주요 | `.ui-btn.prominent` | 강조색 채움 + 흰 글자 | 화면의 **가장 중요한 동작 하나** (게시, 저장, 참가) |
| 파괴 | `.ui-btn.destructive` | 회색 채움 + 빨간 글자 | 삭제. **주요(prominent)로 만들지 않는다** |
| 테두리 없음 | `.ui-btn.plain` | 바탕 없음 | 카드 꼬리의 반응 버튼, "더 불러오기", 툴바 안 |
| 글자 | `.ui-btn.text` | 링크 색 글자, 여백 없음, 문장 안에 들어감 | "펼치기", "모두 읽음", 문장 끝의 "편집" |
| 켜짐 | `[aria-pressed="true"]` | 강조색 글자 + 강조색 12% 바탕 | 좋아요·투표처럼 켜고 끄는 버튼 |
| 유리 | `.ui-btn.glass` | 유리 캡슐 | 상단 바·그래프 위 컨트롤에만 |

**크기**: `.small` 22 · 보통 28 · `.large` 34. 아이콘만: `.icon` (정사각형).

**규칙**
- 한 화면에 주요 버튼은 1개, 많아야 2개. 우선순위는 **크기가 아니라 스타일**로 나타낸다 **[HIG]**.
- 짝을 이룰 때: **취소는 앞(왼쪽), 실행은 뒤(오른쪽)** **[HIG]**.
- 라벨은 동작어 ([writing.md §3](writing.md#3-동작어-표)). 눌렀을 때 입력이 더 필요한 창이 열리면 끝에 "…"를 붙인다 — "일정 수정…" **[HIG macOS]**.
- 아이콘은 글자 앞에 둔다. 아이콘만 있는 버튼은 `aria-label` + `title` 필수.
- 처리 중에는 버튼 안에 스피너 + 진행형 문구: `.is-loading` + "게시하는 중…". 처리 중엔 다시 누를 수 없다.
- 비활성(`disabled`)은 이유가 보일 때만 쓴다. 이유가 안 보이면 활성으로 두고 누르면 무엇이 빠졌는지 알려 준다.
- 버튼에 `margin`을 넣지 않는다. 간격은 부모(`.ui-row`, `gap`)가 정한다.

```html
<button class="ui-btn prominent"><i data-lucide="pen-line" class="ic"></i>다이어리 쓰기</button>
<button class="ui-btn">취소</button>
<button class="ui-btn destructive"><i data-lucide="trash-2" class="ic"></i>삭제</button>
<button class="ui-btn plain icon" aria-label="더 보기" title="더 보기"><i data-lucide="ellipsis" class="ic"></i></button>
```

**옛 클래스 (2026-10-03 옮김)**

| 옛 클래스 | 지금 |
|---|---|
| `.btn` | `.ui-btn` (style.css의 `margin-top:12px`과 이를 지우는 20여 개 규칙도 함께 삭제) |
| `.btn.primary` | `.ui-btn.prominent` |
| `.btn.danger` | `.ui-btn.destructive` |
| `.btn.small` / `.btn.wide` | `.ui-btn.small` / `.ui-btn.large` |
| `.btn.ghost` (reading.js, **CSS 정의 없음**) | `.ui-btn.plain` |
| `.rf` (다이어리 꼬리 버튼) | `.ui-btn.plain.small` |
| `.icon-btn`, `.drawer-btn`, `.drawer-close`, `.play`, `.search-btn` | `.ui-btn.icon` (+ `.plain`) |
| `.tb-btn` (그래프 툴바) · 그래프 모서리 `.icon-btn` | `.ui-btn.glass` (+ `.g-filter` 배치 고리) · `.ui-btn.glass.icon` |
| `.term-btn`, `.user-btn`, 알림·검색 버튼 | 상단 바 컴포넌트의 일부로 둠 (`.top-icon` 등, patterns §1) |
| `.more` ("더 불러오기") | `.ui-btn.plain` 가운데 정렬 |
| `.st-q .vote` | `.ui-btn.small` + `aria-pressed` |
| 버튼으로 쓰는 `.chip` | 토글이면 `.ui-chip[aria-pressed]`, 동작이면 `.ui-btn.small` |

---

## 2. 링크와 뒤로

- **문장 안 링크**: `a.link` — `--link-text` 색, 호버에 밑줄.
- **목록·카드 전체가 링크**: 카드나 행을 `<a>`로 감싸고 호버에 바탕색만 바꾼다. 글자를 파랗게 칠하지 않는다.
- **글자 버튼처럼 보이는 동작**(접기·펼치기, "모두 보기"): `.ui-btn.text`.
- **뒤로**: 상세 페이지 왼쪽 위에 하나, `.ui-btn.text.back`. 이전 화면으로 돌아가면 "← 뒤로"(`LabBack(대신 갈 주소)`), 정해진 상위 화면으로 가면 그 이름("← 논문 스터디").

---

## 3. 세그먼트 컨트롤

**언제**: 같은 화면 안에서 보기를 바꿀 때 (홈 피드 탭, 스터디 탭, 논문/분야/가이드, 관리 탭, 차트 기준 전환).

**규칙** **[HIG]**
- 5개 이하. 각 칸은 같은 너비. 라벨은 짧은 명사 (아이콘만 쓰면 모두 아이콘만).
- 개수를 보여줄 때는 라벨 뒤에 회색 숫자 — "질문 3".
- 선택은 `aria-pressed="true"` (버튼) 또는 `aria-current="page"` (링크).
- 다른 페이지로 *이동*하는 탭도 같은 모양을 쓴다 (주소가 바뀌는 탭은 `<a>`).

```html
<div class="ui-seg"><button aria-pressed="true">준비</button><button>다이어리</button><button>정리</button></div>
```

| 옛 클래스 | 지금 |
|---|---|
| `.tabs` + `a.on` (features 밑줄 탭 → apple에서 세그먼트로 덮어씀) | `.ui-seg` + `<a aria-current>` |
| `.feed-tabs` | `.ui-seg` (상단 바 아래 고정은 페이지 배치에서) |
| `.seg` + `button.on`, `.seg.small` (두 번 정의됨) | `.ui-seg` / `.ui-seg.small` |

---

## 4. 입력

**종류**: 글 입력(`input`), 여러 줄(`textarea`), 선택(`select` = macOS의 팝업 버튼), 날짜·시간, 검색(§22), 태그 입력, 파일 놓기.

**규칙**
- 라벨은 입력창 **위**에 (`.ui-label`, Callout · label-2) **[결정]**. 플레이스홀더로 라벨을 대신하지 않는다.
- 플레이스홀더는 예시나 범위 — "예: 세미나실, Zoom", "논문·사람·스터디 검색".
- 도움말은 입력창 아래 Callout · `--label-meta`. 오류는 같은 자리에 `--danger` + 무엇을 고칠지.
- 높이: 데스크톱 28 · 폰 44. 글자: `--t-body`.
- 바탕 `--fill-4`, 테두리 없음, 포커스에 강조색 링.
- **모든 기본 입력창(`input`·`textarea`·`select`)이 자동으로 이 모양이다** (`tokens.css`의 우선순위 0 규칙). 클래스를 붙이지 않아도 되고, 문맥에서는 폭과 간격만 정한다.

```html
<label class="ui-label" for="st-place">장소</label>
<input class="ui-field" id="st-place" placeholder="예: 세미나실, Zoom">
```

| 옛 클래스 | 지금 |
|---|---|
| 전역 `input/textarea/select` 규칙 + 문맥별 규칙 ~15개 (`.modal input`, `.write-form input`, `.tbl input`, `.pop input`, `.cm-form textarea`, `.rv-filters`, `.p-search`…) | `.ui-field` 하나. 문맥별 규칙은 폭만 남긴다 |
| `.fld > span` 라벨 | `.ui-label` |
| `.p-search`, `#search` | `.ui-search` |
| `.tag-input`, `.drop`, `.star-input` | 그대로 둠 — 입력창과 같은 바탕·둥글기 (태그 입력은 `.ui-chip` + 입력창) |

---

## 5. 체크박스·스위치·할 일 체크

| 컴포넌트 | 클래스 | 언제 |
|---|---|---|
| 체크박스 | `.ui-check` | 데스크톱의 켜고 끄는 옵션, 여러 개 고르기 **[HIG macOS]** |
| 스위치 | `.ui-switch` | 목록 행 안에서 기능 하나를 켜고 끌 때 (폰 설정 화면 같은 곳) |
| 할 일 체크 | `.ui-done` — 원형, 누르면 강조색 채움 + 체크 | 스터디 준비 목록, 가이드 읽음 표시 (미리 알림 앱처럼) |
| 라디오 | 쓰지 않는다 → 2–5개면 세그먼트, 그 이상이면 선택(select) |

- 상태를 색만으로 보여주지 않는다 (체크 표시가 있어야 한다).

| 옛 클래스 | 지금 |
|---|---|
| `.check` (style.css와 features.css에 서로 다르게 두 번) | `.ui-check` |
| `.todo .box`, `.gd-check` | `.ui-done` |

---

## 6. 태그·칩·필·배지

모두 둥근 알약 모양이라 섞이기 쉽다. **역할로 구분한다.**

| 컴포넌트 | 클래스 | 역할 | 모양 |
|---|---|---|---|
| 태그 | `.ui-tag` | 논문의 분야·방법론·지역 표시. 누르면 그 주제 페이지로 | 색 점 + 이름, Subheadline. 분야 = fill-3 채움, 방법론 = 테두리(inset 1px separator) |
| 필터 칩 | `.ui-chip` | 켜고 끄는 필터 | fill-3, 켜지면 강조색 18% 바탕 + 강조색 글자, `aria-pressed` |
| 상태 필 | `.ui-pill` + `.warn` `.ok` `.accent` | 상태 하나를 짧게 — "7일 늦게", "완료", "진행 중" | 색 16% 바탕 + 같은 색 글자, Subheadline |
| 숫자 배지 | `.ui-badge` | **안 읽은 알림 개수에만** | 빨간 타원 + 흰 숫자 |

- 개수(질문 3, 다이어리 12편)는 배지가 아니라 회색 글자로 쓴다.
- 칩·태그 안 글자는 한 줄. 넘치면 줄임표.

| 옛 클래스 | 지금 |
|---|---|
| `.tag`, `.tag.method`, `.rv-tags .tag` (10.5px) | `.ui-tag`, `.ui-tag.method` |
| `.chip`, `.chip.on` | `.ui-chip[aria-pressed]` |
| `.pill.warn/.ok/.acc`, `.reg` (두 군데 다르게 정의), `.cm .kind` | `.ui-pill` + 색 |
| `.badge`, `.tb-btn .n`, `.pk-n` | `.ui-badge` (안 읽은 알림) 또는 회색 숫자 |
| `.sim-chip`, `.ww`, `.gate-people button` (아바타 + 이름 칩) | `.ui-chip` 안에 `.avatar.xs` |

---

## 7. 아바타

| 크기 | 클래스 | 이니셜 | 쓰는 곳 |
|---|---|---|---|
| 20 | `.avatar.xs` | 10 (Caption 1) | 문장·칩 안, 질문 보드, 댓글 |
| 28 | `.avatar.s` | 11 | 목록 행, 아바타 묶음 |
| 36 | `.avatar` | 13 | 다이어리 카드 머리, 사람 카드 |
| 56 | `.avatar.l` | 20 | 사람·내 페이지 머리 |

- 이 네 크기만 쓴다: 토큰 `--av-xs/s/m/l`, 이니셜 `--fs-av-xs/s/m/l`. 이니셜은 폰에서도 커지지 않는다 (원이 커지지 않으므로).
- 바탕 = 사람 색, 이니셜 색은 자동(흰/검정). 관리자·시스템 아바타는 `.avatar.admin` (지금 인라인 스타일 5곳).
- **아바타 묶음**: 겹침 −4px, 바탕색 2px 고리, 넘치면 "+N" 칩 (`.av-more`). 묶음에는 최대 5명.

---

## 8. 별점

- 표시: ★ 5개, 채운 별 `--star`, 빈 별 `--label-4`. 숫자가 중요하면 옆에 "4.0"을 Callout으로.
- 입력: 별 버튼 5개, 각 28×28 누르기 영역, 키보드 ←→.
- 별점은 다이어리의 신호로 강조하지 않는다 (가져온 다이어리의 73%가 기본값 3점 — PEOPLE_TOPICS_GUIDES.md).

---

## 9. 카드

**언제**: 하나의 대상(논문·사람·스터디·가이드)이나 하나의 묶음(사이드 정보)을 감쌀 때.

**규칙**
- 바탕 `--bg-grouped-2`, 둥글기 `--r-card`, 안쪽 여백 `--s-4`, 그림자 `--shadow-1`. **테두리 없음.**
- 카드 안의 카드(서랍·모달 안)는 `--fill-4` 바탕, 그림자 없음.
- 카드 전체가 링크면 호버에 바탕을 살짝 바꾼다 (`color-mix(... 94%, label 6%)`). 들썩이는(transform) 효과는 쓰지 않는다.
- 카드 제목은 Title 3, 카드 안 섹션 머리는 Subheadline · label-2.

```html
<section class="ui-card"><h3 class="t-title3">함께 읽은 논문</h3> … </section>
```

| 옛 클래스 | 지금 |
|---|---|
| `.card`, `.person-card`, `.st-card`, `.gd-card`, `.feed-item.act`, `.paper-row`, `.stat`, `.pf-stats > div`, `.compose`, `.gd-group`, `.pp-lab`, `.cmp-head`… | `.ui-card` + 내용별 클래스(배치만) |
| `.feed-item.act.question/.idea/.study`의 왼쪽 색 줄 | 색 줄 없이 머리에 아이콘 + 필 |

---

## 10. 목록과 행

macOS 앱의 목록처럼 **한 줄 = 한 항목**, 구분선으로 나눈다. 행 모양은 세 가지만 쓴다.

| 행 | 클래스 | 높이 (데스크톱) | 내용 | 예 |
|---|---|---|---|---|
| 한 줄 | `.ui-row` | 28 | 아이콘·아바타 + 글(Body) + 오른쪽 값/꺾쇠 | 사이드 카드 목록, 분야 목록, 그래프 범례 |
| 두 줄 | `.ui-row.two` | ~40 | 제목 + 메타(`.m` · Callout · label-meta) | 알림, 읽을 목록, 사이드의 질문·스터디 |
| 풍부한 행 | `.ui-row.rich` | 내용만큼 | 제목 + 메타 + 태그·아바타 묶음 | 가이드 항목 |
| 구분선 행 | `+ .ruled` | — | 위쪽 0.5px 구분선, 좌우 여백 0 (글자 시작선이 카드 제목과 같음) | 스터디 후보, 읽을 목록, 가이드 항목 |

- 행은 기본이 flex다. 칸이 여러 개면 페이지 CSS의 배치 고리(`.tp-row { display: grid; grid-template-columns: … }`)가 배치만 정한다.
- 링크·버튼·`data-open` 행은 마우스를 올리면 바탕이 바뀐다.

- 묶음: `.ui-list` (카드 모양), 머리말 `.ui-list-h`, 꼬리말 `.ui-list-f`.
- 구분선은 글자 시작 위치부터 (아이콘이 있으면 아이콘 뒤부터).
- 들어가는 행(드릴다운)은 오른쪽에 꺾쇠 `›` (`chevron-right`, label-3).
- 선택된 행: 강조색 바탕 + 흰 글자 (스포트라이트·메뉴의 키보드 선택처럼).
- 마우스를 올렸을 때만 보이는 동작은 키보드 포커스 때도 보여야 한다.

| 옛 클래스 (25개 이상) | 지금 |
|---|---|
| `.mini`, `.sim-row`, `.fr`, `.pl`, `.st-with`, `.prep-row`, `.dq`, `.tp-row`, `.gd-rounds a`, `.pp-axes` 줄 | `.ui-row` |
| `.notif`, `.side-q`, `.side-st`, `.cand-row`, `.rl-item`, `.spot-row`, `.todo` | `.ui-row.two` |
| `.gd-item` | `.ui-row.rich.ruled` |
| `.paper-row` (논문 목록 카드), `.st-q` (질문 카드) | 카드 모양 그대로 둠 — 목록 묶음으로 바꿀지는 열린 문제 |

---

## 11. 표

**언제**: 관리자 화면처럼 같은 속성을 가진 항목을 열로 비교할 때. 그 외에는 목록을 쓴다.

- 머리: Subheadline · label-2 · 600, 아래 구분선. 정렬 가능하면 머리를 누르고 화살표 표시.
- 행: 높이 28, 구분선. 숫자 열은 오른쪽 정렬 + `tabular-nums`.
- 표 안의 입력·버튼은 `.small`.
- `.tbl` → `.ui-table`.

---

## 12. 다이어리 카드

이 서비스의 중심 콘텐츠. `reviewHtml()` (app.js) 하나에서만 만든다.

```
┌───────────────────────────────────────────────┐
│ (아바타 36) 작성자 · Headline          [⋯]   │  머리
│            ★★★★☆ · 10월 2일 · [7일 늦게]       │  메타: Callout · label-meta, 필
│ 논문 제목 (Headline, 링크)                     │  논문 (논문 페이지에서는 생략)
│ 본문 (Body) — 접혀 있으면 아래로 페이드         │  본문
│ 더 보기                                        │
│ ┌ MEMO (Caption 2, 강조색) ───────────────┐    │  메모 (fill-4 또는 강조색 8%)
│ │ 한계·가정·내 연구와의 연결            │    │
│ └─────────────────────────────────────────┘    │
│ [PDF] [이미지]                                 │  첨부
│ (분야 태그) (방법론 태그)                      │  태그
│ [좋아요 3] [나도 읽어볼래요] [댓글 2] [번역]   │  꼬리: .ui-btn.plain.small (아이콘 + 글자)
└───────────────────────────────────────────────┘
```

| 변형 | 언제 | 모양 |
|---|---|---|
| 기본 | 피드, 논문 페이지 | 카드 |
| `.full` | 다이어리 하나를 읽는 화면 | 본문 접지 않음 |
| `.mine` | 내 다이어리 | 머리 메뉴에 편집·삭제 |
| `.blind` | "먼저 쓰고 보기" 중 | 본문을 가리고 이유를 적음 |
| `.missing` | 스터디에서 아직 안 쓴 사람 | 점선 테두리, 바탕 없음 |
| 안쪽 | 서랍·모달·카드 안 | `--fill-4`, 그림자 없음 |

- 사람 색은 아바타에만. 카드 테두리나 줄로 쓰지 않는다 (지금 app.js의 `border-left-color` 인라인은 효과도 없으니 지운다).
- 본문 글자 크기는 변형마다 다르게 하지 않는다 (지금 `.full`이 features 15px / apple 16px으로 충돌).

---

## 13. 메뉴

**언제**: 버튼(⋯, 내 메뉴, 관리)을 눌러 동작 목록을 펼칠 때.

**규칙** **[HIG]**
- 항목은 동작어. 창이 열리는 항목은 "…" — "일정·장소 수정…".
- 관련 항목끼리 구분선으로 묶는다. **파괴적 항목은 맨 아래, 빨간색.**
- 하위 메뉴는 1단계까지.
- 키보드: ↑↓ 이동, Enter 실행, Esc 닫기. 항목 높이 24–28, 둥글기 8 (메뉴 14 − 여백 6).
- 지금 상태를 보여주는 항목(테마·언어)은 메뉴 안에 세그먼트로.

```html
<div class="ui-menu ui-glass strong" role="menu">
  <button role="menuitem"><i data-lucide="calendar" class="ic"></i>일정·장소 수정…</button>
  <hr><button role="menuitem" class="destructive"><i data-lucide="trash-2" class="ic"></i>삭제</button>
</div>
```

| 옛 클래스 | 지금 |
|---|---|
| `.menu` (둥글기 16), `.st-manage .menu-pop` (`<details>`, 둥글기 10) | `.ui-menu` (둥글기 14) |

---

## 14. 팝오버와 툴팁

**팝오버**: 버튼에 붙어서 뜨는 작은 창 — 필터 설정, 학기 선택, 태그·멘션 자동완성, 알림 목록.
- 한 번에 하나만. 팝오버 안에서 또 팝오버를 열지 않는다. 경고에 쓰지 않는다 **[HIG]**.
- 바깥을 누르거나 Esc로 닫는다. 진한 유리, 둥글기 14.
- 폰에서는 시트로 바꾼다.
- `.pop` (18) · `.tag-pop` · `.mention-pop` (14) → `.ui-popover`.

**툴팁**: 두 가지만.
- 아이콘 버튼 설명 → 브라우저 `title` 속성.
- 차트 값 설명 → `.ui-tooltip` 하나 (지금 `.cal-tip`, `.drift-tip`, 그래프 캔버스 박스, SVG `<title>` 네 가지가 섞임). [data-viz.md §5](data-viz.md#5-공통-규칙).

---

## 15. 알림 (확인창)

**언제**: 되돌릴 수 없는 동작 직전, 또는 다른 사람에게 영향을 주는 동작 직전. 되돌릴 수 있으면 알림 대신 바로 실행하고 토스트에 "실행 취소"를 둔다 ([patterns.md §5](patterns.md#5-확인과-되돌리기)).

**규칙** **[HIG]**
- 제목 = 질문 ("이 다이어리를 삭제할까요?"). 결과 설명은 **제목이 아니라 본문(message)**에.
- 버튼 최대 3개. **취소 왼쪽, 실행 오른쪽.** 실행 버튼 이름은 구체 동작어 ("삭제", "마치기") — "확인"을 쓰지 않는다.
- 파괴적 실행은 `.destructive` (빨간 글자), 주요 버튼으로 칠하지 않는다.
- 구현: `LabConfirm(title, { message, ok, destructive })` (auth.js). 브라우저 `confirm()`·`prompt()`는 쓰지 않는다 (지금 reading.js에 남아 있음).

```js
LabConfirm(t("st.delQ"), { message: t("st.delMsg"), ok: t("act.delete"), destructive: true })
```

---

## 16. 시트·모달

**언제**: 입력이 필요한 짧은 작업에 집중시킬 때 — 비밀번호 변경, 일정 수정, 임시 비밀번호 발급.

- 데스크톱(macOS): 제목은 위, 버튼은 **아래 오른쪽에 [취소] [주요]** **[HIG macOS]**. 폰(iOS) 시트는 머리에 취소 · 제목 · 완료를 둘 수 있다.
- 폭 420 (넓은 것 640), 둥글기 20, 진한 유리. 폰에서는 아래에서 올라오는 시트 + 손잡이.
- 시트 위에 시트를 띄우지 않는다. 열리면 첫 입력에 포커스, Esc = 취소.
- 구현: `LabModal(html, { wide, forced })` → `.ui-scrim.sheet` + `.ui-sheet.modal`. 버튼 줄은 `.modal-foot`.

---

## 17. 서랍(인스펙터)

그래프에서 노드를 누르면 오른쪽에 뜨는 패널 = macOS의 인스펙터.
- 오른쪽에 떠 있음, 폭 520, 둥글기 20, 거의 불투명. 제목 Title 2, 섹션 머리 Subheadline · label-2.
- 폰: 전체 화면 시트 (불투명).
- 안의 카드·다이어리는 "안쪽" 변형 (`--fill-4`).
- 같은 정보를 페이지로 보여줄 때(사람·주제 페이지 사이드)는 같은 렌더 함수를 쓰고 바탕만 바꾼다.

---

## 18. 토스트

- 방금 한 일의 결과를 짧게: "게시했어요". 과거형 해요체, **✓·이모지 없이** 앞에 아이콘(`circle-check`, 실패는 `triangle-alert`).
- 되돌릴 수 있으면 "실행 취소" 버튼 (`.ui-btn.plain.small`).
- 4초 뒤 사라짐, 마우스를 올리면 멈춤. 한 번에 하나.
- 오류의 원문(`e.message`)을 그대로 보여주지 않는다 → [writing.md §4](writing.md#4-문구-틀).
- `.toast` → `.ui-toast.ui-glass`.

---

## 19. 안내줄

페이지 안에 머무는 알림 — "AI 요청 3건이 반영됐어요", "이전에 쓰던 글을 불러왔어요", 읽을 목록 권유.
- `.ui-notice` + `.info` / `.warn`: 아이콘 + 한두 문장 + (선택) 동작 버튼 + 닫기.
- 바탕은 상태 색 10%, 둥글기 `--r-card`.
- `.restored`, `.rl-nudge`, `.mcp-banner`, `.draft-row` → `.ui-notice`.

---

## 20. 빈 상태

**규칙**: 비어 있는 이유 + **다음에 할 일**을 항상 함께 **[HIG]**. 그냥 비워 두거나 "—"만 쓰지 않는다.

| 크기 | 클래스 | 모양 | 쓰는 곳 |
|---|---|---|---|
| 큰 | `.ui-empty` | 아이콘 40 + 제목(Title 3) + 설명(Body · label-2) + 다음 행동 버튼 | 페이지·탭 전체가 비었을 때 |
| 작은 | `.ui-empty.compact` | 한 줄 Callout · label-meta + (선택) 링크 | 사이드 카드, 목록 묶음 |

- 문구 틀: [writing.md §4](writing.md#4-문구-틀).
- `.empty`, `.cm-empty`, `.spot-empty`, `.st-notes-empty`, `.graph-empty`, `<p class="muted">` → `.ui-empty` / `.ui-empty.compact`.

---

## 21. 불러오는 중과 진행

| 상황 | 컴포넌트 |
|---|---|
| 버튼을 누르고 기다릴 때 | 버튼 안 스피너 `.is-loading` + "~하는 중…" |
| 영역을 불러올 때 | 0.3초가 넘으면 그 자리에 `.ui-spinner` + 무엇을 불러오는지 한 줄 |
| 얼마나 남았는지 알 때 (업로드·내보내기) | `.ui-progress` (확정형) + "PDF 올리는 중 · 62%" |
| 목표 대비 진행 (학기 다이어리 수, 가이드 읽음) | `.ui-progress` 변형 — 표시선은 [data-viz.md](data-viz.md#4-차트-종류별-규칙) |

- "불러오는 중…"처럼 모호한 말보다 무엇을 하는지 — "번역하는 중…", "비슷한 논문 찾는 중…".
- `.pbar/.pfill`, `.gd-prog` → `.ui-progress`.

---

## 22. 검색

| 검색 | 위치 | 동작 |
|---|---|---|
| **전역 검색** (스포트라이트) | 상단 바 돋보기, `/`, ⌘K / Ctrl+K | 논문·사람·스터디·분야를 한 목록에서. ↑↓ · Enter · Esc. `spotlight.js` |
| **목록 필터** | 목록 페이지의 도구줄 | 그 목록만 좁힘. 입력하는 대로 결과. 주소에 반영(`?q=`) |

- 플레이스홀더는 범위를 말한다 — "논문 제목·저자로 거르기".
- 결과가 없으면 빈 상태 + 조건을 바꾸는 방법.

---

## 옮긴 결과 (2026-10-03)

| 컴포넌트 | 대체한 옛 클래스 |
|---|---|
| `.ui-btn` | `.btn` 계열, `.link-btn`, `.rf`, `.icon-btn`(그래프), `.tb-btn`, `.drawer-btn`, `.play`, `.more` |
| `.ui-seg` | `.tabs`, `.seg`, `.feed-tabs` (선택 상태 `.on` → `aria-current` / `aria-pressed`) |
| 기본 입력창 | 문맥별 입력 규칙 ~15개 |
| `.ui-tag` / `.ui-chip` / `.ui-pill` / `.ui-badge` | `.tag`, `.chip`, `.pill`, `.reg`, `.badge` |
| `.ui-card` · `.ui-empty` | `.card` · `.empty` |
| `.ui-row` (+ `.two` `.rich` `.ruled`) | 행 16종 (배치 고리로 남음) |
| `.ui-menu` · `.ui-popover` · `.ui-tooltip` | `.menu`, `.pop`, `.tag-pop`, `.mention-pop`, `.menu-pop`, `.tooltip`, `.cal-tip`, `.drift-tip` |
| `.ui-sheet` · `.ui-toast` | `.modal`, `.toast` |
| `.ui-table` · `.ui-check` · `.ui-done` · `.ui-notice` | `.tbl`, `.check`, `.todo .box`/`.gd-check`, `.restored`/`.rl-nudge`/`.draft-row` |
| 아바타 4크기 | 18가지 크기 덮어쓰기 |

남은 것: 상단 바 내부 컨트롤(상단 바 컴포넌트로 둠), 논문 목록 카드(`.paper-row`)와 질문 카드(`.st-q`), `apple.css`에 남은 페이지별 덮어쓰기.
