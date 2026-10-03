# Labsidian 기획안 v1

> 연구실 전체가 로그인해서 Paper Diary를 쓰고, 서로의 리뷰에 댓글을 달고, 연구실의 관심사 지형을 그래프로 보는 사이트.
> 제약: **완전 무료**, **유료 LLM API 없음**, **데이터는 연구실 멤버만 열람**.

---

## 1. 전체 구조

```
[브라우저]  GitHub Pages 정적 사이트 (코드는 공개돼도 OK — 데이터는 없음)
    │  로그인 / 읽기·쓰기 (Row Level Security: 멤버만)
    ▼
[Supabase 무료]  Postgres + Auth + Realtime(댓글 실시간) + pgvector(유사도)
    ▲
    │  매일 밤 배치 (무료)
[GitHub Actions]  ① 메타데이터 보강 (Semantic Scholar / OpenAlex / Crossref)
                  ② 논문 임베딩 계산 (SPECTER2 + multilingual-e5)
                  ③ 지도 좌표(UMAP)·군집·군집 이름 계산 → DB에 저장
                  ④ 주간 백업 (pg_dump)
```

| 구성 | 선택 | 이유 |
|---|---|---|
| DB·로그인 | **Supabase Free** | 500MB DB(텍스트만이라 수십 년치), 50k MAU, RLS로 멤버 전용, Realtime, pgvector |
| 그래프 렌더링 | **sigma.js v3 + graphology** | WebGL이라 2만 노드도 부드러움, 라벨 겹침 자동 정리, 필터 시 dim/hide 쉬움 |
| 무거운 계산 | GitHub Actions | 임베딩·UMAP을 브라우저에서 돌리면 느리고 매번 결과가 달라짐 → 미리 계산 |

**무료 티어 주의점**
- Supabase 무료는 **7일간 요청이 없으면 일시정지** → 2~3일마다 핑 보내는 cron (Cloudflare Worker cron 권장. GitHub Actions 스케줄은 60일 커밋 없으면 꺼짐)
- 자동 백업 없음 → 주 1회 `pg_dump` 백업 Action
- 이메일 매직링크는 기본 SMTP가 시간당 2통 제한 → **Google 로그인 + 멤버 허용목록** 방식이 제일 간단

---

## 2. 기능

### 2-1. 다이어리 작성 (핵심)
1. **DOI / 링크 / 제목 붙여넣기** → 제목·저자·저널·연도·초록 자동 채움 (Semantic Scholar → OpenAlex → Crossref 순)
   - 이미 누가 읽은 논문이면 "**한서윤 님 외 2명이 읽었어요**" + 그 리뷰 미리보기
2. 별점 · 내용 · Memo(critic) 작성 — 기존 Format 그대로, 마크다운 지원, **자동 임시저장**
3. **태그 추천** (LLM 없이, 아래 3장) → 체크만 하면 됨, 새 태그 직접 추가 가능
4. 제출 → 그래프·내 페이지에 바로 반영 (좌표는 우선 비슷한 논문 근처에 임시 배치, 밤 배치에서 확정)

### 2-2. 내 페이지
- **이번 학기 작성률** — 연구실 규정상 인센티브(90% / 70%)·평가와 연결되니까 제일 위에
- GitHub 잔디 같은 **작성 캘린더** + 연속 작성 스트릭
- 내 관심사 분포 & **학기별 관심사 변화**
- 내 리뷰 모아보기 / 임시저장 / **읽을 논문 목록**(북마크)
- 내 리뷰에 달린 댓글·질문, 나를 @멘션한 글
- **기존 docx 형식으로 내보내기** — 평가 제출 방식이 바뀌기 전까지 병행 가능

### 2-3. 댓글 · 질문
- 리뷰마다 댓글 스레드. 종류: 💬 댓글 / ❓ 질문(→ "해결됨" 표시) / 💡 아이디어
- `@이름` 멘션 → 알림
- 반응: 👍 / "나도 읽어볼래요" (→ 읽을 목록에 자동 추가)
- "**이 논문 같이 읽어요**" — 스터디 후보 모으기

### 2-4. 논문 · 사람 · 태그 페이지
- 논문: 모든 리뷰 나란히 + 댓글 + 비슷한 논문(임베딩) + 리뷰어들이 붙인 태그 집계
- 사람: 관심사, 비슷한 사람, 같이 읽은 논문, 추천 논문
- 태그: 누가 많이 읽나, 대표 논문, 자주 같이 쓰이는 태그

