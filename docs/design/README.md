# Labsidian 디자인 규칙집

> 목표: **맥 네이티브 앱처럼 느껴지는 웹 앱.** Apple Human Interface Guidelines(HIG)를 기준으로 삼고,
> HIG가 다루지 않는 부분(촘촘한 목록, 데이터 시각화, 한국어 문구)은 이 문서에서 정한다.
> 새 화면이나 기능을 만들 때 **이 문서부터 펼친다.** 여기 없는 것은 만들기 전에 먼저 문서에 적는다.

## 문서 지도

| 문서 | 내용 | 이럴 때 본다 |
|---|---|---|
| [foundations.md](foundations.md) | 글자·색·머티리얼·간격·모서리·층·모션·컨트롤 크기·아이콘·접근성 | 값을 정할 때 (크기, 색, 여백) |
| [components.md](components.md) | 버튼·입력·목록·카드·다이어리 카드·메뉴·알림·시트·빈 상태 등 컴포넌트별 규칙 | 화면에 요소를 놓을 때 |
| [patterns.md](patterns.md) | 앱 구조(상단 바), 페이지 틀 6종, 상태(빈·불러오는 중·오류), 확인·되돌리기, 폼, 반응형, 키보드 | 새 페이지·흐름을 만들 때 |
| [data-viz.md](data-viz.md) | 그래프·차트의 색 체계와 종류별 규칙 | 차트·그래프를 만들거나 고칠 때 |
| [writing.md](writing.md) | 말투, 용어집, 버튼 동작어, 확인창·토스트·빈 상태 문구 틀, 날짜·숫자 표기 | 화면에 글자를 넣을 때 |
| [decisions.md](decisions.md) | 결정 기록(날짜순)과 열린 문제 | "왜 이렇게 했지?"가 궁금할 때, 규칙을 바꿀 때 |
| [archive/2026-10-renewal.md](archive/2026-10-renewal.md) | 2026-10 리뉴얼 계획·조사·진행 기록 (HIG 원문 조사값 출처) | 배경 조사가 필요할 때 |

**살아 있는 견본**: 사이트의 `#/design` 페이지. 문서에 있는 컴포넌트는 견본에도 있어야 하고, 견본에 없는 UI는 만들지 않는다.

## 기준 플랫폼

| 화면 | 따르는 HIG | 이유 |
|---|---|---|
| 데스크톱 (761px 이상, 마우스) | **macOS** — 본문 13pt, 컨트롤 28pt | 이상형이 맥 네이티브 앱. 연구실 사용의 대부분이 데스크톱 |
| 폰 (760px 이하) · 터치 | **iOS** — 본문 17pt, 누르기 영역 44pt | HIG는 플랫폼마다 자기 크기를 쓰도록 한다 |

웹에서 1 CSS px = Apple의 1pt로 본다 (Retina 맥의 Safari에서 13px는 네이티브 13pt와 같은 크기로 보인다).

## 원칙

HIG의 원칙(Purpose · Agency · Responsibility · Familiarity · Flexibility · Simplicity · Craft · Delight)에서 이 프로젝트에 특히 중요한 것과, 연구실 서비스로서의 원칙.

1. **콘텐츠가 주인공이다.** 다이어리와 논문이 화면의 중심이고, 컨트롤은 한 발 물러선다. 장식용 색·테두리·그림자를 더하지 않는다.
2. **익숙한 것을 먼저 쓴다.** 새 UI를 발명하기 전에 macOS 앱(메일·메모·미리 알림·Finder)에 같은 역할의 컨트롤이 있는지 본다.
3. **한 화면에 강조는 하나다.** 강조색(Indigo) 바탕의 주요 버튼은 화면당 하나, 많아야 둘.
4. **실제 기록만 보여준다.** 지어낸 점수·성격·추천을 그리지 않는다. 모든 그림은 다이어리·태그·지도에서 나온다.
5. **토큰과 컴포넌트로만 만든다.** 페이지 CSS에 px 글자 크기·hex 색·임의의 둥글기를 쓰지 않는다. 필요한 값이 없으면 토큰을 추가한다.
6. **모든 사람이 쓸 수 있어야 한다.** 라이트·다크·고대비·투명도 줄이기·동작 줄이기·키보드만으로 쓰기를 기본으로 지원한다.

## 표시 규칙

- **[HIG]** Apple HIG 원문에서 확인한 값
- **[외부]** Apple이 공개하지 않아 다른 출처(iOS 측정값, UIKit 기본값 등)를 쓴 값
- **[결정]** 우리가 정한 값. 이유는 [decisions.md](decisions.md)에 있다.

## 새 화면·기능 체크리스트

만들기 전:
- [ ] [patterns.md](patterns.md)에서 페이지 틀을 골랐다 (목록 · 상세 · 대시보드 · 편집 · 전체 화면 · 관리).
- [ ] 쓸 컴포넌트가 모두 [components.md](components.md)에 있다. 없으면 견본(`#/design`)과 문서에 먼저 추가한다.

