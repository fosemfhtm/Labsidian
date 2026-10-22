# Labsidian

A transportation & AI lab's shared paper diary. Vanilla JS single-page site in `site/` (no build step), served by
`scripts/serve.py`; see README.md for data and MCP.

## Workflow — where code changes go

- `main` on GitHub is the source of truth. The lab's live site runs on a separate machine and is updated from `main`
  by the maintainer; never edit code on the live machine, and never point tests or MCP writes at real lab data.
- This repo is public: never commit server addresses, account names, keys, tokens, firewall/tunnel details or other
  operations notes. Those live in private notes outside the repo.
- Try changes against the demo lab: `python scripts/serve.py 8766 --demo` (and `python mcp/labsidian_mcp.py --http`
  for the remote MCP mode).
- Before pushing, run what you touched: `node scripts/test_store.mjs`, `node scripts/test_views.mjs`,
  `python -m unittest discover -s scripts -p "test_*.py"`, `python mcp/smoke_test.py 한서윤 --writes` (demo server
  running), plus the design lint below for UI changes.
- Shared front-end helpers live in `site/app.js` (`LabUI`, e.g. `leaveGuard`, `submitOnce`); data rules live in
  `site/store.js`, which also runs headless on the server — reuse them instead of re-implementing per page.
- Bump the `?v=` of changed files in `site/index.html` / `site/login.html` so browsers fetch the new version.

## UI work — read the design rulebook first

Before adding or changing anything visible (CSS, markup in JS, UI copy, charts), read `docs/design/README.md` and the
section you need:

- values (type, colour, spacing, radius, motion, sizes) → `docs/design/foundations.md`
- elements (buttons, fields, lists, cards, menus, alerts, empty states…) → `docs/design/components.md`
- page layouts, states, confirm/undo, forms, responsive → `docs/design/patterns.md`
- graphs and charts → `docs/design/data-viz.md`
- any user-facing text → `docs/design/writing.md`

Rules that apply to every change:

- Target feel: a native macOS app. Desktop follows the macOS HIG (body 13, controls 28), phones (≤760px) the iOS HIG.
- Only tokens from `site/tokens.css`: `--t-*` for type, semantic colours (`--label`, `--fill-*`, `--accent`…),
  `--s-*` spacing, `--r-*` radii. No px font sizes, hex/rgb colours or ad-hoc radii in page CSS or inline styles.
  Inline `style=` only for data colours (via a `--c` variable) and dynamic sizes (bar widths).
- Use the `ui-*` components (buttons, segmented controls, chips/tags/pills, cards, rows, menus, popovers, sheets…).
  Old class names that remain (e.g. `.tp-row`) are layout hooks only — never style a component through them.
  Component selectors are `:where([data-ui]) .ui-x` and tokens.css loads first, so a page rule may set layout on a
  component with a single class. States use `aria-pressed` / `aria-current`, not an `.on` class. A component that
  isn't in components.md gets added to the `#/design` specimen (`site/design.js`) and to the doc first.
- Copy: 해요체 sentences, noun labels, the UI term is 다이어리 (never 리뷰), Apple-Korean action words
  (저장·편집·삭제·제거·추가·완료·취소), all strings through `t()` in KO and EN.
- Confirmations use `LabConfirm`, never `confirm()`/`prompt()`.
- A rule you need to break or change → write it in `docs/design/decisions.md` first.

After UI changes run the design lint (it must pass; it compares against a baseline of today's legacy values):

```
python scripts/design_lint.py
```

If you removed legacy values, lock it in with `python scripts/design_lint.py --update`. Never run `--update` to make
new violations pass.