---

## 3. 태그 체계

### 원칙
- **태그는 리뷰에 붙인다** (논문이 아니라). 같은 논문도 사람마다 보는 관점이 다름.
  논문의 태그 = 리뷰 태그 집계 (예: `교통류 3 · AI기초 1`). → "이 관점은 누가 좋아하나"가 자연스럽게 나옴
- 태그는 여러 개 OK. 축은 3개: **분야** / **방법론** / **자유 태그(키워드·아이디어)**
- **계층 태그**: `안전/충돌예측`, `AI/LLM/에이전트` — 줌아웃하면 상위로 묶여 보임
- 태그 목록은 코드가 아니라 **DB에 저장**. 누구나 새 태그 제안 가능, 관리자가 비슷한 태그 병합(`RL` = `강화학습`)

### LLM 없는 태그 추천
1. **비슷한 논문 투표 (메인)**: 새 논문 임베딩 → 기존 리뷰 중 가장 비슷한 논문 10편 → 그 논문들에 붙은 태그를 유사도 가중 투표 → 상위 태그 추천.
   이미 973개 리뷰가 있어서 지금도 바로 작동. 새 분야도 누가 한 번 태그를 만들면 다음부턴 추천됨.
2. 키워드 규칙 (지금 `taxonomy.py`) — 보조
3. OpenAlex 키워드 — 자유 태그 후보로만 (※ OpenAlex 주제 분류는 직접 테스트해보니 교통 논문을 "건축·건설"로 분류하는 등 우리 분야엔 부정확)

### 내 AI 연결 — Labsidian MCP 서버 (Cloudflare Workers 무료)
각자 자기 Claude / Codex를 Labsidian에 연결. 비용은 각자 구독에서 나가고, 연구실은 0원.
MCP 서버는 **로그인한 본인 권한으로만** DB에 접근 (RLS 그대로 적용) → 남의 글 수정 불가.

| 대상 | MCP 도구 예시 |
|---|---|
| 멤버 | `search_reviews`, `get_paper` — "차선변경 RL 논문 중에 선배들이 좋게 본 거 찾아줘" |
| | `translate_review` — 다른 사람 리뷰를 한↔영 번역해서 보기 (결과는 내 화면에만, 원문은 그대로) |
| | `draft_review` — PDF/링크 주면 다이어리 초안 → **임시저장**으로만 들어감, 게시는 본인이 확인 |
| | `suggest_tags`, `ask_question` (댓글로 질문 남기기) |
| 관리자 | `list_tags`, `find_similar_tags` → `merge_tags`, `rename_tag`, `move_tag`(계층 이동) |
| | `retag_reviews` (일괄 재분류 — 변경 전후 diff 보여주고 확인 후 적용) |
| | `term_report` — 학기별 작성률 리포트 |

- 관리자 도구는 `role=admin`인 사람만 노출. **파괴적 작업은 미리보기 → 확인 → 적용** 2단계 + 변경 로그(되돌리기)
- MCP 이전 단계: "프롬프트 복사" 버튼 (Claude/Codex에 붙여넣고 결과 JSON을 다시 붙여넣기)

---

## 4. 그래프 뷰 설계 (제일 공들일 부분)

### 위치는 "논문 자체"로, 관점은 "사람·태그"로 (2026-10-01 측정 후 결정)
`scripts/eval_embeddings.py` — 각 논문의 최근접 이웃 10개가 우연보다 몇 배 더 같은 특성을 공유하는지(lift):

| 임베딩 | 같은 리뷰 언어 (편향↓) | 같은 리뷰어 (편향↓) | 같은 분야 (주제↑) |
|---|---|---|---|
| e5 · 제목+리뷰 본문 (v1 시제품) | **1.88** | **7.06** | 5.62 |
| e5 · 제목+초록 | 1.34 | 4.15 | 5.72 |
| **SPECTER2 · 제목+초록 (채택)** | 1.32 | 4.27 | **6.30** |

