# Labsidian

연구실 Paper Diary를 **지식 그래프**로 보는 웹사이트. (Lab + Obsidian) — 기획안: [docs/PLAN.md](docs/PLAN.md)

현재 상태: **전체 기능 동작 (데모 모드)** — 로그인·작성·댓글·알림·내 페이지·관리자까지 되지만, 데이터는 **이 브라우저(localStorage)에만** 저장됨. DB 연결(연구실 서버)은 다음 단계 → [docs/PLAN.md](docs/PLAN.md) 9장.

**이 저장소에는 가상 연구실(데모) 데이터만 있음.** 실제 다이어리 데이터는 `.gitignore`로 막혀 있어 로컬에만 존재.

### 데모 로그인
- 데모 사이트: 로그인 화면에서 멤버(또는 관리자)를 골라 바로 입장 — 비밀번호 없음
- 이름·비밀번호로도 가능: 관리자 `admin` + 멤버 전원 (아이디 = 이름, 예: `한서윤`), 초기 비밀번호는 `site/store.js`의 `MOCK_INITIAL_PASSWORD`
  (실제 연구실 데이터로 열면 첫 로그인 때 새 비밀번호로 바꾸게 됨)
- 새 멤버는 관리자 → 멤버 → "멤버 추가" (임시 비밀번호가 한 번 표시됨)
- 초기화: 관리자 → 데이터 → "이 브라우저의 데이터 초기화"

- **그래프** — 의미 지도 위의 사람 네트워크 (하나의 뷰)
  - 논문 위치 = 제목+초록의 SPECTER2 임베딩 → UMAP. 리뷰 본문은 위치 계산에서 제외 (편향 측정: `scripts/eval_embeddings.py`, 결과는 PLAN.md 4장)
  - 연결선 = 사람–논문, 노드 색 = 처음 읽은 사람(흰 테두리 = 2명 이상), 배경 영역 = 주제 군집
  - 노드 드래그(물리), hover/클릭 강조, 상단 툴바 필터 + 좌하단 사람 범례 필터
  - 2단계 군집: 줌아웃 = 큰 주제(영역 + 이름), 줌인 = 세부 주제 + 논문 제목
  - 사람 = 읽은 논문들의 무게중심
  - 클릭 → 로컬 그래프(깊이 1~3: 읽은 사람·비슷한 논문·인용) + 상세 패널
  - 색상 기준: 주제 군집 / 읽은 사람 / 분야 태그 / 저널·학회 / 출판 연도
  - 필터: 사람, 분야, 방법론, 저널·학회(정규화), 유형(저널/학회/프리프린트), 출판 연도, 별점, 함께 읽은 논문 — 흐리게/숨기기
  - 타임랩스: 표시 → "타임랩스" 켜면 리뷰 날짜 슬라이더 ▶
- **사람 / 논문 / 함께 읽은 논문** 페이지, 추천
- **한국어 / English** (우측 상단 토글)

## 구조

```
data/demo/              가상 연구실 (멤버 10명 · 리뷰 250편) — 저장소에 포함된 유일한 데이터
data/roster.json        구성원 (이름, id)                          ← 비공개 (로컬만)
data/diary.json         파싱된 리뷰 (학기별 term 누적)            ← 비공개 (로컬만)
data/s2_cache.json      Semantic Scholar 메타데이터 캐시           ← 비공개 (로컬만)
data/map.json           의미 지도 좌표·군집·이웃                  ← 비공개 (로컬만)
scripts/parse_diary.py  Paper Diary .docx → diary.json
scripts/enrich_s2.py    연도·초록·인용수·참고문헌 보강 (이어받기 가능)
scripts/taxonomy.py     분야·방법론 키워드 규칙 (한/영 라벨)
scripts/build_map.py    SPECTER2 임베딩(제목+초록) → UMAP → 군집 → 군집 이름(c-TF-IDF)
scripts/eval_embeddings.py  임베딩별 편향 측정 (리뷰 언어·리뷰어 vs 주제)
scripts/build_site.py   위 데이터 합쳐서 site/data.js (+ --vault: Obsidian vault) — 데모는 site/data.demo.js
site/                   정적 사이트
  store.js              ★ 데이터 계층 (지금은 localStorage mock — DB 연결 시 이 파일만 교체)
  app.js                라우팅 · 사람/논문/함께 읽은 논문 · 상세 패널
  graph.js              그래프 (sigma.js + d3-force)
  auth.js               로그인 · 헤더 · 알림 벨
  social.js             댓글·질문·멘션 · 반응 · 번역 · 읽을 목록
  write.js / me.js / admin.js   다이어리 쓰기 · 내 페이지 · 관리자
  i18n.js               한/영 (각 페이지 파일이 I18N.extend로 문구 추가)
mcp/labsidian_mcp.py    Claude·Codex용 MCP 서버
scripts/serve.py        개발 서버 (정적 파일 + MCP 스냅샷/대기열)
```

## 사용법

```bash
# 0) ML 환경 (한 번만) — CPU로 충분
python -m venv .venv
.venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/Scripts/python -m pip install "sentence-transformers<6" adapters umap-learn scikit-learn numpy

# 1) 다이어리 가져오기
python scripts/parse_diary.py "2026 상반기 Paper Diary.docx" --term 2026H1

# 2) (선택) 메타데이터 보강 — 키 없으면 매우 느림. 무료 키: https://www.semanticscholar.org/product/api
S2_API_KEY=... python scripts/enrich_s2.py

# 3) 의미 지도 계산 (~3분) → 사이트 빌드
.venv/Scripts/python scripts/build_map.py          # 논문이 그대로면 --reuse 로 임베딩 재사용
python scripts/build_site.py

# 4) 로컬에서 보기 (MCP 연결용 스냅샷·대기열 포함 개발 서버)
python scripts/serve.py            # → http://localhost:8765
```

