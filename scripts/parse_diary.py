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
from datetime import date as Date
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from build_site import ROOT, read_json, write_json

DATE_RE = re.compile(r"^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})(?:~\d+)?일\s*(?:\((.*)\))?")
FIELD_RE = re.compile(r"^(논문|Link|저널|저자|Rating|내용|Memo)\s*[:：]\s*(.*)$", re.I)
STOP_MARKERS = ("연구실 운영 규정",)


def docx_paragraphs(path):
    with zipfile.ZipFile(path) as doc:
        root = ET.fromstring(doc.read("word/document.xml"))
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    for p in root.iter(ns + "p"):
        text = "".join(e.text or "" if e.tag == ns + "t" else "\t" if e.tag == ns + "tab"
                       else "\n" if e.tag in (ns + "br", ns + "cr") else "" for e in p.iter())
        for line in text.split("\n"):
            yield line.rstrip()


def find_name(line, names, aliases):
    """Return the last whole roster name, preferring longer names over overlapping suffixes."""
    pattern = "|".join(map(re.escape, sorted(names, key=len, reverse=True)))
    hits = list(re.finditer(pattern, line)) if names else []
    if hits and not re.sub(r"[\d\s]+", "", re.sub(pattern, "", line)):
        return hits[-1].group()
    return aliases.get(re.sub(r"[\d\s]+$", "", line))


def parse(lines, term, roster):
    names = [p["name"] for p in roster]
    aliases = {a: p["name"] for p in roster for a in p.get("aliases", [])}
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
            date = Date(int(y), int(mo), int(d)).isoformat()
            author = None
            started = True
            field = None
            continue
        if not started:
            continue
        fm = FIELD_RE.match(s)
        if fm:
            key, val = fm.group(1).lower(), fm.group(2).strip()
            if key not in ("내용", "memo"):
                field = None
            if key == "논문":
                flush()
                cur = {"date": date, "dateNote": note, "author": author or "미상",
                       "title": val, "link": "", "venue": "", "authors": "",
                       "rating": 0, "content": [], "memo": [], "term": term}
            elif cur is None:
                continue
            elif key in ("link", "저널", "저자"):
                cur[{"link": "link", "저널": "venue", "저자": "authors"}[key]] = val
            elif key == "rating":
                cur["rating"] = min(5, val.count("✯") + val.count("★"))
            elif key in ("내용", "memo"):
                field = "content" if key == "내용" else "memo"
                if val:
                    cur[field].append(val)
            continue
        # A roster name plus optional numbering starts someone's block, not a sentence mentioning them.
        name = find_name(s, names, aliases) if len(s) <= 30 else None
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

    roster = read_json(ROOT / "data" / "roster.json")
    entries = parse(docx_paragraphs(a.docx), a.term, roster)
    out = Path(a.out)
    # merge with existing terms so multiple semesters can live in one file
    existing = read_json(out) if out.exists() else []
    merged = [e for e in existing if e.get("term") != a.term] + entries
    write_json(out, merged, indent=1)

    from collections import Counter
    c = Counter(e["author"] for e in entries)
    print(f"{len(entries)} entries ({a.term}) -> {out}", file=sys.stderr)
    for n, k in c.most_common():
        print(f"  {n}: {k}", file=sys.stderr)


if __name__ == "__main__":
    main()