- 리뷰 본문을 넣으면 "누가·어떤 언어로 썼는지"에 끌려서 배치됨 → **위치 계산에서 리뷰 제외**
- SPECTER2 = AllenAI 학술 논문 임베딩, 인용 관계로 학습 → "학술적으로 관련 있음"에 가장 가까움
- 남은 언어 lift 1.3은 "한국어로 쓰는 사람이 특정 분야를 많이 읽음"이라는 실제 효과도 섞여 있음
- 초록이 있어야 정확해짐 (지금 891편 중 90편만 초록 확보, 801편은 제목만) → Semantic Scholar 무료 키로 보강 필요 (10장)
- 사람마다 다른 관점은 위치가 아니라 **사람 노드·리뷰 태그·"같은 논문 다른 시선"** 으로 표현

### 그래프 = 의미 지도 + 사람 네트워크 (하나의 뷰, 2026-10-01 피드백 반영)
- **위치**: 논문은 SPECTER2/UMAP 위치에 묶여 있고(의미 위치 고정), d3-force로 드래그 가능
- **연결선**: 사람 ─ 논문만 (유사 논문 연결선은 정보 대비 복잡도가 커서 제거 — "비슷한 논문"은 상세 패널에서)
- **색**: 노드 = 처음 읽은 사람, 흰 테두리 = 2명 이상 읽음 / **배경 영역 = 주제 군집** (이름은 그 군집에서 가장 많은 분야 태그)
  - 영역을 태그로 직접 그리지 않는 이유: 한 논문에 태그가 여러 개라 영역이 겹치고, 같은 태그 논문이 지도 곳곳에 흩어져 있어 영역이 조각남. 위치 기반 군집은 항상 연속된 영역이 됨. 태그는 필터(분야 ▾)로 보면 "이 분야가 어디어디 퍼져 있나"가 보임
  - 나중에 사이트에서 사람들이 태그를 직접 달면, 군집 이름도 그 태그 다수결로 자동 갱신
- **UI**: 상단 툴바(검색 · 분야 · 저널·학회 · 연도 · 더보기 팝오버) / 좌하단 사람 범례 = 색 설명 + 사람 필터(클릭 토글, 더블클릭 이동) / 우하단 줌 + ⚙ 표시 설정(색 기준, 레이어, 물리, 타임랩스)

### 레이아웃: "의미 지도 + 사람은 그 위에"
1. 논문마다 임베딩 (제목+초록 → SPECTER2)
2. **UMAP으로 2D 좌표 고정** → 비슷한 주제 논문이 실제로 모여 있음. 매주 새 논문은 기존 지도에 끼워넣기(`transform`) → 지도가 매번 뒤바뀌지 않음 (공간 기억 유지)
3. **2단계 군집** + 자동 군집 이름 (c-TF-IDF + 우리 태그) → 줌아웃: 큰 주제, 줌인: 세부 주제 (Nomic Atlas 방식)
4. **사람 = 자기가 읽은 논문들의 무게중심** → 겹치지 않게 살짝만 force 조정. 논문은 고정 (사람이 수백 편에 연결돼서 force로 돌리면 뭉개짐)
5. 군집 영역에 옅은 등고선/외곽선 (Embedding Atlas 방식)

### 인터랙션 (참고 서비스에서 가져올 것)
| 기능 | 참고 |
|---|---|
| **로컬 그래프** — 노드 하나 선택 → 주변 1~3단계만 (깊이 슬라이더) | Obsidian |
| **색 그룹 = 검색 조건** — `venue:TR-C` 빨강, `tag:강화학습` 파랑 처럼 직접 정의 | Obsidian |
| **필터는 지우지 말고 흐리게** (옵션으로 숨기기) — 전체 지도 감각 유지 | Kumu Showcase |
| **패싯 필터** — 저널/학회(정규화), 출판연도, 리뷰 기간, 사람, 태그, 별점, 함께 읽은 논문만 | — |
| **타임랩스** — 리뷰 날짜 슬라이더 ▶ 재생: 연구실 관심사가 주별로 퍼져나가는 모습 | Obsidian Animate |
| **보기 전환** — 의미 지도 / 연도 타임라인(x=연도, 줄=주제) / 사람 네트워크 | Litmaps, CiteSpace |
| 라벨 우선순위 배치 (겹치면 중요한 것만), 줌에 따라 디테일 증가 | VOSviewer, sigma.js |
| **빈틈 찾기** — 아무도 안 읽은 주제 영역, 두 주제를 잇는 "다리" 사람/논문 강조 | InfraNodus |
| 모바일: hover 대신 탭 → 로컬 그래프 | — |

