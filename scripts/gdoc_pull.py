"""Fetch the lab's shared Google Doc (scripts/gdoc_import web app) and import the diaries the lab doesn't have yet.

Runs on the server machine (it signs in with data/.local_secret), e.g. crontab:
    0 6 * * * cd <repo> && python3 scripts/gdoc_pull.py >> data/logs/gdoc.log 2>&1

data/gdoc_import.json (gitignored):
    {"url": "<web app URL …/exec>", "key": "<KEY from makeKey>", "server": "http://127.0.0.1:8765", "apply": false}
apply false = preview: prints what would be added, adds nothing. Nothing is sent when the doc hasn't changed.
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
CONF, STATE = DATA / "gdoc_import.json", DATA / "gdoc_import.state"


def main():
    conf = json.loads(CONF.read_text(encoding="utf-8"))
    apply = conf.get("apply") is True
    with urllib.request.urlopen(f"{conf['url']}?{urllib.parse.urlencode({'key': conf['key']})}", timeout=120) as r:
        doc = json.loads(r.read())
    if doc.get("error"):
        sys.exit(f"Google web app: {doc['error']}")
    stamp = f"{doc['name']} {doc['updated']} {apply}"
    if STATE.exists() and STATE.read_text(encoding="utf-8") == stamp:
        return print(f"{time.strftime('%F %T')} {doc['name']}: unchanged")
    req = urllib.request.Request(conf.get("server", "http://127.0.0.1:8765").rstrip("/") + "/api/import/diary",
                                 json.dumps({"docx": doc["docx"], "apply": apply}).encode(),
                                 {"Content-Type": "application/json", "X-Lab-Local": (DATA / ".local_secret").read_text(encoding="utf-8").strip()})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            res = json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"Labsidian {e.code}: {e.read()[:300].decode('utf-8', 'replace')}")
    line = lambda x: f"  {x['date']} {x['name']} · {x['title']}" + (f" ({x['reason']})" if x.get("reason") else "")
    print(f"{time.strftime('%F %T')} {doc['name']}: {res['found']} diaries in the doc · {len(res['added'])} "
          f"{'added' if res['applied'] else 'would be added (preview — set apply to true)'} · {len(res['skipped'])} skipped")
    print("\n".join(map(line, res["added"])))
    other = [x for x in res["skipped"] if x["reason"] != "duplicate"]
    if other:
        print("skipped, not duplicates:\n" + "\n".join(map(line, other)))
    STATE.write_text(stamp, encoding="utf-8")


if __name__ == "__main__":
    main()
