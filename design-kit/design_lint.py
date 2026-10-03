"""Design-kit lint: counts values that bypass the design tokens and fails when a count goes up (a ratchet).

    python design_lint.py                 compare with the baseline → exit 1 if any (check, file) count grew
    python design_lint.py --update        write the current counts as the new baseline (after a clean-up, or an
                                          exception you've written down in docs/decisions.md)
    python design_lint.py --list CHECK    print every occurrence of one check (e.g. --list raw-font)
    python design_lint.py --config path   use another config file (default: ./design_lint.json)

design_lint.json (all keys optional; paths relative to the config file):
    {
      "css": ["src/styles/*.css"],             files to check for CSS rules
      "js": ["src/**/*.js"],                   files to check for markup / dialogs in JS
      "tokens": "design-kit/tokens.css",       the one file where custom properties may hold literal values
      "skip": ["src/vendor/**"],               globs to ignore
      "breakpoints": [760, 761, 900, 901],     @media widths that are allowed
      "banned_words": {"유저": "사용자"},      UI words to avoid → the term to use (writing.md glossary)
      "baseline": "design_lint_baseline.json"
    }

A legacy codebase usually starts with many old values: the first run writes the baseline, new code must not add to it,
clean-ups lower it (then --update).  In JS, "// design-lint: off (reason)" … "// design-lint: on" hides a data table that
must hold hex (e.g. user-picked colours) from js-color — list each such block in docs/decisions.md.

Checks — CSS (custom-property definitions may hold literals only in the tokens file):
  raw-font       font / font-size with a px·rem·em size instead of var(--t-*) / var(--fs-*)   foundations §1
  tiny-font      a font size below 10px (the macOS minimum)                                   foundations §1
  raw-color      hex / rgb() / hsl() literal outside the tokens file's custom properties (masks excepted)   foundations §2
  raw-radius     border-radius with a px·rem literal instead of var(--r-*) (0 and 50% are fine)   foundations §5
  breakpoint     @media width other than the configured breakpoints                          foundations §4
  important      !important
Checks — JS:
  inline-style   style="…" carrying a colour literal, a font size, margin or padding
  js-color       hex colour literal in code                                                   data-viz §2
  native-dialog  browser confirm() / prompt() / alert() instead of AppUI.confirm / AppUI.sheet components
  banned-word    a word from banned_words                                                    writing §2
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

CONFIG = {"css": ["**/*.css"], "js": ["**/*.js"], "tokens": "tokens.css", "skip": ["node_modules/**", ".git/**"],
          "breakpoints": [420, 421, 760, 761, 900, 901], "banned_words": {}, "baseline": "design_lint_baseline.json"}
ROOT = Path.cwd()
BREAKPOINTS_OK = set(CONFIG["breakpoints"])
TOKENS_NAME = "tokens.css"
BANNED = {}

HEX = r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b"
RGB = r"\b(?:rgba?|hsla?)\(\s*[\d.]"           # rgb(0 0 0 / .3) — not rgb(var(--red))
SIZE = r"(?<![\w.-])(\d*\.?\d+)(px|rem|em)\b"

DECL = re.compile(r"([-\w]+)\s*:\s*([^;{}]+?)\s*(?=[;}])")
MEDIA = re.compile(r"@media[^{]*")


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def strip_css_comments(text):
    # keep newlines so line numbers stay right
    return re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group()), text, flags=re.S)


def css_findings(path):
    raw = path.read_text(encoding="utf-8")
    text = strip_css_comments(raw)
    is_tokens = path.name == TOKENS_NAME
    out = []

    def add(check, pos, snippet):
        out.append((check, line_of(text, pos), snippet.strip()[:120]))

    for m in DECL.finditer(text):
        prop, value = m.group(1).lower(), m.group(2)
        if prop.startswith("--"):
            if not is_tokens and (re.search(HEX, value) or re.search(RGB, value)):
                add("raw-color", m.start(), f"{prop}: {value}")
            continue
        snippet = f"{prop}: {value}"
        if prop in ("font", "font-size") and "var(--t-" not in value:
            sizes = [(float(n), u) for n, u in re.findall(SIZE, value.split("/")[0])]
            if sizes:
                add("raw-font", m.start(), snippet)
                if any(u == "px" and n < 10 for n, u in sizes):
                    add("tiny-font", m.start(), snippet)
        if "url(" not in value and "mask" not in prop and (re.search(HEX, value) or re.search(RGB, value)):
            add("raw-color", m.start(), snippet)
        if prop.endswith("radius") and "var(--r-" not in value:
            if any(float(n) > 0 for n, _ in re.findall(SIZE, value)):
                add("raw-radius", m.start(), snippet)
        if "!important" in value:
            add("important", m.start(), snippet)

    for m in MEDIA.finditer(text):
        for w in re.findall(r"(?:max|min)-width\s*:\s*(\d+)px", m.group()):
            if int(w) not in BREAKPOINTS_OK:
                add("breakpoint", m.start(), m.group())
    return out


STYLE_ATTR = re.compile(r"""style\s*=\s*\\?(["'`])(.*?)\\?\1""", re.S)
STYLE_BAD = re.compile(HEX + "|" + RGB + r"|font-size|font:|margin|padding")
NATIVE = re.compile(r"(?<![\w.$])(?:window\.)?(confirm|prompt|alert)\s*\(")


def js_findings(path):
    text = path.read_text(encoding="utf-8")
    # "// design-lint: off (reason)" … "// design-lint: on" hides a block from js-color — only for data tables that
    # must hold hex (legacy palettes, person colours); each such block is listed in docs/decisions.md
    off = [(m.start(), (text.find("design-lint: on", m.end()) % (len(text) + 1)) or len(text))
           for m in re.finditer(r"design-lint: off", text)]
    out = []

    def add(check, pos, snippet):
        out.append((check, line_of(text, pos), snippet.strip().replace("\n", " ")[:120]))

    for m in STYLE_ATTR.finditer(text):
        if STYLE_BAD.search(m.group(2)):
            add("inline-style", m.start(), m.group())
    for m in re.finditer(r"""(?<=["'`(:\s,])""" + HEX, text):
        if not any(a <= m.start() < b for a, b in off):
            add("js-color", m.start(), text[max(0, m.start() - 30): m.end() + 10])
    for m in NATIVE.finditer(text):
        add("native-dialog", m.start(), text[m.start(): m.start() + 60])
    for word, use in BANNED.items():
        for m in re.finditer(re.escape(word), text):
            add("banned-word", m.start(), f"{word} → {use}: " + text[max(0, m.start() - 30): m.end() + 30])
    return out


def files(globs):
    skip = [g for g in CONFIG["skip"]]
    out = set()
    for g in globs:
        for p in ROOT.glob(g):
            rel = p.relative_to(ROOT).as_posix()
            if p.is_file() and not any(Path(rel).match(x) or rel.startswith(x.rstrip("*").rstrip("/") + "/") for x in skip):
                out.add(p)
    return sorted(out)


def collect():
    findings = []   # (check, file, line, snippet)
    for p in files(CONFIG["css"]):
        findings += [(c, p.relative_to(ROOT).as_posix(), ln, s) for c, ln, s in css_findings(p)]
    for p in files(CONFIG["js"]):
        findings += [(c, p.relative_to(ROOT).as_posix(), ln, s) for c, ln, s in js_findings(p)]
    return findings


def changed_lines(name):
    """Line numbers of site/<name> added or changed since HEAD — where a new violation most likely is."""
    import subprocess
    try:
        diff = subprocess.run(["git", "diff", "-U0", "HEAD", "--", name], cwd=ROOT,
                              capture_output=True, text=True, encoding="utf-8").stdout
    except OSError:
        return set()
    lines = set()
    for start, n in re.findall(r"^@@ -\S+ \+(\d+)(?:,(\d+))? @@", diff, flags=re.M):
        lines.update(range(int(start), int(start) + int(n or 1)))
    return lines


def counts_of(findings):
    counts = defaultdict(lambda: defaultdict(int))
    for check, f, _, _ in findings:
        counts[check][f] += 1
    return {c: dict(sorted(fs.items())) for c, fs in sorted(counts.items())}


def load_config(argv):
    global ROOT, BREAKPOINTS_OK, TOKENS_NAME, BANNED, BASELINE
    cfg = Path(argv[argv.index("--config") + 1]) if "--config" in argv else Path("design_lint.json")
    if cfg.exists():
        CONFIG.update(json.loads(cfg.read_text(encoding="utf-8")))
        ROOT = cfg.resolve().parent
    BREAKPOINTS_OK = set(CONFIG["breakpoints"])
    TOKENS_NAME = Path(CONFIG["tokens"]).name
    BANNED = CONFIG["banned_words"] if isinstance(CONFIG["banned_words"], dict) else {w: "" for w in CONFIG["banned_words"]}
    BASELINE = ROOT / CONFIG["baseline"]


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    load_config(argv)
    findings = collect()
    counts = counts_of(findings)

    if "--list" in argv:
        check = argv[argv.index("--list") + 1] if len(argv) > argv.index("--list") + 1 else ""
        for c, f, ln, s in findings:
            if c == check:
                print(f"{f}:{ln}  {s}")
        return 0

    if "--update" in argv or not BASELINE.exists():
        BASELINE.write_text(json.dumps(counts, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"baseline written: {BASELINE.name}")
        for c, fs in counts.items():
            print(f"  {c:<14} {sum(fs.values()):>5}")
        return 0

    base = json.loads(BASELINE.read_text(encoding="utf-8"))
    grew, shrank = [], []
    checks = sorted(set(counts) | set(base))
    print(f"{'check':<14} {'now':>5} {'base':>5}")
    for c in checks:
        now, was = counts.get(c, {}), base.get(c, {})
        print(f"{c:<14} {sum(now.values()):>5} {sum(was.values()):>5}")
        for f in sorted(set(now) | set(was)):
            n, b = now.get(f, 0), was.get(f, 0)
            if n > b:
                grew.append((c, f, n, b))
            elif n < b:
                shrank.append((c, f, n, b))

    if grew:
        print("\nFAILED — new values outside the design tokens (see docs/):")
        for c, f, n, b in grew:
            print(f"\n  {c} in {f}: {b} → {n}")
            rows = [(ln, s) for cc, ff, ln, s in findings if cc == c and ff == f]
            new = changed_lines(f)
            fresh = [r for r in rows if r[0] in new]
            if fresh:
                print("    on lines changed since the last commit:")
            for ln, s in (fresh or rows)[:12]:
                print(f"    {f}:{ln}  {s}")
            if not fresh:
                print(f"    (no changed line found — all of them: python scripts/design_lint.py --list {c})")
        print("\nUse a token / ui-* component instead. If it is a real exception, record it in "
              "docs/decisions.md and run with --update.")
        return 1
    if shrank:
        print("\nOK — counts went down; run with --update to lock in the improvement.")
    else:
        print("\nOK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