### 주의
- UMAP은 "가까운 것끼리"만 의미 있고 군집 간 거리는 의미 없음 → UI에 작게 안내
- 색은 한 번에 한 기준만 (10색 넘으면 구분 불가)
- 저널명 정규화 필수 (`Transportation Research Part C` / `TR-C` / `Part C: Emerging…` → 하나로)

---

## 5. 데이터 모델 (요약)

```
members      (id, name, email, role[member|admin], color, joined_term)
papers       (id, title, doi, s2_id, openalex_id, venue_id, year, authors, abstract,
              emb_specter vector(768), emb_e5 vector(384), x, y, cluster_l1, cluster_l2)
venues       (id, name, short, aliases[])            -- 저널명 정규화
reviews      (id, paper_id, author_id, term, diary_date, rating, content, memo,
              status[draft|published], created_at, updated_at)
              -- diary_date = 어느 주 다이어리로 칠지(밀려 쓰기·미리 쓰기 가능, 작성률·학기 계산 기준)
              -- created_at = 실제 등록 시각(따로 보관, 화면에 "N일 늦게 등록"/"미리 작성"으로 표시)
attachments  (id, review_id, kind[pdf|image], name, mime, size, storage_path, created_at)
              -- 파일은 Storage 버킷 "attachments" (PDF 20MB · 이미지 5MB, 이미지는 1600px webp로 줄여서 올림)
tags         (id, label, axis[domain|method|free], parent_id, aliases[], color)
review_tags  (review_id, tag_id)
comments     (id, review_id, author_id, parent_id, kind[comment|question|idea],
              body, resolved, created_at)
reactions    (review_id|comment_id, member_id, kind)
reading_list (member_id, paper_id, added_at)
studies      (id, paper_id, title, host_id, presenter_id, date, time, place, about, closed, notes jsonb, created_at)
study_members(study_id, member_id)  ·  study_questions (id, study_id, author_id, body, done, created_at)  ·  study_votes (question_id, member_id)
              -- 스터디 리뷰는 reviews.study_id로 연결 (일반 다이어리와 똑같이 작성률에 반영)
paper_refs   (paper_id, ref_paper_id)                 -- 우리 코퍼스 내 인용 관계 (그래프 엣지용)
clusters     (id, level, label, x, y)
```
모든 테이블 RLS: `members`에 있는 로그인 사용자만 읽기, 본인 글만 수정.

---

## 6. 로드맵