만들면서:
- [ ] 글자는 `--t-*` 토큰이나 `.t-*` 클래스만 쓴다 (px 금지).
- [ ] 색은 의미 색 토큰만 쓴다 (hex는 `tokens.css` 안에만). 데이터 색은 [data-viz.md](data-viz.md)를 따른다.
- [ ] 간격은 `--s-*`, 둥글기는 `--r-*`만 쓴다.
- [ ] 문구는 [writing.md](writing.md)의 용어집과 동작어를 따르고, i18n 키(`t()`)로 넣는다.
- [ ] JS의 인라인 `style=`는 데이터 색(`--c` 변수)과 동적 크기(막대 폭 등)에만 쓴다.

끝내기 전:
- [ ] 빈 상태 · 불러오는 중 · 오류 세 가지 상태를 모두 만들었다.
- [ ] 라이트 / 다크 / 고대비 / 투명도 줄이기에서 확인했다.
- [ ] 누르기 영역이 데스크톱 28px · 폰 44px 이상이다 (최소 20px).
- [ ] 키보드로 이동했을 때 포커스가 보이고, Esc로 닫힌다.
- [ ] 글자 대비가 4.5:1 이상이다 (굵은 글자·18px 이상은 3:1).
- [ ] `python scripts/design_lint.py`가 통과한다.

## 검사 스크립트

`scripts/design_lint.py`는 토큰을 거치지 않은 값을 세어서, **파일별 개수가 기준선보다 늘어나면 실패**한다.
아직 옛 값이 많이 남아 있어서 모두 막지는 않고, 늘어나는 것만 막는 방식이다 (기준선: `scripts/design_lint_baseline.json`).

| 검사 | 잡는 것 |
|---|---|
| `raw-font` · `tiny-font` | `--t-*` 대신 쓴 px·rem 글자 크기, 10px 미만 글자 |
| `raw-color` | `tokens.css` 밖의 hex·rgb() 색 |
| `raw-radius` | `--r-*` 대신 쓴 둥글기 |
| `breakpoint` | 760 · 900 밖의 화면 폭 기준점 |
| `important` | `!important` |
| `inline-style` | JS 인라인 `style=`에 넣은 색·글자 크기·여백 |
| `js-color` | JS 코드 안의 hex 색 |
| `native-dialog` | 브라우저 `confirm()` · `prompt()` · `alert()` |
| `term-review` | "리뷰" (화면 용어는 "다이어리") |

```
python scripts/design_lint.py              # 검사 (실패하면 바뀐 줄을 짚어 줌)
python scripts/design_lint.py --list raw-font   # 한 검사의 전체 목록 — 정리할 곳 찾기
python scripts/design_lint.py --update     # 정리해서 개수가 줄었으면 기준선을 낮춤
```

새 위반을 통과시키려고 `--update`를 쓰지 않는다. 정말 예외라면 [decisions.md](decisions.md)에 먼저 적는다.
hex가 꼭 필요한 JS 데이터 표(사람 색 팔레트 등)는 `// design-lint: off (이유)` … `// design-lint: on`으로 감싸고, 그 위치를 decisions.md에 적는다.

## 쓸 수 없는 것 (라이선스·상표)

| 항목 | 사용 | 대체 |
|---|---|---|
| SF Pro · SF Mono · New York 폰트 파일 | ❌ 웹폰트로 올리기 금지 (Apple Font License) | CSS `-apple-system`/`system-ui` — Apple 기기에서는 사용자 OS의 SF로 그려진다 ✅ |
| SF Symbols (복사·비슷하게 다시 그리기 포함) | ❌ | **Lucide** (ISC) |
| Apple 로고 · UI 키트 이미지 · 기기 프레임 | ❌ | — |
| Apple 웹사이트·제품 UI를 픽셀 단위로 흉내 | ⚠️ 피한다 | HIG 규칙을 따른 고유 디자인 |

윈도·안드로이드에서는 SF 대신 **Pretendard**(OFL)로 보인다.

## 코드 구조

불러오는 순서 (`index.html`):
```
site/tokens.css     토큰 + ui-* 컴포넌트 (선택자는 :where([data-ui]) .ui-x — 우선순위가 클래스 하나)   ← 규칙의 원본
site/style.css      기본·페이지 스타일
site/features.css   기능별 페이지 스타일
site/apple.css      페이지별 HIG 덮어쓰기                                                          ← 점차 없앤다
site/layout.css     상단 바 / 레거시 사이드바 배치
site/design.js      #/design 견본 페이지
```

컴포넌트가 먼저, 우선순위 낮게 불리므로 페이지 CSS는 **배치(그리드·폭·순서·간격)만** 한 줄로 덧붙인다.
옛 클래스와 컴포넌트의 대응은 [components.md](components.md) 각 절의 "옛 클래스" 표에 있다.
