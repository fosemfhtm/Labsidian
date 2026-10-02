"""Paper Diary .docx -> data/diary.json

Usage:
    python scripts/parse_diary.py "path/to/2026 상반기 Paper Diary.docx" [--term 2026H1]

The diary is a flat sequence of paragraphs:
    <date header>        e.g. "2026년 6월 24일"
    <name line>          e.g. "홍길동 109"
    논문: / Link: / 저널: / 저자: / Rating: / 내용: (multi-line) / Memo: (multi-line)
Everything after "연구실 운영 규정" is lab policy and is dropped.
"""
import argparse
import html
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = json.loads((ROOT / "data" / "roster.json").read_text(encoding="utf-8"))
NAMES = [p["name"] for p in ROSTER]

DATE_RE = re.compile(r"^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})(?:~\d+)?일\s*(?:\((.*)\))?")
FIELD_RE = re.compile(r"^(논문|Link|저널|저자|Rating|내용|Memo)\s*[:：]\s*(.*)$", re.I)
STOP_MARKERS = ("연구실 운영 규정",)


def docx_paragraphs(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        p = re.sub(r"<w:(br|cr)/>", "\n", p)
        p = re.sub(r"<w:tab/>", "\t", p)
        parts = re.findall(r"<w:t(?: [^>]*)?>([^<]*)</w:t>|(\n|\t)", p)
        text = html.unescape("".join(t or ws for t, ws in parts))
        for line in text.split("\n"):
            yield line.rstrip()


def find_name(line):
    """Return the last roster name appearing in a line (handles '홍길동1김철수')."""
    hits = [(line.rfind(n), n) for n in NAMES if n in line]
    return max(hits)[1] if hits else None


def parse(lines, term):
    entries, cur, date, note, author = [], None, None, None, None
    field = None
    started = False

    def flush():
        nonlocal cur
        if cur and cur["title"].strip():
            for k in ("content", "memo"):
                cur[k] = "\n".join(cur[k]).strip()
            entries.append(cur)
        cur = None

    for line in lines:
        s = line.strip()
        if any(s.startswith(m) for m in STOP_MARKERS):
            break
        m = DATE_RE.match(s)
        if m and len(s) < 40:
            flush()
            y, mo, d, note = m.groups()
            date = f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
            started = True
            field = None
            continue
        if not started:
            continue
        fm = FIELD_RE.match(s)
        if fm:
            key, val = fm.group(1).lower(), fm.group(2).strip()
            if key == "논문":
                flush()
                cur = {"date": date, "dateNote": note, "author": author or "미상",
                       "title": val, "link": "", "venue": "", "authors": "",
                       "rating": 0, "content": [], "memo": [], "term": term}
                field = None
            elif cur is None:
                continue
            elif key == "link":
                cur["link"] = val
            elif key == "저널":
                cur["venue"] = val
            elif key == "저자":
                cur["authors"] = val
            elif key == "rating":
                cur["rating"] = min(5, val.count("✯") + val.count("★"))
            elif key == "내용":
                field = "content"
                if val:
                    cur["content"].append(val)
            elif key == "memo":
                field = "memo"
                if val:
                    cur["memo"].append(val)
            continue
        # a short line containing a roster name = start of someone's block
        name = find_name(s) if len(s) <= 30 else None
        if name:
            flush()
            author = name
            field = None
            continue
        if cur is not None and field and s:
            cur[field].append(s)
    flush()
    return entries


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("docx")
    ap.add_argument("--term", default="2026H1")
    ap.add_argument("--out", default=str(ROOT / "data" / "diary.json"))
    a = ap.parse_args()

    entries = parse(docx_paragraphs(a.docx), a.term)
    out = Path(a.out)
    # merge with existing terms so multiple semesters can live in one file
    existing = json.loads(out.read_text(encoding="utf-8")) if out.exists() else []
    merged = [e for e in existing if e.get("term") != a.term] + entries
    out.write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")

    from collections import Counter
    c = Counter(e["author"] for e in entries)
    print(f"{len(entries)} entries ({a.term}) -> {out}", file=sys.stderr)
    for n, k in c.most_common():
        print(f"  {n}: {k}", file=sys.stderr)


if __name__ == "__main__":
    main()