| 단계 | 내용 | 상태 |
|---|---|---|
| **0. 그래프** | SPECTER2 의미 지도 + 사람 네트워크, 필터 툴바, 사람 범례, 물리, 타임랩스 | ✅ |
| **2. 작성** | 작성/수정/삭제, 메타데이터 자동 채움(S2·Crossref·DataCite·OpenAlex), 태그 추천(유사 논문 투표+규칙), 키워드 태그, 임시저장, AI 프롬프트 복사/붙여넣기, "이미 읽은 논문" 알림 | ✅ (mock) |
| **3. 소통** | 댓글·질문·아이디어, 답글, 해결됨, @멘션, 좋아요·"나도 읽어볼래요", 알림 벨, 번역(브라우저 내장 → 없으면 내 AI 프롬프트) | ✅ (mock) |
| **4. 내 페이지** | 학기 작성률(70/90% 표시, 기대치 대비), 캘린더·연속 주, 월별 관심사 변화, 내 리뷰, 임시저장, 읽을 목록, 받은 알림, docx 내보내기 | ✅ (mock) |
| **관리자** | 계정 발급·비번 초기화·역할·비활성, 태그 이름/색 변경·병합·생성·되돌리기·비슷한 태그 후보·AI 정리 프롬프트, 학기/목표 설정, JSON 내보내기/가져오기, 변경 기록 | ✅ (mock) |
| **1. DB 연결** | `site/store.js`(localStorage mock) → `store-supabase.js` 교체. 아래 9장 | ⏳ 다음 |
| **5. 배치** | 메타데이터 보강·SPECTER2·지도 갱신·백업·핑 Actions — 계획은 10장 | ⏳ |
| **MCP** | `mcp/labsidian_mcp.py` — 읽기 11개 + 쓰기 5개 + 관리자 5개 도구. 지금은 개발 서버의 스냅샷/대기열로 사이트와 연결 | ✅ (mock bridge) |
| **기타** | 전체화면 논문·사람 페이지, 학기 선택(여러 학기 동시), 멤버별 작성 의무(시작일·면제·목표), 내 색 변경, 프롬프트 복사 기능 제거 | ✅ |
| **홈·피드** | 홈(기본 화면): 새 다이어리 + 댓글·질문 타임라인, 탭(전체·내 관심 분야·질문·함께 읽은 논문), 이번 주 작성 현황·답을 기다리는 질문·최근 함께 읽은 논문 | ✅ (mock) |
| **다이어리 날짜·첨부** | 다이어리 날짜(지난주·다음 주 빠른 선택)와 실제 등록일 분리 표시, 논문 PDF·그림 첨부(드래그·붙여넣기, 라이트박스, 논문 페이지 "PDF 보기") | ✅ (mock, 파일은 이 브라우저 IndexedDB) |
| **논문 스터디** | "함께 읽은 논문" → 스터디 페이지 (상세는 단계별 탭: 준비 · 다이어리 · 소개 순서 · 정리, 위에 '내 준비' 체크리스트, 관리는 ⋯ 메뉴): 누구나 개설(발제자·날짜·장소·초대·PDF), 참가(읽을 목록 자동), 사전 질문 보드(👍 투표·이야기함), 참가자 다이어리 비교(스터디에서 쓰는 리뷰도 평소 다이어리와 같은 양식 — 그대로 내 다이어리에 쌓임), 옵션: "먼저 쓰고 보기"(내 다이어리 전엔 다른 참가자 것 가림, 기본 켜짐) · "각자 관련 논문 1편씩 가져와 소개"(소개 순서·연결 한 줄·자료 첨부, 논문 페이지에 '함께 소개된 논문'), 모임 준비 현황, 정리 노트(결론·남은 질문·후속, AI 초안 불러오기), D-1·당일 알림, 후보 추천(2명+ 읽고 싶어함), 홈 피드 연동 | ✅ (mock) |
| **디자인** | Apple HIG 리뉴얼 — 토큰·라이트/다크·Liquid Glass 상단 바·HIG 컴포넌트·Lucide 아이콘·대비 기준 (docs/design/) | ✅ 1차 |
| 6. 원격 MCP | DB 연결 후 Cloudflare Workers에 원격 MCP 배포 (로그인 토큰으로 본인 확인) — 로컬 설치 없이 URL만 등록 | ⏳ |

---

## 7. 결정 사항 (2026-10-01)

- **로그인: 관리자가 계정 발급** — 아이디 = 이름, 초기 비밀번호는 관리자가 설정 → 첫 로그인 시 변경 강제
  - Supabase Auth는 이메일이 필요해서 내부적으로 `<아이디>@labsidian.local` 같은 가짜 이메일로 저장 (사용자는 이름만 입력)
  - 공개 회원가입 끔. 계정 생성·비번 초기화는 관리자 페이지 → Edge Function(service key는 서버에만)
- **코드 공개 OK** — 데이터는 DB + RLS로 보호
- **한국어 / 영어 둘 다** — UI 전체 i18n(KO/EN 토글), 태그도 한·영 라벨. 리뷰 본문 번역은 MCP `translate_review` 또는 브라우저 내장 번역
- **MCP**: 멤버용 + 관리자용 (위 3장)

## 8. 아직 정해야 할 것

1. **교수님 합의** — 작성률이 인센티브·평가에 연결돼 있으니, 사이트를 공식 기록으로 쓸지 / docx와 병행할지
2. **공개 범위** — 리뷰는 멤버 전원 공개가 기본? 교수님 계정도 포함?
3. **관리자** — 누가 맡을지 (본인 + 1명?)

---

## 9. DB 연결 준비 — Store API ↔ Supabase

화면 코드는 `window.Store`만 호출함. `site/store.js`(mock)를 같은 모양의 `store-supabase.js`로 바꾸면 끝.