> 저장소를 새로 받으면 실제 데이터(`site/data.js`)가 없으므로 `python scripts/serve.py`가 자동으로 데모 연구실을 띄움. MCP 서버도 `data/diary.json`이 없으면 데모 데이터를 읽음.

### 데모용 가상 연구실 (발표·시연은 이걸로)
실제 다이어리는 구성원 동의 없이 보여주지 않는다. 가상 멤버 10명 · 리뷰 250편 (`data/demo/`): 논문은 실제 공개 논문(약 20%만 기존 목록 재사용, 나머지는 새로 찾음), 리뷰·메모는 Claude 서브에이전트(Sonnet)가 멤버 설정(`data/demo/personas.json`)대로 작성.

```bash
python scripts/demo_plan.py        # 멤버별 날짜·논문 배정 → data/demo/_work/ (비공개, 서브에이전트 입력)
# (서브에이전트가 data/demo/parts/<id>.json 작성)
python scripts/demo_build.py       # 합치기 + 누출 검사(실명·실제 리뷰 8어절 복사·실제 멤버와 관심사 코사인 ≥0.7) → data/demo/diary.json
LABSIDIAN_DATA=data/demo python scripts/enrich_s2.py
LABSIDIAN_DATA=data/demo .venv/Scripts/python scripts/build_map.py
LABSIDIAN_DATA=data/demo python scripts/build_site.py   # → site/data.demo.js
python scripts/serve.py 8766 --demo                     # → http://localhost:8766 (브라우저 저장소도 따로)
```
MCP도 `-e LABSIDIAN_DATA=data/demo -e LABSIDIAN_URL=http://localhost:8766`로 데모에 붙일 수 있음.

## 내 Claude · Codex 연결 (MCP)

각자 자기 AI를 Labsidian에 연결해서 말로 시키는 방식. 사이트에는 프롬프트 복사/붙여넣기 기능이 없음.

```bash
.venv/Scripts/python -m pip install mcp
```

**Claude Code**
```bash
claude mcp add labsidian -e LABSIDIAN_USER=한서윤 -- C:/dev/기타/Labsidian/.venv/Scripts/python.exe C:/dev/기타/Labsidian/mcp/labsidian_mcp.py
```

**Codex** (`~/.codex/config.toml`)
```toml
[mcp_servers.labsidian]
command = "C:/dev/기타/Labsidian/.venv/Scripts/python.exe"
args = ["C:/dev/기타/Labsidian/mcp/labsidian_mcp.py"]
env = { LABSIDIAN_USER = "한서윤" }
```

| 도구 | 하는 일 |
|---|---|
| `search_papers` `get_paper` `get_person` `similar_papers` `recommend_papers` `lab_progress` `list_tags` `my_inbox` `whoami` | 읽기 — 논문·리뷰·댓글·관심사·작성률 조회. 번역은 `get_paper`로 받아서 AI가 직접 |
| `create_draft` | 다이어리 **초안** 생성 → 내 페이지·알림에 도착, 본인이 검토 후 게시 (자동 게시 없음) |
| `add_comment` `add_to_reading_list` | 내 이름으로 댓글·질문(@멘션), 읽을 목록 추가 |
| `list_studies` `get_study` | 논문 스터디 목록·상세 (참가자 리뷰 비교, 질문 보드, 정리 노트) |
| `add_study_question` `draft_study_notes` | 스터디 질문 올리기, 정리 노트 **초안** (스터디 페이지에서 본인이 불러와 저장) |
| `admin_merge_tags` `admin_rename_tag` `admin_create_tag` `admin_set_member_quota` `admin_save_term` | 관리자만 — 태그 정리, 작성 의무(시작일·면제·목표), 학기 설정. 병합은 사이트 관리자 화면에서 되돌리기 가능 |

예: "Labsidian에서 차선변경 강화학습 논문 중 선배들이 좋게 본 거 찾아줘", "‘Drive Like a Human’ 리뷰들 영어로 번역해줘",
"이 PDF 읽고 다이어리 초안 만들어줘", (관리자) "비슷한 태그 찾아서 병합 계획 보여주고 내가 OK하면 병합해줘", "신입생은 9월 1일부터 작성으로 해줘".

**지금(DB 전)의 동작**: 열려 있는 사이트가 데이터 스냅샷을 `data/live_snapshot.json`으로 보내고(MCP가 읽음),
MCP가 요청한 작업은 `data/mcp_outbox.json`에 쌓였다가 사이트가 몇 초 안에 반영. → **사이트를 `scripts/serve.py`로 열어둔 상태**여야 함.
`LABSIDIAN_USER`는 지금은 그대로 믿음(데모). DB 연결 후엔 로그인 토큰으로 본인 확인 + DB에 직접 읽기/쓰기.
확인: `.venv/Scripts/python mcp/smoke_test.py 한서윤`

## GitHub Pages (데모 배포)

`main`에 push하면 `.github/workflows/pages.yml`이 `site/`를 배포하면서 `data.demo.js`를 `data.js` 자리에 넣음 → 가상 연구실만 공개됨.
처음 한 번: 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정.

## ⚠️ 실제 데이터 주의

`site/data.js`, `data/*`(`data/demo/` 제외), `vault/`, `video/`에는 **연구실 구성원 실명과 리뷰 전문**이 들어 있음.
`.gitignore`가 이 파일들의 커밋을 막아둠 — 실제 데이터는 연구실 서버 + 로그인(DB 단계)에서만 서비스.