| Store (지금: localStorage) | Supabase에서 |
|---|---|
| `auth.signIn(이름, 비번)` | `auth.signInWithPassword({ email: <id>@labsidian.local })` — 사용자는 이름만 입력 |
| `auth.changePassword` | `auth.updateUser({ password })` + `members.must_change=false` |
| `users.create / resetPassword` | Edge Function(service key) — `auth.admin.createUser` / `updateUserById` |
| `reviews.create/update/remove` | `reviews` insert/update/delete, RLS: `author_id = auth.uid()` 또는 admin |
| `drafts` | `reviews.status='draft'` 행 (본인만 읽기) |
| `files.put/url/remove` | Storage 버킷 `attachments` (비공개) — 업로드는 본인 리뷰에만, 읽기는 멤버만(RLS), `url`은 `createSignedUrl` |
| `comments.recent` (홈 피드) | `comments` + `reviews`를 `created_at` 순으로 페이지 단위 조회 (뷰 하나로) |
| `comments.*`, `reactions.*`, `reading.*` | 같은 이름 테이블 + Realtime 구독 |
| `notifications.*` | DB 트리거로 생성(댓글/멘션/반응 insert 시) → Realtime |
| `tags.rename/merge/create/undo` | `tags` 테이블 + `tag_ops` 로그, 병합은 트랜잭션으로 `review_tags` 갱신 |
| `terms.*` | `terms` 테이블 (admin만 쓰기) |
| `lookup` | 지금처럼 브라우저에서 직접 (S2 키가 생기면 Edge Function으로) |
| `suggestTags` | 지금: 어휘 유사도 → DB 후: pgvector로 SPECTER2 이웃 검색 |
| `admin.exportJSON` | 이관용: 이 JSON을 그대로 import 스크립트에 넣음 |

데모 계정: 관리자 `admin` + 다이어리의 각 멤버(이름으로 로그인). 초기 비밀번호는 `site/store.js`의 `MOCK_INITIAL_PASSWORD`, 첫 로그인 때 변경 강제.

---

## 10. 임베딩·지도 갱신 계획 (2026-10-02 측정)

### 지금 상태
- 위치·비슷한 논문·추천 = SPECTER2(제목+초록) → UMAP. **891편 중 801편은 초록이 없어 제목만으로 계산됨** — 신뢰도를 가장 크게 올릴 수 있는 지점
- 측정 (`scripts/eval_trust.py`):
  - 우리 코퍼스 안 인용 쌍 31개: 인용된 논문이 891편 중 가까운 순 **중간값 상위 3.7%**, 61%가 상위 5% 안 (무작위면 중간값 50%) — 표본이 작음
  - 2D 지도의 왜곡: 실제 최근접 10편 중 지도에서도 최근접 10편 안 39%, 30편 안 66% → 지도 "근처"는 믿어도 되지만 거리·순서는 근사. 비슷한 논문·추천은 2D가 아니라 원래 임베딩으로 계산
- 비용 (이 PC, CPU): 모델 로딩 23초, 논문 1편 0.07초, 40편 9.8초 → 매번 돌릴 필요 없음, 하루 한 번 몰아서

### 갱신 흐름
1. **글을 쓸 때** — 모델 안 돌림. 새 논문은 글자 유사도로 비슷한 논문들 옆에 임시 위치 (`store.js` `place()`, 이미 구현)
2. **매일 1회 배치** (GitHub Actions 또는 연구실 PC) — *처음 들어온 논문만* 초록 보강(S2→Crossref→OpenAlex) + SPECTER2 임베딩 → DB `papers.emb_specter`
   - 이미 있는 논문에 리뷰·수정·댓글이 달리는 건 다시 계산 안 함 (임베딩 = 제목+초록만)
3. **지도에 끼워 넣기** — 저장해 둔 UMAP 모델의 `transform()`으로 새 점만 기존 지도에 배치 → 기존 점은 안 움직임
   - ⚠ 지금 `build_map.py`는 매번 전체를 새로 fit함 → UMAP 모델 저장(`--save-model`) + `--add-new` 모드 필요
4. **학기마다 1회 전체 재계산** — 군집·이름·배치 새로 (지도가 크게 바뀌므로 학기 시작에 공지)

### 할 일
- [ ] `enrich_s2.py`로 초록 801편 보강 (S2 무료 키 신청하면 빠름) → 재임베딩 → `eval_trust.py` 다시 측정
- [ ] `build_map.py`: UMAP 모델 저장 + 새 논문만 transform하는 모드
- [ ] 배치 워크플로 (DB 연결 후): 새 논문 감지 → 보강 → 임베딩 → transform → `papers.x/y/cluster` 업데이트
- [ ] 사람 "관심사 %" 기준 정리: 지금은 태그 개수 비율의 코사인(같이 읽은 논문 미반영, 같이 읽은 편수와 순위 상관 0.38).
      후보: SPECTER2 기반 "내가 읽은 논문 중 상대가 읽은 논문과 같거나 아주 가까운 비율"(상관 0.39) — 어느 쪽이든 화면에 기준을 써주고 "같이 읽은 논문 N편"은 따로 표시
