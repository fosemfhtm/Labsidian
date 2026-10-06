/* Labsidian Store — MOCK backend (browser localStorage).
 *
 * Everything the UI reads or writes goes through window.Store. Methods are async and return plain
 * objects, mirroring what the Supabase version will do, so later only this file is replaced
 * (store-supabase.js) and the pages stay the same.
 *
 * ⚠ Mock only: data lives in this browser, "login" is not security. Initial accounts are seeded from
 *   window.LAB.people (+ an "admin" account); their first password is MOCK_INITIAL_PASSWORD and must be
 *   changed on first login.
 *
 * Load order: data.js (read-only import of the docx diary) → store.js (merges local changes into
 * window.LAB) → app.js / pages / graph.js.
 */
(() => {
  // a non-default dataset (e.g. the fake demo lab, LAB.dataset = "demo") keeps its own browser storage
  const NS = window.LAB && window.LAB.dataset ? `.${window.LAB.dataset}` : "";
  const KEY = `labsidian.db.v1${NS}`, SESSION = `labsidian.session${NS}`, FILES_DB = `labsidian.files${NS}`;
  const MOCK_INITIAL_PASSWORD = "labsidian";
  const SEED = window.LAB;
  const DEMO = SEED.dataset === "demo";  // public demo lab: one-click sign-in, no forced password change
  // design-lint: off (person colours are hex by design — members pick any colour; legacy palettes map old data)
  // Apple system colours (light variants read well on both themes): orange blue green purple yellow cyan red pink gray mint teal brown indigo
  const SYSTEM_COLORS = ["#ff8d28", "#0088ff", "#34c759", "#cb30e0", "#ffcc00", "#00c0e8", "#ff383c", "#ff2d55", "#8e8e93", "#00c8b3", "#00c3d0", "#ac7f5e", "#6155f5"];
  // the 12 colours the site build hands out map to 12 different system colours, never gray ("other / none" in charts)
  const LEGACY_TO_SYSTEM = { "#f78c6c": 0, "#82aaff": 1, "#c3e88d": 2, "#c792ea": 3, "#ffcb6b": 4, "#89ddff": 5, "#ff5370": 6, "#f07178": 7,
    "#b2ccd6": 12, "#addb67": 9, "#7fdbca": 10, "#e2b93d": 11, "#ff9cac": 7, "#a6accd": 12, "#ffd580": 4, "#80cbc4": 10 };
  const sysColor = c => (c && LEGACY_TO_SYSTEM[c.toLowerCase()] != null ? SYSTEM_COLORS[LEGACY_TO_SYSTEM[c.toLowerCase()]] : c);
  // Data colours (docs/design/data-viz.md §2): topics, methods and map regions use system colour *names*, kept as
  // "rgb(var(--name))" so they follow the theme. Older builds wrote fixed palettes — mapped here by position.
  const SYS_NAMES = ["red", "orange", "yellow", "green", "mint", "teal", "cyan", "blue", "indigo", "purple", "pink", "brown"];
  const LEGACY_DATA = {};
  [[["#ff7b72", "#ffa657", "#d2a8ff", "#79c0ff", "#7ee787", "#f2cc60", "#ff9bce", "#a5d6ff", "#56d4dd", "#e3b341", "#bc8cff", "#ffb4a1",
     "#8ddb8c", "#f0883e", "#a371f7", "#6cb6ff", "#d0d7de"], ["red", "orange", "purple", "blue", "green", "yellow", "pink", "cyan", "teal", "brown", "indigo", "mint"]],
   [["#e0a3ff", "#ff8f6b", "#6ee7b7", "#93c5fd", "#fca5a5", "#5eead4", "#fcd34d", "#c4b5fd", "#a3e635", "#f9a8d4", "#94a3b8"],
    ["purple", "orange", "mint", "blue", "red", "teal", "yellow", "indigo", "green", "pink", "brown"]],
   [["#7aa2f7", "#f7768e", "#9ece6a", "#e0af68", "#bb9af7", "#7dcfff", "#ff9e64", "#2ac3de", "#c0caf5", "#f4b8e4", "#73daca", "#e5c890", "#a6d189", "#ca9ee6"],
    ["blue", "red", "green", "yellow", "purple", "cyan", "orange", "teal", "indigo", "pink", "mint", "brown"]],
  ].forEach(([hexes, names]) => hexes.forEach((h, i) => (LEGACY_DATA[h] = names[i % names.length])));
  LEGACY_DATA["#9da7b3"] = "gray2";   // "no colour chosen" for custom tags
  // a tag still on an old palette colour gets the next of 12 names by its place in its axis (old palettes had 11 and repeated)
  const AXIS_NAMES = { domain: ["red", "orange", "purple", "blue", "green", "yellow", "pink", "cyan", "teal", "brown", "indigo", "mint"],
    method: ["purple", "orange", "mint", "blue", "red", "teal", "yellow", "indigo", "green", "pink", "brown", "cyan"] };
  const dataColor = c => {
    const k = String(c || "").trim().toLowerCase();
    if (/^rgb\(var\(--[a-z0-9]+\)\)$/.test(k)) return k;
    const name = SYS_NAMES.includes(k) || k === "gray" || k === "gray2" ? k : LEGACY_DATA[k];
    if (name) return `rgb(var(--${name}))`;
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(k) ? k : "rgb(var(--gray2))";   // a hex an admin picked stays as it is
  };
  (SEED.clusters || []).forEach(c => { if (c.color) c.color = dataColor(c.color); });
  const PERSON_COLORS = ["#f78c6c", "#82aaff", "#c3e88d", "#c792ea", "#ffcb6b", "#89ddff", "#ff5370", "#f07178",
    "#b2ccd6", "#addb67", "#7fdbca", "#e2b93d", "#ff9cac", "#a6accd", "#ffd580", "#80cbc4"];
  // design-lint: on

  // ---------------------------------------------------------------- persistence
  const empty = () => ({
    version: 1, users: {}, reviews: {}, reviewEdits: {}, comments: {}, reactions: {}, reading: {},
    notifications: {}, drafts: {}, tagOps: [], terms: null, log: [], seq: 1, studies: {}, studyQs: {},
    paperTags: {}, clusterNames: {},  // admin corrections: a paper's domain/method tags · a map region's name
    offDays: {},  // the lab's weekdays off (public holidays, shutdowns, conferences): no diary owed
    guides: {},   // core-paper guides the lab curates together (docs/PEOPLE_TOPICS_GUIDES.md)
  });
  // Labsidian server (scripts/serve.py, on this machine or the lab's): the source of truth is its SQLite file. The page
  // loads it once, sends only the records it changed, and picks up changes made elsewhere (MCP ops, other tabs). The
  // server signs people in (session cookie) and keeps password hashes to itself. Static host (GitHub Pages, no /api) or
  // the headless copy the server runs for MCP ops (scripts/store_worker.mjs): localStorage.
  // A record = one entry of a collection below (a user, a review, one member's notifications …) or one other top-level key.
  const COLLS = ["users", "reviews", "reviewEdits", "comments", "reactions", "reading", "notifications", "drafts", "mcpDrafts", "studies", "studyQs",
    "paperTags", "clusterNames", "offDays", "guides"];
  const recordsOf = d => {
    const m = new Map();
    Object.entries(d).forEach(([k, v]) => {
      if (COLLS.includes(k)) Object.entries(v || {}).forEach(([id, x]) => m.set(`${k}\u0000${id}`, JSON.stringify(x)));
      else if (v !== undefined) m.set(`_meta\u0000${k}`, JSON.stringify(v));
    });
    return m;
  };
  const xhr = (method, url, body) => {  // synchronous: the pages expect window.Store to be ready when this script ends
    try {
      const x = new XMLHttpRequest(); x.open(method, url, false);
      if (body) x.setRequestHeader("Content-Type", "application/json");
      x.send(body ? JSON.stringify(body) : null);
      return { status: x.status, body: x.status === 200 ? JSON.parse(x.responseText) : null };
    } catch (e) { return { status: 0, body: null }; }
  };
  const fromLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
  const HEADLESS = !!window.__LABSIDIAN_HEADLESS__;
  let db, server = null;  // server: { version, synced: Map(record → JSON last known to the server), failed }
  const res = HEADLESS ? null : xhr("GET", "/api/state"), state = res?.body;
  // a server that wants a sign-in first: its demo lab shows the sign-in screen with nothing loaded or stored yet
  // (the real lab's server shows login.html instead, so its data never reaches a signed-out browser)
  const SERVER = !!state || res?.status === 401;
  let migrateFiles = false;
  if (state) {
    let d = state.db, version = state.version;
    // first visit after the server started keeping the data: move what this browser had (in localStorage) over, once
    const old = state.seedOnly && fromLocal();
    const used = d => Object.values(d.users || {}).some(u => u.pw) || COLLS.some(c => c !== "users" && Object.keys(d[c] || {}).length);
    if (old && used(old)) {
      const r = xhr("POST", "/api/state/import", { db: old }).body;
      if (r) { d = r.db; version = r.version; migrateFiles = true; }
    }
    db = Object.assign(empty(), d || {});
    server = { version, synced: recordsOf(db), failed: false };
  } else db = Object.assign(empty(), fromLocal() || {});

  let saving = Promise.resolve();
  const save = () => {
    if (!server) { if (!SERVER) try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn("store save failed", e); } return; }
    const cur = recordsOf(db), upserts = [], deletes = [];
    cur.forEach((v, k) => { if (server.synced.get(k) !== v) upserts.push([...k.split("\u0000"), JSON.parse(v)]); });
    server.synced.forEach((_, k) => { if (!cur.has(k)) deletes.push(k.split("\u0000")); });
    if (!upserts.length && !deletes.length) return;
    const before = server.synced;
    server.synced = cur;
    saving = saving.then(() => fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upserts, deletes }) }))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then(r => { const missed = r.prev !== server.version; server.version = r.version; server.failed = false; if (missed) pull(); })
      .catch(e => {
        // not stored: mark these records unsynced so the next save (or the poll below) sends them again
        console.warn("store save failed", e);
        upserts.forEach(([c, id]) => server.synced.set(`${c}\u0000${id}`, "\u0001unsynced"));
        deletes.forEach(([c, id]) => server.synced.set(`${c}\u0000${id}`, before.get(`${c}\u0000${id}`) || "\u0001unsynced"));
        if (!server.failed) window.dispatchEvent(new CustomEvent("lab:syncerror"));
        server.failed = true;
      });
  };
  const uid = p => `${p}${Date.now().toString(36)}${(db.seq++).toString(36)}`;
  const now = () => new Date().toISOString();
  // local calendar date (toISOString() is UTC → "yesterday" before 9am in Korea)
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const VIEW_KEY = `labsidian.viewTerms${NS}`;
  const viewTerms = () => { try { return JSON.parse(localStorage.getItem(VIEW_KEY) || "[]"); } catch (e) { return []; } };
  const log = (action, detail) => { db.log.unshift({ at: now(), actor: session(), action, detail }); db.log = db.log.slice(0, 300); };

  // ---------------------------------------------------------------- attachments (PDF · images)
  // Mock: blobs live in this browser's IndexedDB; review rows only keep {id, name, type, size, kind}.
  // Supabase version: Storage bucket "attachments" (same metadata in the review row).
  const FILE_LIMIT = { pdf: 20 * 1024 * 1024, image: 5 * 1024 * 1024 };
  let idbP = null;
  const idb = () => idbP ||= new Promise((res, rej) => {
    const q = indexedDB.open(FILES_DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore("files");
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
  const idbDo = async (mode, fn) => {
    const d = await idb();
    return new Promise((res, rej) => { const tx = d.transaction("files", mode), rq = fn(tx.objectStore("files")); tx.oncomplete = () => res(rq.result); tx.onerror = () => rej(tx.error); });
  };
  const fileUrls = {};
  const cleanFiles = list => (Array.isArray(list) ? list : []).filter(f => f && f.id && (f.kind === "pdf" || f.kind === "image"))
    .map(({ id, name, type, size, kind }) => ({ id, name: String(name || "").slice(0, 200), type, size: +size || 0, kind }));
  // tag colours: a system colour name (data-viz.md §2), or an older #hex; anything else → "gray2"
  const safeColor = c => (SYS_NAMES.includes(c) || c === "gray2" || /^#[0-9a-f]{3,8}$/i.test(c || "") ? c : "gray2");
  const cleanTag = id => { const m = /^([dmf]):(.+)$/.exec(String(id || "")); return m ? `${m[1]}:${m[2].toLowerCase().replace(/[^0-9a-z가-힣_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}` : null; };
  const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && !isNaN(Date.parse(d));

  // ---------------------------------------------------------------- helpers
  const normTitle = t => (t || "").toLowerCase().replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/[^0-9a-z가-힣]+/g, "");
  const slug = s => s.trim().toLowerCase().replace(/[^0-9a-z가-힣]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const termOf = date => { const [y, m] = date.split("-").map(Number); return `${y}H${m <= 6 ? 1 : 2}`; };
  async function hash(pw, salt) {
    const txt = salt + ":" + pw;
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    }
    let h = 0; for (const c of txt) h = (h * 31 + c.charCodeAt(0)) | 0; return "x" + h;
  }
  const randomPassword = () => Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6);

  // ---------------------------------------------------------------- demo: dates relative to today
  // The fake demo lab (LAB.relativeDates) is moved forward by whole weeks so its latest diary lands in the current
  // week: weekdays stay weekdays and the demo looks like an active lab whenever it's opened. The shift is fixed the
  // first time this browser opens the demo (db.dayShift), so diaries and the seeded studies/comments age together;
  // admin → reset starts fresh.
  const DAY = 864e5;
  const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
  const demoSessions = new Set(SEED.reviews.map(r => r.date)).size;  // diary target per term, before shifting
  if (SEED.relativeDates && SEED.reviews.length) {
    if (db.dayShift == null) {
      const last = SEED.reviews.reduce((m, r) => (r.date > m ? r.date : m), "");
      db.dayShift = Math.max(0, Math.floor((Date.parse(today() + "T00:00:00Z") - Date.parse(last + "T00:00:00Z")) / (7 * DAY))) * 7;
    }
    if (db.dayShift) {
      SEED.reviews.forEach(r => { r.date = addDays(r.date, db.dayShift); r.term = termOf(r.date); });
      SEED.papers.forEach(p => { if (p.firstDate) p.firstDate = addDays(p.firstDate, db.dayShift); });
      SEED.people.forEach(p => { p.dates = (p.dates || []).map(([d, n]) => [addDays(d, db.dayShift), n]); });
      SEED.terms = [...new Set(SEED.reviews.map(r => r.term))].sort();
    }
  }
  const termDef = (id, target) => {
    const [y, h] = id.split("H");
    return { id, label: `${y} ${h === "1" ? "상반기" : "하반기"}`, start: `${y}-${h === "1" ? "01-01" : "07-01"}`, end: `${y}-${h === "1" ? "06-30" : "12-31"}`, target };
  };

  // ---------------------------------------------------------------- seed users & terms
  function ensureSeed() {
    let changed = false;
    if (!db.users.admin) {
      db.users.admin = { id: "admin", name: "admin", role: "admin", pw: null, mustChange: !DEMO, createdAt: now() };
      changed = true;
    }
    SEED.people.forEach(p => {
      if (!db.users[p.id]) { db.users[p.id] = { id: p.id, name: p.name, role: "member", pw: null, mustChange: !DEMO, createdAt: now() }; changed = true; }
    });
    if (!db.terms && SEED.relativeDates) {  // demo: whichever terms the shifted diary spans, plus the current one
      db.terms = [...new Set([...SEED.reviews.map(r => r.term), termOf(today())])].sort().map(id => termDef(id, demoSessions || 110));
      changed = true;
    }
    if (!db.terms) {
      const sessionsH1 = new Set(SEED.reviews.filter(r => r.term === "2026H1").map(r => r.date)).size || 110;
      db.terms = [
        { id: "2026H1", label: "2026 상반기", start: "2026-01-01", end: "2026-06-30", target: sessionsH1 },
        { id: "2026H2", label: "2026 하반기", start: "2026-07-01", end: "2026-12-31", target: sessionsH1 },
      ];
      changed = true;
    }
    if (SEED.social && !db.socialSeeded) { seedSocial(SEED.social); db.socialSeeded = true; changed = true; }
    if (SEED.social?.guides && !db.guidesSeeded) { seedGuides(SEED.social.guides); db.guidesSeeded = true; changed = true; }  // added after the rest
    if (changed) save();
  }
  const seededStudies = {};  // demo: social.json study key → its id, so guides can point at sessions
  // demo dataset only: example core-paper guides (lab papers by id, outside ones by their details)
  function seedGuides(list) {
    list.forEach((x, i) => {
      if (!db.users[x.owner]) return;
      const id = "g_demo_" + x.key, at = new Date(Date.now() + (x.dayOffset || -7) * 864e5).toISOString();
      const sections = x.sections.map((title, k) => ({ id: "s" + (k + 1), title }));
      const items = x.items.map((it, k) => {
        const p = it.paperId && SEED.papers.find(q => q.id === it.paperId);
        if (it.paperId && !p) return null;
        const base = { id: `gi_demo_${x.key}_${k}`, section: sections[it.section]?.id || "s1", key: normTitle(p ? p.title : it.meta.title), note: it.note || "",
          ...(it.fromStudy && seededStudies[it.fromStudy] ? { from: { studyId: seededStudies[it.fromStudy], kind: it.fromKind || "next" } } : {}),
          by: db.users[it.by] ? it.by : x.owner, at: new Date(Date.parse(at) + k * 36e5).toISOString(), votes: (it.votes || []).filter(u => db.users[u]) };
        return p ? { ...base, paperId: p.id } : { ...base, meta: { title: it.meta.title, link: it.meta.link || "", authors: it.meta.authors || "", venue: it.meta.venue || "", year: String(it.meta.year || "") } };
      }).filter(Boolean);
      db.guides[id] = { id, title: x.title, desc: x.desc || "", tags: x.tags || [], owner: x.owner, sections, items, createdAt: at, updatedAt: items.at(-1)?.at || at };
      if (x.group) {  // a reading group: its weekday follows the seeded upcoming session (dates are relative to today)
        const next = Object.values(db.studies).filter(st => st.guideId === id && !st.closed && st.date).map(st => st.date).sort()[0];
        db.guides[id].group = { on: true, members: (x.group.members || []).filter(u => db.users[u]), place: x.group.place || "", reminded: {},
          cadence: { weekday: next ? new Date(next + "T00:00:00Z").getUTCDay() : 4, time: x.group.time || "", every: x.group.every === 2 ? 2 : 1 } };
      }
    });
  }
  // demo dataset only: example studies / comments / reactions, dated relative to today so they never look stale
  function seedSocial(s) {
    const day = off => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    const at = (off, h = 0) => new Date(Date.now() + off * 864e5 - h * 36e5).toISOString();
    const paper = id => SEED.papers.find(p => p.id === id);
    const known = list => (list || []).filter(u => db.users[u]);
    const offsetOf = d => Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(today() + "T00:00:00Z")) / DAY);
    const revDate = id => SEED.reviews.find(r => r.id === id)?.date;
    (s.studies || []).forEach((x, i) => {
      const p = paper(x.paperId); if (!p) return;
      const id = uid("s_"), members = known([...new Set([x.host, x.presenter, ...(x.members || [])])]);
      if (x.key) seededStudies[x.key] = id;
      // a past study comes after its members' diaries on the common paper
      const lastRev = SEED.reviews.filter(r => r.paper === p.id && members.includes(r.person)).map(r => r.date).sort().pop();
      if (x.closed && lastRev && day(x.dayOffset) <= lastRev && addDays(lastRev, 2) < today()) x = { ...x, dayOffset: offsetOf(addDays(lastRev, 2)) };
      db.studies[id] = {
        id, title: p.title, paperId: p.id, paperKey: normTitle(p.title), link: p.link || "", host: x.host, presenter: x.presenter,
        date: day(x.dayOffset), time: x.time || "", place: x.place || "", desc: x.desc || "", files: [], members,
        closed: !!x.closed, closedAt: x.closed ? at(x.dayOffset + 1) : null, reminded: {}, createdAt: x.closed ? at(x.dayOffset - 10, i) : at(-2 - i, i),
        notes: x.notes ? { conclusion: x.notes.conclusion || "", open: x.notes.open || "", next: x.notes.next || "", by: x.notes.by, at: at(x.dayOffset + 1) } : null,
        notesDraft: null, blind: !!x.blind, bring: !!x.bring, guideId: x.guide ? "g_demo_" + x.guide : null,
        picks: Object.fromEntries((x.picks || []).filter(pk => paper(pk.paperId) && db.users[pk.uid]).map((pk, k) => { const q = paper(pk.paperId);
          return [pk.uid, { uid: pk.uid, title: q.title, paperId: q.id, paperKey: normTitle(q.title), link: q.link || "", why: pk.why || "", files: [], order: k, at: x.closed ? at(x.dayOffset - 5, k) : at(-1, 2 + k * 6) }]; })),
      };
      if (!x.closed) members.filter(u => u !== x.host).forEach(u => (db.notifications[u] ||= []).unshift({ id: uid("n"), at: db.studies[id].createdAt,
        read: false, actor: x.host, type: "studyInvite", studyId: id, paperId: p.id, excerpt: p.title }));
      (x.questions || []).forEach((q, k) => { const qid = uid("q_");
        db.studyQs[qid] = { id: qid, studyId: id, author: q.author, body: q.body, votes: known(q.votes), done: !!q.done, at: x.closed ? at(x.dayOffset - 3, k) : at(-1, 1 + k * 5) }; });
    });
    const ids = {};
    (s.comments || []).forEach((c, k) => {
      if (!db.users[c.author]) return;
      const id = ids[c.key] = uid("c_"), parent = c.parent ? ids[c.parent] || null : null;
      // never before the review it's on (or the comment it answers), never in the future
      let t = Date.parse(at(c.dayOffset || -1, k % 7));
      const rd = revDate(c.reviewId); if (rd) t = Math.max(t, Date.parse(rd + "T09:00:00Z") + DAY);
      if (parent) t = Math.max(t, Date.parse(db.comments[parent].at) + 36e5 * (2 + k % 5));
      const cm = db.comments[id] = { id, reviewId: c.reviewId, parent, kind: c.kind || "comment", body: c.body,
        author: c.author, at: new Date(Math.min(t, Date.now() - 36e5 * (1 + k % 3))).toISOString(), resolved: false };
      // the notifications a live comment would have sent (same precedence as comments.add); older ones already read
      const r = SEED.reviews.find(x => x.id === c.reviewId), told = new Set([c.author]);
      const tell = (to, type) => { if (!to || told.has(to) || !db.users[to]) return; told.add(to);
        (db.notifications[to] ||= []).unshift({ id: uid("n"), at: cm.at, read: Date.now() - Date.parse(cm.at) > 7 * DAY, actor: c.author,
          type, reviewId: c.reviewId, commentId: id, paperId: r?.paper, excerpt: c.body.slice(0, 80) }); };
      if (r) tell(r.person, cm.kind === "question" ? "question" : cm.kind === "idea" ? "idea" : "comment");
      if (parent) tell(db.comments[parent].author, "reply");
      Object.values(db.users).filter(u => c.body.includes("@" + u.name)).forEach(u => tell(u.id, "mention"));
    });
    Object.values(db.notifications).forEach(list => list.sort((a, b) => b.at.localeCompare(a.at)));
    (s.reactions || []).forEach(r => { db.reactions[r.reviewId] = { like: known(r.like), want: known(r.want) }; });
    Object.entries(s.reading || {}).forEach(([u, list]) => { if (db.users[u]) db.reading[u] = list.map((pid, k) => ({ paperId: pid, at: at(-k - 1) })); });
  }
  ensureSeed();

  // ---------------------------------------------------------------- merge local changes into window.LAB
  const SEED_TOPICS = SEED.topics.map(t => ({ ...t }));
  const ORIG = { papers: SEED.papers, reviews: SEED.reviews, people: SEED.people };
  function resolveTag(id, merges) { let seen = 0; while (merges[id] && seen++ < 20) id = merges[id]; return id; }

  function buildDataset() {
    // topics: seed + created, renamed, merged
    const merges = {};
    let topics = SEED_TOPICS.map(t => ({ ...t }));
    db.tagOps.forEach(op => {
      if (op.op === "create" && !topics.some(t => t.id === op.id)) topics.push({ id: op.id, axis: op.axis, label: op.label, labelEn: op.labelEn || op.label, color: op.color || "gray2", custom: true });
      if (op.op === "rename") topics.forEach(t => { if (t.id === op.id) { t.label = op.label ?? t.label; t.labelEn = op.labelEn ?? t.labelEn; if (op.color) t.color = op.color; } });
      if (op.op === "merge") merges[op.from] = op.into;
    });
    topics = topics.filter(t => !merges[t.id]);
    const axisIdx = {};
    topics.forEach(t => {
      const i = (axisIdx[t.axis] = (axisIdx[t.axis] ?? -1) + 1), old = LEGACY_DATA[String(t.color || "").toLowerCase()];
      t.color = dataColor(old && old !== "gray2" && AXIS_NAMES[t.axis] ? AXIS_NAMES[t.axis][i % 12] : t.color);
    });
    const R = tid => resolveTag(tid, merges);

    // people: seed + members created by admin; each member may pick their own colour
    const people = ORIG.people.map(p => ({ ...p }));
    Object.values(db.users).forEach(u => {
      if (u.role === "admin" && u.id === "admin") return;
      if (!people.some(p => p.id === u.id)) people.push({ id: u.id, name: u.name, color: u.color || PERSON_COLORS[people.length % PERSON_COLORS.length], count: 0, avgRating: 0, topics: {}, dates: [], similar: [] });
    });
    people.forEach(p => { const u = db.users[p.id]; p.color = sysColor(u?.color || p.color); if (u?.name) p.name = u.name; });

    // reviews: seed (with edits/deletes) + created on the site
    const allReviews = [];
    ORIG.reviews.forEach(r => {
      const e = db.reviewEdits[r.id];
      if (e?.deleted) return;
      allReviews.push({ ...r, ...(e || {}), source: "import" });
    });
    Object.values(db.reviews).forEach(r => allReviews.push({ ...r, source: "site" }));

    // papers keyed by normalised title, built from a given set of reviews
    function makePapers(reviews) {
      const papers = [], byKey = {}, byId = {}, fresh = [];
      ORIG.papers.forEach(p => {
        const q = { ...p, reviews: [], key: normTitle(p.title), free: [] };
        const fix = db.paperTags[p.id];  // set by an admin (or their AI): replaces the keyword-rule tags
        if (fix) Object.assign(q, { domains: fix.domains, methods: fix.methods, tagsFixed: true });
        papers.push(q); byKey[q.key] = q; byId[q.id] = q;
      });
      reviews.forEach(r => {
        let p = r.paper && byId[r.paper];
        if (!p) {
          const key = r.paperKey || normTitle(r.meta?.title);
          p = byKey[key];
          if (!p) {
            const m = r.meta || {};
            p = { id: "np_" + key.slice(0, 40), key, title: m.title || "(untitled)", link: m.link || "", venue: m.venue || "", venueNorm: m.venue || "",
              venueType: /arxiv/i.test(m.venue || "") ? "preprint" : "", authors: m.authors || "", year: m.year ? +m.year : null, abstract: m.abstract || "",
              citations: null, refs: [], reviews: [], domains: [], methods: [], free: [], fresh: true };
            const fix = db.paperTags[p.id];
            if (fix) Object.assign(p, { domains: fix.domains, methods: fix.methods, tagsFixed: true });
            papers.push(p); byKey[key] = p; byId[p.id] = p; fresh.push(p);
          }
          r.paper = p.id;
        }
        p.reviews.push(r.id);
      });
      const RV = Object.fromEntries(reviews.map(r => [r.id, r]));
      papers.forEach(p => {
        if (!p.reviews.length) return;
        const rs = p.reviews.map(id => RV[id]);
        const dom = new Set((p.domains || []).map(d => R("d:" + d).slice(2)).filter(d => topics.some(t => t.id === "d:" + d)));
        const met = new Set((p.methods || []).map(m => R("m:" + m).slice(2)).filter(m => topics.some(t => t.id === "m:" + m)));
        const free = new Set();
        rs.forEach(r => (r.tags || []).map(R).forEach(tid => {
          const [ax, k] = [tid.slice(0, 1), tid.slice(2)];
          if (ax === "d") dom.add(k); else if (ax === "m") met.add(k); else free.add(tid);
        }));
        p.domains = [...dom];  // may be empty: a general AI paper only has methods
        p.methods = [...met]; p.free = [...free];
        p.readers = [...new Set(rs.map(r => r.person))].sort();
        const ratings = rs.map(r => r.rating).filter(Boolean);
        p.rating = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 100) / 100 : 0;
        p.firstDate = rs.map(r => r.date).sort()[0];
      });
      return { live: papers.filter(p => p.reviews.length), byId, fresh };
    }
    const full = makePapers(allReviews);
    place(full.fresh, full.live.filter(p => !p.fresh));

    // term view: graph/lists show only the selected terms; detail pages & "my page" keep everything
    const known = new Set([...db.terms.map(t => t.id), ...allReviews.map(r => r.term)]);
    const sel = viewTerms().filter(t => known.has(t));
    let reviews = allReviews, view = full;
    if (sel.length) {
      reviews = allReviews.filter(r => sel.includes(r.term));
      view = makePapers(reviews);
      view.live.forEach(p => { const f = full.byId[p.id]; if (f) Object.assign(p, { x: f.x, y: f.y, c: f.c, f: f.f, nb: f.nb }); });
    }
    const live = view.live, byId = view.byId;

    // people stats (for the selected terms)
    people.forEach(u => {
      const mine = reviews.filter(r => r.person === u.id);
      const vec = {};
      mine.forEach(r => { const p = byId[r.paper]; p.domains.forEach(d => (vec["d:" + d] = (vec["d:" + d] || 0) + 1)); p.methods.forEach(m => (vec["m:" + m] = (vec["m:" + m] || 0) + 1)); });
      u.topics = Object.fromEntries(Object.entries(vec).sort((a, b) => b[1] - a[1]));
      u.count = mine.length;
      const rs = mine.map(r => r.rating).filter(Boolean);
      u.avgRating = rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length * 100) / 100 : 0;
      const dc = {}; mine.forEach(r => (dc[r.date] = (dc[r.date] || 0) + 1));
      u.dates = Object.entries(dc).sort();
    });
    const cos = (a, b) => {
      let dot = 0, na = 0, nb = 0;
      for (const k in a) { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; }
      for (const k in b) nb += b[k] * b[k];
      return na && nb ? dot / Math.sqrt(na * nb) : 0;
    };
    people.forEach(u => {
      u.similar = people.filter(q => q.id !== u.id).map(q => ({
        id: q.id, sim: Math.round(cos(u.topics, q.topics) * 1000) / 1000,
        shared: live.filter(p => p.readers.includes(u.id) && p.readers.includes(q.id)).length,
      })).sort((a, b) => b.sim - a.sim);
    });

    // free tags show up as topics too
    full.live.forEach(p => p.free.forEach(tid => { if (!topics.some(t => t.id === tid)) topics.push({ id: tid, axis: "free", label: tid.slice(2), labelEn: tid.slice(2), color: "rgb(var(--gray2))" }); }));

    Object.assign(SEED, {
      people, topics, papers: live, reviews,
      allPapers: full.live, allReviews,
      terms: sel.length ? sel : [...new Set(allReviews.map(r => r.term))].sort(),
      termDefs: db.terms, viewTerms: sel,
    });
    nameClusters();
  }

  // map regions get new ids every time the map is rebuilt, so a name is kept with the papers the region had when it
  // was named; each current region takes the name whose papers it shares most (Jaccard >= 0.5, one name per region)
  function clusterMembers() {
    const m = {};
    SEED.allPapers.forEach(p => ["a", "c", "f"].forEach(k => p[k] && (m[p[k]] ||= new Set()).add(p.id)));
    return m;
  }
  function nameClusters() {
    const members = clusterMembers(), pairs = [];
    (SEED.clusters || []).forEach(c => { delete c.custom; delete c.customKey; });
    Object.entries(db.clusterNames).forEach(([key, n]) => (SEED.clusters || []).forEach(c => {
      if (c.level !== n.level) return;
      const cur = members[c.id] || new Set();
      const shared = n.members.filter(id => cur.has(id)).length;
      const j = shared / (cur.size + n.members.length - shared || 1);
      if (j >= 0.5) pairs.push([j, key, c]);
    }));
    const usedKeys = new Set();
    pairs.sort((a, b) => b[0] - a[0]).forEach(([, key, c]) => {
      if (c.custom || usedKeys.has(key)) return;
      usedKeys.add(key);
      const n = db.clusterNames[key];
      c.custom = { ko: n.ko, en: n.en, ...(n.keywords?.length ? { keywords: n.keywords } : {}) }; c.customKey = key;
    });
  }

  // ---------------------------------------------------------------- lexical similarity (no ML in the browser)
  let lex = null;
  const tok = s => (s || "").toLowerCase().match(/[a-z][a-z\-]{2,}|[가-힣]{2,}/g) || [];
  const STOP = new Set("the and for with from using based approach model models method study analysis via into under over its their this that are our new data learning".split(" "));
  function lexIndex(papers) {
    if (lex && lex.n === papers.length) return lex;
    const df = {}, docs = papers.map(p => {
      const tf = {};
      tok(p.title + " " + p.title + " " + (p.abstract || "")).forEach(w => { if (!STOP.has(w)) tf[w] = (tf[w] || 0) + 1; });
      Object.keys(tf).forEach(w => (df[w] = (df[w] || 0) + 1));
      return tf;
    });
    const N = papers.length, idf = w => Math.log(1 + N / (1 + (df[w] || 0)));
    const vecs = docs.map(tf => { const v = {}; let n = 0; for (const w in tf) { v[w] = (1 + Math.log(tf[w])) * idf(w); n += v[w] ** 2; } n = Math.sqrt(n) || 1; for (const w in v) v[w] /= n; return v; });
    lex = { n: N, papers, vecs, idf };
    return lex;
  }
  function lexSimilar(text, papers, k = 10) {
    const L = lexIndex(papers);
    const tf = {}; tok(text).forEach(w => { if (!STOP.has(w)) tf[w] = (tf[w] || 0) + 1; });
    const q = {}; let n = 0;
    for (const w in tf) { q[w] = (1 + Math.log(tf[w])) * L.idf(w); n += q[w] ** 2; }
    n = Math.sqrt(n) || 1;
    return L.vecs.map((v, i) => { let s = 0; for (const w in q) if (v[w]) s += v[w] * q[w] / n; return [L.papers[i], s]; })
      .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, k);
  }
  // new papers: temporary map position = weighted mean of lexically similar papers (the nightly batch fixes it later)
  function place(fresh, base) {
    fresh.forEach((p, i) => {
      const nb = lexSimilar(p.title + " " + (p.abstract || ""), base, 8).filter(([q]) => q.x != null);
      if (!nb.length) { p.x = (i % 7) * 6; p.y = -260 - Math.floor(i / 7) * 6; p.c = null; p.f = null; p.nb = []; return; }
      const w = nb.slice(0, 5), W = w.reduce((s, [, x]) => s + x, 0);
      p.x = w.reduce((s, [q, x]) => s + q.x * x, 0) / W + (Math.random() - 0.5) * 6;
      p.y = w.reduce((s, [q, x]) => s + q.y * x, 0) / W + (Math.random() - 0.5) * 6;
      const vote = key => { const c = {}; w.forEach(([q, x]) => q[key] && (c[q[key]] = (c[q[key]] || 0) + x)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
      p.c = vote("c"); p.f = vote("f");
      p.nb = nb.slice(0, 6).map(([q, s]) => [q.id, Math.round(s * 1000) / 1000]);
    });
  }
  const RULES = Object.fromEntries(Object.entries(SEED.taxonomy || {}).map(([k, pats]) => [k, pats.map(p => { try { return new RegExp(p, "i"); } catch (e) { return null; } }).filter(Boolean)]));

  buildDataset();

  // ---------------------------------------------------------------- session
  let actingAs = null; // set while applying an MCP op on behalf of its author
  function session() { if (actingAs) return actingAs; if (SERVER) return state?.me || null; try { return localStorage.getItem(SESSION); } catch (e) { return null; } }
  const current = () => { const id = session(); const u = id && db.users[id]; return u && !u.disabled ? publicUser(u) : null; };
  const publicUser = u => ({ id: u.id, name: u.name, role: u.role, mustChange: !!u.mustChange });
  const requireUser = () => { const u = current(); if (!u) throw new Error("auth"); return u; };
  const requireAdmin = () => { const u = requireUser(); if (u.role !== "admin") throw new Error("forbidden"); return u; };
  const findUser = name => Object.values(db.users).find(u => u.name.toLowerCase() === name.trim().toLowerCase() || u.id === name.trim());

  // ---------------------------------------------------------------- notifications
  function notify(to, n) {
    const me = session();
    if (!to || to === me || !db.users[to]) return;
    (db.notifications[to] ||= []).unshift({ id: uid("n"), at: now(), read: false, actor: me, ...n });
    db.notifications[to] = db.notifications[to].slice(0, 200);
  }
  function mentionsIn(body) {
    const names = Object.values(db.users).map(u => u.name).sort((a, b) => b.length - a.length);
    const found = new Set();
    names.forEach(nm => { if (body.includes("@" + nm)) found.add(findUser(nm).id); });
    return [...found];
  }
  const reviewById = id => SEED.allReviews.find(r => r.id === id);
  const fileInUse = fid => SEED.allReviews.some(r => (r.files || []).some(f => f.id === fid))
    || Object.values(db.reading).some(l => (l || []).some(x => (x.files || []).some(f => f.id === fid)));

  // ---------------------------------------------------------------- lab calendar
  // a diary is owed on every weekday that isn't a public holiday (computed below) or one of the lab's own days off
  // (shutdowns, conferences … — db.offDays, kept by an admin)
  const isWeekend = d => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w === 0 || w === 6; };

  // Korean public holidays. Lunar ones as solar dates — 설날, 추석 (the middle day of each 3-day holiday), 부처님오신날;
  // extend the table before 2036.
  const LUNAR = {
    2020: ["01-25", "10-01", "04-30"], 2021: ["02-12", "09-21", "05-19"], 2022: ["02-01", "09-10", "05-08"], 2023: ["01-22", "09-29", "05-27"],
    2024: ["02-10", "09-17", "05-15"], 2025: ["01-29", "10-06", "05-05"], 2026: ["02-17", "09-25", "05-24"], 2027: ["02-07", "09-15", "05-13"],
    2028: ["01-27", "10-03", "05-02"], 2029: ["02-13", "09-22", "05-20"], 2030: ["02-03", "09-12", "05-09"], 2031: ["01-23", "10-01", "05-28"],
    2032: ["02-11", "09-19", "05-16"], 2033: ["01-31", "09-08", "05-06"], 2034: ["02-19", "09-27", "05-25"], 2035: ["02-08", "09-16", "05-15"],
  };
  // holidays no rule produces — elections and days the government declares (임시공휴일). Unknown future ones: an admin adds them.
  const ONE_OFF = { "2024-04-10": "국회의원 선거", "2024-10-01": "임시공휴일", "2025-01-27": "임시공휴일", "2025-06-03": "대통령 선거",
    "2026-06-03": "지방선거", "2028-04-12": "국회의원 선거" };
  const holidayCache = {};
  function holidaysOf(y) {
    if (holidayCache[y]) return holidayCache[y];
    const occ = [], md = s => `${y}-${s}`;  // occurrences: { dates, name, sub } — sub: what triggers a substitute day
    [["01-01", "신정"], ["06-06", "현충일"]].forEach(([d, name]) => occ.push({ dates: [md(d)], name, sub: null }));
    [["03-01", "삼일절"], ["05-05", "어린이날"], ["08-15", "광복절"], ["10-03", "개천절"], ["10-09", "한글날"], ["12-25", "성탄절"]]
      .forEach(([d, name]) => occ.push({ dates: [md(d)], name, sub: "weekend" }));
    if (y >= 2026) occ.push({ dates: [md("05-01")], name: "노동절", sub: null });
    const L = LUNAR[y];
    if (L) {
      occ.push({ dates: [-1, 0, 1].map(k => addDays(md(L[0]), k)), name: "설날", sub: "sunday" });
      occ.push({ dates: [-1, 0, 1].map(k => addDays(md(L[1]), k)), name: "추석", sub: "sunday" });
      occ.push({ dates: [md(L[2])], name: "부처님오신날", sub: "weekend" });
    }
    Object.entries(ONE_OFF).forEach(([d, name]) => d.startsWith(y + "-") && occ.push({ dates: [d], name, sub: null }));
    const h = {};
    occ.forEach(o => o.dates.forEach(d => (h[d] = h[d] ? `${h[d]}·${o.name}` : o.name)));
    // 대체공휴일: 설날·추석 touching a Sunday, the others on a weekend, or two holidays on one day → the next free weekday
    const dow = d => new Date(d + "T00:00:00Z").getUTCDay(), triggers = [];
    occ.forEach(o => { if ((o.sub === "sunday" && o.dates.some(d => dow(d) === 0)) || (o.sub === "weekend" && o.dates.some(d => dow(d) % 6 === 0))) triggers.push(o.dates.at(-1)); });
    const per = {};
    occ.forEach(o => o.sub && o.dates.forEach(d => (per[d] = (per[d] || 0) + 1)));
    occ.forEach(o => !o.sub && o.dates.forEach(d => per[d] && (per[d] += 1)));
    Object.entries(per).forEach(([d, n]) => { if (n > 1 && dow(d) % 6 !== 0) triggers.push(occ.filter(o => o.dates.includes(d)).map(o => o.dates.at(-1)).sort().pop()); });
    triggers.sort().forEach(after => {
      let d = addDays(after, 1);
      while (isWeekend(d) || h[d]) d = addDays(d, 1);
      h[d] = "대체공휴일";
    });
    return (holidayCache[y] = h);
  }
  const holiday = d => holidaysOf(+d.slice(0, 4))[d] || null;
  function offDay(d) {
    const name = holiday(d);
    if (name) return { label: name, kind: "holiday", auto: true };
    for (const o of Object.values(db.offDays)) if (o.start <= d && d <= o.end) return o;
    return null;
  }
  function workdays(a, b) { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (!isWeekend(d) && !offDay(d)) n++; return n; }

  // ---------------------------------------------------------------- public API
  const Store = {
    mock: !SERVER,
    server: SERVER,
    demo: DEMO,
    today, termOf, normTitle,
    auth: {
      current,
      async signIn(name, password) {
        if (SERVER) return (await LabServerAuth.signIn(name, password)).user;
        const u = findUser(name || "");
        if (!u || u.disabled) throw new Error("login.fail");
        const ok = u.pw ? (await hash(password, u.id)) === u.pw : password === (u.tempPw || MOCK_INITIAL_PASSWORD);
        if (!ok) throw new Error("login.fail");
        localStorage.setItem(SESSION, u.id);
        return publicUser(u);
      },
      // demo lab only: sign in as any seeded account without a password
      async demoSignIn(id) {
        if (SERVER) return (await LabServerAuth.demoSignIn(id)).user;
        const u = DEMO && db.users[id];
        if (!u || u.disabled) throw new Error("login.fail");
        if (u.mustChange && !u.pw) { u.mustChange = false; save(); }
        localStorage.setItem(SESSION, u.id);
        return publicUser(u);
      },
      async signOut() { if (SERVER) await LabServerAuth.signOut(); else localStorage.removeItem(SESSION); },
      async changePassword(oldPw, newPw) {
        const me = requireUser(), u = db.users[me.id];
        if (SERVER) {  // checked and hashed on the server; this copy only learns that there is a password now
          if (!newPw || newPw.length < 6) throw new Error("pw.short");
          await LabServerAuth.changePassword(oldPw, newPw);
          u.pw = true; u.mustChange = false; delete u.tempPw;
          server.synced.set(`users\u0000${u.id}`, JSON.stringify(u));
          log("password.change", u.id); save();
          return;
        }
        const ok = u.pw ? (await hash(oldPw, u.id)) === u.pw : oldPw === (u.tempPw || MOCK_INITIAL_PASSWORD);
        if (!ok) throw new Error("pw.wrong");
        if (!newPw || newPw.length < 6) throw new Error("pw.short");
        u.pw = await hash(newPw, u.id); u.mustChange = false; delete u.tempPw;
        log("password.change", u.id); save();
      },
    },

    users: {
      async list() { return Object.values(db.users).map(u => ({ ...publicUser(u), disabled: !!u.disabled, createdAt: u.createdAt, pending: !u.pw })); },
      async create({ name, color, role = "member" }) {
        requireAdmin();
        name = (name || "").trim();
        if (!name || findUser(name)) throw new Error("user.exists");
        const id = "u" + slug(name).replace(/-/g, "").slice(0, 10) + Math.random().toString(36).slice(2, 5);
        const tempPw = randomPassword();
        db.users[id] = { id, name, role, color, pw: null, tempPw, mustChange: true, createdAt: now() };
        log("user.create", name); save();
        return { id, name, tempPassword: tempPw };
      },
      async resetPassword(id) {
        requireAdmin();
        const u = db.users[id]; if (!u) throw new Error("user.missing");
        u.pw = null; u.tempPw = randomPassword(); u.mustChange = true;
        log("user.resetPassword", u.name); save();
        return { tempPassword: u.tempPw };
      },
      async setRole(id, role) { requireAdmin(); db.users[id].role = role; log("user.role", `${db.users[id].name} → ${role}`); save(); },
      get(id) { const u = db.users[id]; return u ? { ...publicUser(u), color: u.color || null, quota: u.quota || {} } : null; },
      // diary duty: { exempt: bool, start: "YYYY-MM-DD" | null, end: "YYYY-MM-DD" | null (left the lab), targets: { [termId]: n } }
      async setQuota(id, quota) {
        requireAdmin();
        const u = db.users[id]; if (!u) throw new Error("user.missing");
        u.quota = { ...(u.quota || {}), ...quota, targets: { ...(u.quota?.targets || {}), ...(quota.targets || {}) } };
        Object.keys(u.quota.targets).forEach(k => (u.quota.targets[k] == null || u.quota.targets[k] === "") && delete u.quota.targets[k]);
        log("user.quota", `${u.name} ${JSON.stringify(quota)}`); save();
      },
      async setMyColor(color) {
        const me = requireUser();
        if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("color");
        db.users[me.id].color = color; log("user.color", `${me.name} ${color}`); save();
      },
      async setDisabled(id, disabled) { requireAdmin(); db.users[id].disabled = disabled; log("user.disable", `${db.users[id].name} ${disabled}`); save(); },
    },

    reviews: {
      async create(data) {
        const me = requireUser();
        const id = uid("r_");
        const meta = { title: data.title.trim(), link: data.link || "", venue: data.venue || "", authors: data.authors || "", year: data.year || "", abstract: data.abstract || "" };
        const st = data.studyId && db.studies[data.studyId];
        const target = st ? (data.pick ? st.picks?.[me.id] : st) : null;
        const key = target ? target.paperKey : normTitle(meta.title);
        const existing = (target?.paperId && SEED.allPapers.find(p => p.id === target.paperId)) || SEED.allPapers.find(p => p.key === key);
        if (target && !existing) meta.title = target.title;
        // date = diary date (the week it counts for, may be earlier/later than today); createdAt = when it was posted
        const date = isDate(data.date) ? data.date : today();
        db.reviews[id] = {
          id, person: me.id, date, term: termOf(date), rating: +data.rating || 0,
          content: data.content || "", memo: data.memo || "", tags: (data.tags || []).map(cleanTag).filter(Boolean), files: cleanFiles(data.files), createdAt: now(),
          ...(data.studyId && db.studies[data.studyId] ? { studyId: data.studyId } : {}),
          ...(existing ? { paper: existing.id } : {}),
          paperKey: existing?.key || normTitle(meta.title),
          meta: existing?.fresh ? { title: existing.title, link: existing.link, venue: existing.venue, authors: existing.authors, year: existing.year || "", abstract: existing.abstract } : meta,
        };
        if (existing) existing.readers.filter(r => r !== me.id).forEach(r => notify(r, { type: "sameRead", reviewId: id, paperId: existing.id }));
        if (data.fromDraft) delete db.drafts[me.id];   // only the general draft this form was restored from
        log("review.create", meta.title); save();
        return { id };
      },
      async update(id, patch) {
        const me = requireUser();
        const r = reviewById(id); if (!r) throw new Error("review.missing");
        if (r.person !== me.id && me.role !== "admin") throw new Error("forbidden");
        const fields = ["rating", "content", "memo", "tags", "date", "files"];
        const clean = Object.fromEntries(fields.filter(f => f in patch).map(f => [f, f === "rating" ? +patch[f] : patch[f]]));
        if ("tags" in clean) clean.tags = (clean.tags || []).map(cleanTag).filter(Boolean);
        if ("date" in clean) { if (!isDate(clean.date)) delete clean.date; else clean.term = termOf(clean.date); }
        if ("files" in clean) {
          clean.files = cleanFiles(clean.files);
          const keep = new Set(clean.files.map(f => f.id));
          await Promise.all((r.files || []).filter(f => !keep.has(f.id)).map(f => Store.files.remove(f.id).catch(() => {})));
        }
        if (db.reviews[id]) {
          Object.assign(db.reviews[id], clean, { updatedAt: now() });
          if (patch.meta && db.reviews[id].meta) Object.assign(db.reviews[id].meta, patch.meta);
        } else db.reviewEdits[id] = { ...(db.reviewEdits[id] || {}), ...clean, updatedAt: now() };
        log("review.update", id); save();
      },
      async remove(id) {
        const me = requireUser();
        const r = reviewById(id); if (!r) return;
        if (r.person !== me.id && me.role !== "admin") throw new Error("forbidden");
        await Promise.all((r.files || []).map(f => Store.files.remove(f.id).catch(() => {})));
        if (db.reviews[id]) delete db.reviews[id]; else db.reviewEdits[id] = { ...(db.reviewEdits[id] || {}), deleted: true };
        log("review.delete", id); save();
      },
    },

    drafts: {
      get() { const me = current(); return me ? db.drafts[me.id] || null : null; },
      save(data) { const me = current(); if (!me) return; db.drafts[me.id] = { ...data, savedAt: now() }; save(); return db.drafts[me.id].savedAt; },
      clear() { const me = current(); if (me) { delete db.drafts[me.id]; save(); } },
      // drafts written by the member's own AI through MCP
      mcp() { const me = current(); return me ? (db.mcpDrafts?.[me.id] || []) : []; },
      takeMcp(id) {
        const me = current(); if (!me) return null;
        const list = db.mcpDrafts?.[me.id] || [], i = list.findIndex(d => d.id === id);
        if (i < 0) return null;
        const [d] = list.splice(i, 1); save(); return d;
      },
    },

    // term view filter shared by graph & list pages (empty = all terms)
    view: {
      terms: viewTerms,
      allTerms() {
        const ids = new Set([...db.terms.map(t => t.id), ...SEED.allReviews.map(r => r.term)]);
        return [...ids].sort().map(id => db.terms.find(t => t.id === id) || { id, label: id });
      },
      setTerms(list) { try { localStorage.setItem(VIEW_KEY, JSON.stringify(list || [])); } catch (e) {} },
    },

    // how many diaries a member owes in a term: one per working day between their start and end (exempt = none).
    // A term with a fixed target (set by an admin) is prorated by working days instead.
    quota(uid, term) {
      const q = db.users[uid]?.quota || {};
      if (q.exempt) return { exempt: true, target: 0, start: term.start };
      const start = q.start && q.start > term.start ? q.start : term.start;
      if (start > term.end) return { exempt: true, target: 0, start, notYet: true };
      const end = q.end && q.end < term.end ? q.end : term.end;  // graduated / left the lab
      if (end < start) return { exempt: true, target: 0, start, left: true };
      const mine = workdays(start, end);
      const auto = term.target ? Math.round(term.target * mine / (workdays(term.start, term.end) || 1)) : mine;
      const custom = q.targets?.[term.id];
      return { exempt: false, start, end, workdays: mine, target: custom != null ? +custom : auto, auto, custom: custom != null };
    },

    // the lab's days off: public holidays, shutdowns, conferences … — weekends are never owed anyway
    calendar: {
      list() { return Object.values(db.offDays).sort((a, b) => a.start.localeCompare(b.start)); },
      holidays(y) { return Object.entries(holidaysOf(+y)).sort().map(([date, label]) => ({ date, label })); },
      offDay, isWeekend, workdays,
      async save(o) {
        requireAdmin();
        const end = o.end || o.start;
        if (!isDate(o.start) || !isDate(end) || end < o.start) throw new Error("date");
        const id = o.id && db.offDays[o.id] ? o.id : uid("off_");
        db.offDays[id] = { id, start: o.start, end, label: String(o.label || "").trim().slice(0, 60),
          kind: ["holiday", "shutdown", "event"].includes(o.kind) ? o.kind : "holiday" };
        log("offday.save", `${o.start}~${end} ${o.label || ""}`); save();
        return id;
      },
      async remove(id) {
        requireAdmin();
        const o = db.offDays[id]; if (!o) throw new Error("offday.missing");
        delete db.offDays[id]; log("offday.remove", `${o.start} ${o.label}`); save();
      },
    },

    comments: {
      async list(reviewId) { return Object.values(db.comments).filter(c => c.reviewId === reviewId).sort((a, b) => a.at.localeCompare(b.at)); },
      recent(limit = 80) { return Object.values(db.comments).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit); },
      count(reviewId) { let n = 0; for (const c of Object.values(db.comments)) if (c.reviewId === reviewId) n++; return n; },
      async add({ reviewId, parent = null, kind = "comment", body }) {
        const me = requireUser();
        body = (body || "").trim(); if (!body) throw new Error("empty");
        const c = { id: uid("c_"), reviewId, parent, kind, body, author: me.id, at: now(), resolved: false };
        db.comments[c.id] = c;
        const r = reviewById(reviewId), told = new Set();
        const tell = (to, type) => { if (to && !told.has(to)) { told.add(to); notify(to, { type, reviewId, commentId: c.id, paperId: r?.paper, excerpt: body.slice(0, 80) }); } };
        // one notification per person: review author > replied-to commenter > mentioned
        if (r) tell(r.person, kind === "question" ? "question" : kind === "idea" ? "idea" : "comment");
        if (parent && db.comments[parent]) tell(db.comments[parent].author, "reply");
        mentionsIn(body).forEach(u => tell(u, "mention"));
        save();
        return c;
      },
      async resolve(id, resolved = true) { requireUser(); if (db.comments[id]) { db.comments[id].resolved = resolved; save(); } },
      async remove(id) {
        const me = requireUser(), c = db.comments[id];
        if (c && (c.author === me.id || me.role === "admin")) { delete db.comments[id]; Object.values(db.comments).forEach(x => x.parent === id && delete db.comments[x.id]); save(); }
      },
    },

    reactions: {
      get(reviewId) { const r = db.reactions[reviewId] || {}; return { like: r.like || [], want: r.want || [] }; },
      async toggle(reviewId, kind) {
        const me = requireUser();
        const r = (db.reactions[reviewId] ||= {}), list = (r[kind] ||= []);
        const i = list.indexOf(me.id);
        if (i >= 0) list.splice(i, 1); else {
          list.push(me.id);
          const rv = reviewById(reviewId);
          if (rv && kind === "like") notify(rv.person, { type: "like", reviewId, paperId: rv.paper });
          if (rv && kind === "want") { Store.reading._add(rv.paper); notify(rv.person, { type: "want", reviewId, paperId: rv.paper }); }
        }
        save();
        return Store.reactions.get(reviewId);
      },
    },

    // ---- paper study: agree to read a paper together → questions beforehand → (offline) meeting → shared notes
    // A study review is a normal diary entry (counts toward the quota) tagged with studyId.
    studies: {
      list() { return Object.values(db.studies).sort((a, b) => (a.closed - b.closed) || (a.date || "9999").localeCompare(b.date || "9999") || b.createdAt.localeCompare(a.createdAt)); },
      get(id) { return db.studies[id] || null; },
      paperOf(st) { return st && (SEED.allPapers.find(p => p.id === st.paperId) || SEED.allPapers.find(p => p.key === st.paperKey)) || null; },
      reviews(st) { const p = Store.studies.paperOf(st); return p ? SEED.allReviews.filter(r => r.paper === p.id && !r.deleted) : []; },
      canManage(st) { const me = current(); return !!me && (st.host === me.id || st.presenter === me.id || me.role === "admin"); },
      async create(data) {
        const me = requireUser();
        const title = (data.title || "").trim(); if (!title) throw new Error("study.title");
        const known = data.paperId ? SEED.allPapers.find(p => p.id === data.paperId) : SEED.allPapers.find(p => p.key === normTitle(title));
        const id = uid("s_");
        const members = [...new Set([me.id, data.presenter, ...(data.invite || [])].filter(u => u && db.users[u]))];
        db.studies[id] = {
          id, title: known?.title || title, paperId: known?.id || null, paperKey: known?.key || normTitle(title), link: data.link || known?.link || "",
          host: me.id, presenter: data.presenter || me.id, date: isDate(data.date) ? data.date : "", time: (data.time || "").slice(0, 5), place: (data.place || "").slice(0, 80),
          desc: (data.desc || "").slice(0, 2000), files: cleanFiles(data.files), members, closed: false, notes: null, notesDraft: null, reminded: {}, createdAt: now(),
          blind: data.blind !== false, bring: !!data.bring, picks: {}, guideId: data.guideId && db.guides[data.guideId] ? data.guideId : null,
        };
        members.filter(u => u !== me.id).forEach(u => notify(u, { type: "studyInvite", studyId: id, paperId: known?.id, excerpt: db.studies[id].title }));
        if (known) Store.reading._add(known.id);
        log("study.create", title); save();
        return { id };
      },
      async update(id, patch) {
        const st = db.studies[id]; if (!st) throw new Error("study.missing");
        requireUser(); if (!Store.studies.canManage(st)) throw new Error("forbidden");
        ["date", "time", "place", "desc", "presenter", "link"].forEach(k => { if (k in patch) st[k] = k === "date" ? (isDate(patch.date) ? patch.date : "") : String(patch[k] || ""); });
        ["blind", "bring"].forEach(k => { if (k in patch) st[k] = !!patch[k]; });
        if ("files" in patch) {
          const next = cleanFiles(patch.files), keep = new Set(next.map(f => f.id));
          await Promise.all((st.files || []).filter(f => !keep.has(f.id)).map(f => Store.files.remove(f.id).catch(() => {})));
          st.files = next;
        }
        if (st.presenter && !st.members.includes(st.presenter)) st.members.push(st.presenter);
        log("study.update", st.title); save();
      },
      async join(id) {
        const me = requireUser(), st = db.studies[id]; if (!st || st.closed) return;
        if (!st.members.includes(me.id)) { st.members.push(me.id); notify(st.host, { type: "studyJoin", studyId: id, excerpt: st.title }); }
        const p = Store.studies.paperOf(st); if (p) Store.reading._add(p.id);
        save();
      },
      async leave(id) {
        const me = requireUser(), st = db.studies[id]; if (!st || st.host === me.id || st.presenter === me.id) return;
        st.members = st.members.filter(u => u !== me.id);
        if (st.picks?.[me.id]) { await Promise.all((st.picks[me.id].files || []).map(f => Store.files.remove(f.id).catch(() => {}))); delete st.picks[me.id]; }
        save();
      },
      async close(id, closed = true) {
        const me = requireUser(), st = db.studies[id]; if (!st) return;
        if (!Store.studies.canManage(st)) throw new Error("forbidden");
        st.closed = closed; st.closedAt = closed ? now() : null;
        if (closed) st.members.filter(u => u !== me.id).forEach(u => notify(u, { type: "studyClosed", studyId: id, excerpt: st.title }));
        if (closed) await Store.guides.harvest(st);
        log("study.close", `${st.title} ${closed}`); save();
      },
      async remove(id) {
        const st = db.studies[id]; if (!st) return;
        requireUser(); if (!Store.studies.canManage(st)) throw new Error("forbidden");
        await Promise.all([...(st.files || []), ...Object.values(st.picks || {}).flatMap(pk => pk.files || [])].map(f => Store.files.remove(f.id).catch(() => {})));
        Object.values(db.studyQs).forEach(q => q.studyId === id && delete db.studyQs[q.id]);
        delete db.studies[id]; log("study.delete", st.title); save();
      },
      // has this member already written a diary entry on the study's common paper?
      wrote(st, uid) { const p = Store.studies.paperOf(st); return !!p && SEED.allReviews.some(r => r.paper === p.id && r.person === uid); },
      // blind mode: while the study is open, a member's review of the common paper is hidden from anyone who hasn't written their own
      hidden(r) {
        const me = current();
        if (!r || !me || r.person === me.id) return false;
        return Object.values(db.studies).some(st => !st.closed && st.blind && st.members.includes(r.person) && r.studyId === st.id
          && Store.studies.paperOf(st)?.id === r.paper && !Store.studies.wrote(st, me.id));
      },
      // "everyone brings a related paper": one pick per member, shown in presentation order
      pickPaper(pick) { return pick && (SEED.allPapers.find(p => p.id === pick.paperId) || SEED.allPapers.find(p => p.key === pick.paperKey)) || null; },
      picks(st) { return Object.values(st.picks || {}).sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.at.localeCompare(b.at)); },
      async setPick(id, data) {
        const me = requireUser(), st = db.studies[id]; if (!st || st.closed) throw new Error("study.missing");
        const title = (data.title || "").trim(); if (!title) throw new Error("study.title");
        const known = data.paperId ? SEED.allPapers.find(p => p.id === data.paperId) : SEED.allPapers.find(p => p.key === normTitle(title));
        const prev = (st.picks ||= {})[me.id];
        const files = cleanFiles(data.files), keep = new Set(files.map(f => f.id));
        if (prev) await Promise.all((prev.files || []).filter(f => !keep.has(f.id)).map(f => Store.files.remove(f.id).catch(() => {})));
        st.picks[me.id] = { uid: me.id, title: known?.title || title, paperId: known?.id || null, paperKey: known?.key || normTitle(title), link: data.link || known?.link || "",
          why: (data.why || "").slice(0, 500), files, order: prev?.order ?? Object.keys(st.picks).length, at: prev?.at || now() };
        if (!st.members.includes(me.id)) st.members.push(me.id);
        if (known) Store.reading._add(known.id);
        log("study.pick", `${st.title} ← ${title}`); save();
      },
      async removePick(id, uid) {
        const me = requireUser(), st = db.studies[id]; const pk = st?.picks?.[uid]; if (!pk) return;
        if (uid !== me.id && !Store.studies.canManage(st)) throw new Error("forbidden");
        await Promise.all((pk.files || []).map(f => Store.files.remove(f.id).catch(() => {})));
        delete st.picks[uid]; save();
      },
      async movePick(id, uid, dir) {
        const st = db.studies[id]; requireUser(); if (!st || !Store.studies.canManage(st)) throw new Error("forbidden");
        const list = Store.studies.picks(st), i = list.findIndex(x => x.uid === uid), j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]]; list.forEach((x, k) => (st.picks[x.uid].order = k)); save();
      },
      // studies a paper took part in (as the common paper or someone's pick) — shown on the paper page
      forPaper(paperId) {
        return Object.values(db.studies).map(st => {
          const common = Store.studies.paperOf(st)?.id === paperId;
          const picks = Store.studies.picks(st).filter(pk => Store.studies.pickPaper(pk)?.id === paperId);
          return common || picks.length ? { st, common, picks } : null;
        }).filter(Boolean);
      },

      // shared notes (any member may edit; last write wins, author + time kept)
      async saveNotes(id, notes) {
        const me = requireUser(), st = db.studies[id]; if (!st) return;
        if (!st.members.includes(me.id) && me.role !== "admin") throw new Error("forbidden");
        st.notes = { conclusion: notes.conclusion || "", open: notes.open || "", next: notes.next || "", by: me.id, at: now() };
        if (st.notesDraft?.by === me.id) st.notesDraft = null;
        await Store.guides.harvest(st);
        save();
      },
      notesDraft(id) { const me = current(), st = db.studies[id]; return st?.notesDraft && st.notesDraft.by === me?.id ? st.notesDraft : null; },
      questions: {
        list(studyId) { return Object.values(db.studyQs).filter(q => q.studyId === studyId).sort((a, b) => (a.done - b.done) || b.votes.length - a.votes.length || a.at.localeCompare(b.at)); },
        async add(studyId, body) {
          const me = requireUser(), st = db.studies[studyId]; body = (body || "").trim();
          if (!st || !body) throw new Error("empty");
          if (st.closed) throw new Error("study.closed");
          const q = { id: uid("q_"), studyId, author: me.id, body: body.slice(0, 1000), votes: [], done: false, at: now() };
          db.studyQs[q.id] = q;
          if (!st.members.includes(me.id) && db.users[me.id]?.role !== "admin") st.members.push(me.id);
          [st.presenter, st.host].filter((u, i, a) => a.indexOf(u) === i).forEach(u => notify(u, { type: "studyQuestion", studyId, excerpt: q.body.slice(0, 80) }));
          save(); return q;
        },
        async vote(qid) {
          const me = requireUser(), q = db.studyQs[qid]; if (!q) return;
          const i = q.votes.indexOf(me.id); if (i >= 0) q.votes.splice(i, 1); else q.votes.push(me.id);
          save(); return q.votes.length;
        },
        async setDone(qid, done = true) {
          const me = requireUser(), q = db.studyQs[qid]; if (!q) return;
          if (q.author !== me.id && !Store.studies.canManage(db.studies[q.studyId])) throw new Error("forbidden");
          q.done = done; save();
        },
        async remove(qid) {
          const me = requireUser(), q = db.studyQs[qid]; if (!q) return;
          if (q.author !== me.id && !Store.studies.canManage(db.studies[q.studyId])) throw new Error("forbidden");
          delete db.studyQs[qid]; save();
        },
      },
      // papers 2+ members want to read (👀 on a review, or on their reading list) and no open study yet
      candidates(limit = 6) {
        const want = {};
        const add = (pid, u) => ((want[pid] ||= new Set()).add(u));
        Object.entries(db.reactions).forEach(([rid, r]) => { const rv = reviewById(rid); (r.want || []).forEach(u => rv && add(rv.paper, u)); });
        Object.entries(db.reading).forEach(([u, l]) => (l || []).forEach(x => add(x.paperId, u)));
        const open = new Set(Object.values(db.studies).filter(st => !st.closed).map(st => Store.studies.paperOf(st)?.id).filter(Boolean));
        return Object.entries(want).filter(([pid, us]) => us.size >= 2 && !open.has(pid) && SEED.allPapers.some(p => p.id === pid))
          .map(([pid, us]) => ({ paperId: pid, members: [...us] })).sort((a, b) => b.members.length - a.members.length).slice(0, limit);
      },
      // D-1 / D-day reminder for the signed-in member, once per study date (+ an admin's monthly tidy-up nudge)
      remind() {
        const me = current(); if (!me) return;
        const d0 = today(), d1 = (() => { const x = new Date(d0 + "T00:00:00"); x.setDate(x.getDate() + 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; })();
        let changed = false;
        Object.values(db.studies).forEach(st => {
          const tag = (st.date === d0 ? "d0:" : "d1:") + st.date;
          if (st.closed || !st.members.includes(me.id) || (st.date !== d0 && st.date !== d1) || st.reminded?.[me.id] === tag) return;
          (st.reminded ||= {})[me.id] = tag;
          const todo = !Store.studies.wrote(st, me.id) || (st.bring && !st.picks?.[me.id]);
          (db.notifications[me.id] ||= []).unshift({ id: uid("n"), at: now(), read: false, actor: st.presenter,
            type: (st.date === d0 ? "studyToday" : "studyTomorrow") + (todo ? "Todo" : ""), studyId: st.id, excerpt: st.title });
          changed = true;
        });
        // reading groups: whoever presents next hears "time to set up the next session", up to 3 days before its date
        Object.values(db.guides).forEach(g => {
          if (!g.group?.on || !g.group.cadence || Store.guides.upcoming(g) || Store.guides.nextPresenter(g) !== me.id) return;
          const nd = Store.guides.nextDate(g); if (!nd || nd > addDays(d0, 3) || (g.group.reminded ||= {})[me.id] === nd) return;
          g.group.reminded[me.id] = nd;
          (db.notifications[me.id] ||= []).unshift({ id: uid("n"), at: now(), read: false, actor: null, type: "guideSession", guideId: g.id, excerpt: g.title });
          changed = true;
        });
        // admins: once a month, a nudge to tidy tags and map region names (by hand, or by asking their own AI)
        const month = d0.slice(0, 7), u = db.users[me.id];
        if (me.role === "admin" && u && u.curationReminded !== month) {
          u.curationReminded = month;
          (db.notifications[me.id] ||= []).unshift({ id: uid("n"), at: now(), read: false, actor: null, type: "curation" });
          changed = true;
        }
        if (changed) save();
      },
    },

    files: {
      limits: FILE_LIMIT,
      kindOf: type => (type === "application/pdf" ? "pdf" : /^image\//.test(type || "") ? "image" : null),
      async put(blob, name) {
        requireUser();
        const kind = Store.files.kindOf(blob.type);
        if (!kind) throw new Error("file.type");
        if (blob.size > FILE_LIMIT[kind]) throw new Error("file.size");
        const id = uid("f_");
        if (server) {
          const r = await fetch(`/api/files/${id}`, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
          if (!r.ok) throw new Error("file.upload");
        } else await idbDo("readwrite", st => st.put(blob, id));
        save();  // persists the id sequence
        return { id, name: name || blob.name || id, type: blob.type, size: blob.size, kind };
      },
      async url(id) {
        if (server) return `/api/files/${encodeURIComponent(id)}`;
        if (fileUrls[id]) return fileUrls[id];
        const b = await idbDo("readonly", st => st.get(id)).catch(() => null);
        return b ? (fileUrls[id] = URL.createObjectURL(b)) : null;
      },
      async remove(id) {
        if (server) { await fetch(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" }); return; }
        await idbDo("readwrite", st => st.delete(id));
        if (fileUrls[id]) { URL.revokeObjectURL(fileUrls[id]); delete fileUrls[id]; }
      },
    },

    // ---- core-paper guides: an ordered, sectioned list of key papers for a topic, curated by the lab.
    // Anyone adds papers and 👍s them; the guide's owner (or an admin) edits its title, sections and order and removes
    // others' items. An item is a lab paper or one from outside (link / title); progress = papers you wrote a diary on.
    guides: {
      list() { return Object.values(db.guides).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")); },
      get(id) { return db.guides[id] || null; },
      canManage(g) { const me = current(); return !!me && !!g && (g.owner === me.id || me.role === "admin"); },
      paperOf(it) { return (it.paperId && SEED.allPapers.find(p => p.id === it.paperId)) || (it.key && SEED.allPapers.find(p => p.key === it.key)) || null; },
      titleOf(it) { return Store.guides.paperOf(it)?.title || it.meta?.title || "(untitled)"; },
      wroteBy(it, uid) { const p = Store.guides.paperOf(it); return !!p && SEED.allReviews.some(r => r.person === uid && r.paper === p.id); },
      progress(g, uid) { const u = uid || current()?.id; return { done: g.items.filter(it => Store.guides.wroteBy(it, u)).length, total: g.items.length }; },
      studiesFor(it) {  // as the common paper or one a member brought
        const p = Store.guides.paperOf(it), is = (pid, key) => (p && pid === p.id) || (it.key && key === it.key);
        return Object.values(db.studies).filter(st => is(Store.studies.paperOf(st)?.id, st.paperKey) || Store.studies.picks(st).some(pk => is(Store.studies.pickPaper(pk)?.id, pk.paperKey)));
      },
      forTag(tid) { return Store.guides.list().filter(g => (g.tags || []).includes(tid)); },
      forPaper(p) { return Store.guides.list().filter(g => g.items.some(it => Store.guides.paperOf(it)?.id === p.id || (it.key && it.key === p.key))); },

      // ---- reading group: a guide can run as a series of studies (its sessions), and its list grows with them.
      // group = { on, members, cadence: { weekday 0–6, time, every 1|2 weeks } | null, place, reminded }
      isGroup(g) { return !!g?.group?.on; },
      member(g, uid) { const u = uid || current()?.id; return !!u && !!g?.group?.members?.includes(u); },
      sessions(g) {
        return Object.values(db.studies).filter(st => st.guideId === g.id)
          .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.createdAt.localeCompare(b.createdAt));
      },
      roundOf(st) { const g = st?.guideId && db.guides[st.guideId]; return g ? Store.guides.sessions(g).indexOf(st) + 1 : 0; },
      upcoming(g) { return Store.guides.sessions(g).find(st => !st.closed) || null; },
      // where an item stands: on the coming session · read (in round n if it was one of these sessions) · brought up by round n
      itemState(g, it) {
        const sts = Store.guides.studiesFor(it), rounds = Store.guides.sessions(g);
        const next = sts.find(st => !st.closed && st.guideId === g.id), read = sts.filter(st => st.closed), here = read.find(st => st.guideId === g.id);
        const from = it.from && db.studies[it.from.studyId];
        return { next: next || null, nextRound: next ? rounds.indexOf(next) + 1 : 0, read: here || read[0] || null, round: here ? rounds.indexOf(here) + 1 : 0,
          fromRound: from?.guideId === g.id && from !== here ? rounds.indexOf(from) + 1 : 0 };
      },
      // what the next session could read: nothing a study covered yet; most 👍 first, then fewest lab readers, then list order
      suggestNext(g, n = 5) {
        return g.items.map((it, i) => ({ it, i, p: Store.guides.paperOf(it) })).filter(x => !Store.guides.studiesFor(x.it).length)
          .sort((a, b) => (b.it.votes || []).length - (a.it.votes || []).length || (a.p?.readers.length || 0) - (b.p?.readers.length || 0) || a.i - b.i)
          .slice(0, n).map(x => x.it);
      },
      // the next date on the group's rhythm (after its latest session), on its weekday
      nextDate(g) {
        const c = g.group?.cadence; if (!c) return "";
        const d0 = today(), step = 7 * (c.every || 1), last = Store.guides.sessions(g).map(st => st.date).filter(Boolean).sort().pop();
        let d = last ? addDays(last, step) : d0;
        while (d < d0) d = addDays(d, step);
        return addDays(d, (c.weekday - new Date(d + "T00:00:00Z").getUTCDay() + 7) % 7);
      },
      // presenters take turns in the members' order
      nextPresenter(g) {
        const ms = (g.group?.members || []).filter(u => db.users[u]); if (!ms.length) return g.owner;
        const last = Store.guides.sessions(g).filter(st => st.presenter).pop();
        return ms[((last ? ms.indexOf(last.presenter) : -1) + 1) % ms.length];
      },
      async setGroup(id, data) {
        requireUser(); const g = db.guides[id]; if (!g || !Store.guides.canManage(g)) throw new Error("forbidden");
        const prev = g.group || {}, c = data.cadence, wd = c && c.weekday !== "" && c.weekday != null ? Math.max(0, Math.min(6, +c.weekday)) : null;
        g.group = { on: !!data.on, members: [...new Set([g.owner, ...(prev.members || [])])].filter(u => db.users[u]),
          cadence: wd == null ? null : { weekday: wd, time: /^\d{2}:\d{2}$/.test(c.time || "") ? c.time : "", every: +c.every === 2 ? 2 : 1 },
          place: String(data.place ?? prev.place ?? "").slice(0, 80), reminded: prev.reminded || {} };
        g.updatedAt = now(); log("guide.group", `${g.title} ${g.group.on}`); save();
      },
      async joinGroup(id, on = true) {
        const me = requireUser(), g = db.guides[id]; if (!g?.group?.on) return;
        const ms = (g.group.members ||= []);
        if (on && !ms.includes(me.id)) { ms.push(me.id); notify(g.owner, { type: "guideJoin", guideId: g.id, excerpt: g.title }); }
        if (!on && me.id !== g.owner) g.group.members = ms.filter(u => u !== me.id);
        save();
      },
      // after a session: its paper, the papers members brought and what the notes say to read next join the list
      // (lines of "next" that name a lab paper or carry a link / DOI; anything else stays in the notes)
      async harvest(st) {
        const g = st?.guideId && db.guides[st.guideId]; if (!g) return 0;
        const before = g.items.length, from = kind => ({ studyId: st.id, kind });
        const p = Store.studies.paperOf(st);
        Store.guides._add(g, { ...(p ? { paperId: p.id } : { title: st.title, link: st.link }), from: from("paper") }, st.host, true);
        Store.studies.picks(st).forEach(pk => Store.guides._add(g, { ...(pk.paperId ? { paperId: pk.paperId } : { title: pk.title, link: pk.link }), note: pk.why, from: from("pick") }, pk.uid, true));
        for (const line of String(st.notes?.next || "").split("\n")) {
          const text = line.replace(/^[\s\-*•·\d.)]+/, "").trim(); if (!text) continue;
          const key = normTitle(text), lab = SEED.allPapers.find(q => q.key.length > 12 && key.includes(q.key));
          const url = (text.match(/https?:\/\/\S+|\b10\.\d{4,9}\/\S+/) || [])[0];
          if (lab) Store.guides._add(g, { paperId: lab.id, from: from("next") }, st.notes.by || st.host, true);
          else if (url) { const meta = await Store.lookup(url).catch(() => null); if (meta?.title) Store.guides._add(g, { ...meta, link: meta.link || url, from: from("next") }, st.notes.by || st.host, true); }
        }
        if (g.items.length > before) { g.updatedAt = now(); save(); }
        return g.items.length - before;
      },
      // items nobody in the lab has read yet, no study covered, and 2+ members 👍 — study candidates
      // (not a reading group's: its own sessions take those)
      studyCandidates(limit = 4) {
        const out = [];
        Store.guides.list().filter(g => !g.group?.on).forEach(g => g.items.forEach(it => {
          const p = Store.guides.paperOf(it);
          if ((!p || !p.readers.length) && (it.votes || []).length >= 2 && !Store.guides.studiesFor(it).length) out.push({ guide: g, item: it });
        }));
        return out.sort((a, b) => b.item.votes.length - a.item.votes.length).slice(0, limit);
      },
      async create(data) {
        const me = requireUser();
        const title = String(data.title || "").trim().slice(0, 120); if (!title) throw new Error("guide.title");
        const id = data.id && /^g_[\w-]{4,40}$/.test(data.id) && !db.guides[data.id] ? data.id : uid("g_");
        const sections = (data.sections?.length ? data.sections : ["기초", "핵심", "최신"]).map((x, i) => ({ id: "s" + (i + 1), title: String(x).slice(0, 40) }));
        db.guides[id] = { id, title, desc: String(data.desc || "").slice(0, 1000), tags: (data.tags || []).map(cleanTag).filter(Boolean).slice(0, 8),
          owner: me.id, sections, items: [], createdAt: now(), updatedAt: now() };
        log("guide.create", title); save();
        return id;
      },
      async update(id, patch) {
        requireUser(); const g = db.guides[id]; if (!g) throw new Error("guide.missing");
        if (!Store.guides.canManage(g)) throw new Error("forbidden");
        if ("title" in patch && String(patch.title).trim()) g.title = String(patch.title).trim().slice(0, 120);
        if ("desc" in patch) g.desc = String(patch.desc || "").slice(0, 1000);
        if ("tags" in patch) g.tags = (patch.tags || []).map(cleanTag).filter(Boolean).slice(0, 8);
        if (Array.isArray(patch.sections)) {  // [{id?, title}] — items of a dropped section move to the first one
          g.sections = patch.sections.filter(x => String(x.title || "").trim()).map((x, i) => ({ id: x.id || "s" + Date.now().toString(36) + i, title: String(x.title).trim().slice(0, 40) }));
          if (!g.sections.length) g.sections = [{ id: "s1", title: "핵심" }];
          const ok = new Set(g.sections.map(x => x.id)); g.items.forEach(it => { if (!ok.has(it.section)) it.section = g.sections[0].id; });
        }
        g.updatedAt = now(); log("guide.update", g.title); save();
      },
      async remove(id) {
        requireUser(); const g = db.guides[id]; if (!g) return;
        if (!Store.guides.canManage(g)) throw new Error("forbidden");
        delete db.guides[id]; log("guide.delete", g.title); save();
      },
      async addItem(id, data) {
        const me = requireUser(), g = db.guides[id]; if (!g) throw new Error("guide.missing");
        const itemId = Store.guides._add(g, data, me.id);
        save(); return itemId;
      },
      // one item in (the same paper twice = the first one); harvested items go to the last section, quietly.
      // The owner (and a group's members) hear about items others add.
      _add(g, data, by, quiet = false) {
        const known = data.paperId ? SEED.allPapers.find(p => p.id === data.paperId) : SEED.allPapers.find(p => p.key === normTitle(data.title || ""));
        const title = known?.title || String(data.title || "").trim().slice(0, 300); if (!title) throw new Error("guide.itemTitle");
        const key = known?.key || normTitle(title);
        const dup = g.items.find(it => it.key === key); if (dup) return dup.id;
        const section = g.sections.some(x => x.id === data.section) ? data.section : (data.from ? g.sections.at(-1) : g.sections[0]).id;
        const it = { id: uid("gi_"), section, key, note: String(data.note || "").slice(0, 300), by, at: now(), votes: [] };
        if (data.from) it.from = { studyId: data.from.studyId, kind: data.from.kind };
        if (known) it.paperId = known.id;
        else it.meta = { title, link: String(data.link || "").slice(0, 500), authors: String(data.authors || "").slice(0, 500), venue: String(data.venue || "").slice(0, 200), year: String(data.year || "").slice(0, 4) };
        g.items.push(it); g.updatedAt = now();
        if (!quiet) new Set([g.owner, ...(g.group?.on ? g.group.members || [] : [])]).forEach(u => u !== by && notify(u, { type: "guideItem", guideId: g.id, excerpt: title.slice(0, 80) }));
        log("guide.addItem", `${g.title} ← ${title.slice(0, 60)}`);
        return it.id;
      },
      async updateItem(id, itemId, patch) {
        const me = requireUser(), g = db.guides[id], it = g?.items.find(x => x.id === itemId); if (!it) throw new Error("guide.itemMissing");
        if (it.by !== me.id && !Store.guides.canManage(g)) throw new Error("forbidden");
        if ("note" in patch) it.note = String(patch.note || "").slice(0, 300);
        if ("section" in patch && g.sections.some(x => x.id === patch.section)) it.section = patch.section;
        g.updatedAt = now(); save();
      },
      async removeItem(id, itemId) {
        const me = requireUser(), g = db.guides[id], i = g ? g.items.findIndex(x => x.id === itemId) : -1; if (i < 0) return;
        if (g.items[i].by !== me.id && !Store.guides.canManage(g)) throw new Error("forbidden");
        g.items.splice(i, 1); g.updatedAt = now(); save();
      },
      async vote(id, itemId) {
        const me = requireUser(), it = db.guides[id]?.items.find(x => x.id === itemId); if (!it) return 0;
        const i = (it.votes ||= []).indexOf(me.id); if (i >= 0) it.votes.splice(i, 1); else it.votes.push(me.id);
        save(); return it.votes.length;
      },
      async moveItem(id, itemId, dir) {  // within its section, by the owner / an admin
        requireUser(); const g = db.guides[id]; if (!g || !Store.guides.canManage(g)) throw new Error("forbidden");
        const same = g.items.filter(x => x.section === g.items.find(y => y.id === itemId)?.section);
        const k = same.findIndex(x => x.id === itemId), j = k + dir; if (k < 0 || j < 0 || j >= same.length) return;
        const a = g.items.indexOf(same[k]), b = g.items.indexOf(same[j]); [g.items[a], g.items[b]] = [g.items[b], g.items[a]];
        g.updatedAt = now(); save();
      },
    },

    // reading list: lab papers saved with 📚 (or via 👀 / a study) and papers a member adds themselves (link, title, PDF).
    // status todo → reading → read; "written" once they've posted a diary on it. Stored items: { id, paperId } for a
    // lab paper, or { id, title, link, authors, venue, year, abstract, key } for one of their own; + status, note, files.
    reading: {
      list(uid) {
        const u = uid || current()?.id; if (!u) return [];
        const mine = SEED.allReviews.filter(r => r.person === u);
        return (db.reading[u] || []).map(x => {
          const p = x.paperId ? SEED.allPapers.find(q => q.id === x.paperId) : (x.key && SEED.allPapers.find(q => q.key === x.key)) || null;
          const written = mine.find(r => (p && r.paper === p.id) || (x.key && r.paperKey === x.key));
          return {
            id: x.id || "rd_" + x.paperId, paperId: p?.id || null, status: x.status || "todo", note: x.note || "", files: x.files || [],
            addedAt: x.at, startedAt: x.startedAt || null, readAt: x.readAt || null, source: x.source || (x.paperId ? "lab" : "self"),
            title: p?.title || x.title || "(untitled)", link: p?.link || x.link || "", authors: p?.authors || x.authors || "",
            venue: p?.venueNorm || p?.venue || x.venue || "", year: p?.year || x.year || "", abstract: p?.abstract || x.abstract || "",
            readers: p ? p.readers.filter(r => r !== u) : [], written: written?.id || null,
          };
        });
      },
      get(id) { return Store.reading.list().find(x => x.id === id) || null; },
      has(paperId) { return Store.reading.list().some(x => x.paperId === paperId); },
      _add(paperId) { const me = current(); if (!me) return; const l = (db.reading[me.id] ||= []); if (!l.some(x => x.paperId === paperId)) l.unshift({ paperId, at: now() }); },
      async toggle(paperId) {
        const me = requireUser();
        const l = (db.reading[me.id] ||= []), i = l.findIndex(x => x.paperId === paperId);
        if (i >= 0) l.splice(i, 1); else l.unshift({ paperId, at: now() });
        save();
        return i < 0;
      },
      // a paper of my own (or a lab paper) — returns the item id; the same paper twice just returns the first
      async add(data) {
        const me = requireUser();
        const title = String(data.title || "").trim().slice(0, 300); if (!title && !data.paperId) throw new Error("reading.title");
        const known = data.paperId ? SEED.allPapers.find(p => p.id === data.paperId) : SEED.allPapers.find(p => p.key === normTitle(title));
        const key = known ? known.key : normTitle(title);
        const l = (db.reading[me.id] ||= []);
        const dup = l.find(x => (known && x.paperId === known.id) || (x.key && x.key === key));
        if (dup) return dup.id || "rd_" + dup.paperId;
        const base = { id: uid("rd_"), at: now(), status: ["todo", "reading", "read"].includes(data.status) ? data.status : "todo",
          note: String(data.note || "").slice(0, 2000), files: cleanFiles(data.files), source: data.source || "self" };
        l.unshift(known ? { ...base, paperId: known.id } : { ...base, key, title, link: String(data.link || "").slice(0, 500),
          authors: String(data.authors || "").slice(0, 500), venue: String(data.venue || "").slice(0, 200), year: String(data.year || "").slice(0, 4),
          abstract: String(data.abstract || "").slice(0, 5000) });
        log("reading.add", title || known.title); save();
        return base.id;
      },
      async update(id, patch) {
        const me = requireUser();
        const x = (db.reading[me.id] || []).find(y => (y.id || "rd_" + y.paperId) === id); if (!x) throw new Error("reading.missing");
        x.id ||= id;
        if ("status" in patch && ["todo", "reading", "read"].includes(patch.status) && patch.status !== x.status) {
          x.status = patch.status;
          if (patch.status === "reading") x.startedAt ||= now();
          if (patch.status === "read") { x.startedAt ||= now(); x.readAt = now(); }
          if (patch.status === "todo") { delete x.startedAt; delete x.readAt; }
        }
        if ("note" in patch) x.note = String(patch.note || "").slice(0, 2000);
        if ("files" in patch) {
          const next = cleanFiles(patch.files), keep = new Set(next.map(f => f.id));
          await Promise.all((x.files || []).filter(f => !keep.has(f.id) && !fileInUse(f.id)).map(f => Store.files.remove(f.id).catch(() => {})));
          x.files = next;
        }
        if (!x.paperId) ["title", "link", "authors", "venue", "year", "abstract"].forEach(k => { if (k in patch) x[k] = String(patch[k] || "").slice(0, k === "abstract" ? 5000 : 500); });
        if ("title" in patch && !x.paperId) x.key = normTitle(x.title);
        save();
      },
      async remove(id) {
        const me = requireUser();
        const l = db.reading[me.id] || [], i = l.findIndex(y => (y.id || "rd_" + y.paperId) === id); if (i < 0) return;
        const [x] = l.splice(i, 1);
        await Promise.all((x.files || []).filter(f => !fileInUse(f.id)).map(f => Store.files.remove(f.id).catch(() => {})));
        save();
      },
    },

    notifications: {
      list() { const me = current(); return me ? db.notifications[me.id] || [] : []; },
      unread() { return Store.notifications.list().filter(n => !n.read).length; },
      async markAllRead() { Store.notifications.list().forEach(n => (n.read = true)); save(); },
      async markRead(id) { const n = Store.notifications.list().find(x => x.id === id); if (n) { n.read = true; save(); } },
    },

    tags: {
      usage() {
        const u = {};
        SEED.allPapers.forEach(p => { p.domains.forEach(d => (u["d:" + d] = (u["d:" + d] || 0) + 1)); p.methods.forEach(m => (u["m:" + m] = (u["m:" + m] || 0) + 1)); (p.free || []).forEach(f => (u[f] = (u[f] || 0) + 1)); });
        return u;
      },
      async rename(id, label, labelEn, color) { requireAdmin(); db.tagOps.push({ op: "rename", id, label, labelEn, color: color ? safeColor(color) : undefined, at: now() }); log("tag.rename", `${id} → ${label}`); save(); },
      async merge(from, into) {
        requireAdmin();
        if (from === into || from[0] !== into[0]) throw new Error("tag.mergeAxis");
        db.tagOps.push({ op: "merge", from, into, at: now() }); log("tag.merge", `${from} → ${into}`); save();
      },
      async create({ axis, label, labelEn, color }) {
        requireAdmin();
        const id = `${axis[0]}:${slug(labelEn || label) || uid("t")}`;
        db.tagOps.push({ op: "create", id, axis, label, labelEn, color: safeColor(color), at: now() }); log("tag.create", label); save();
        return id;
      },
      async undo(index) { requireAdmin(); const op = db.tagOps.splice(index, 1)[0]; log("tag.undo", JSON.stringify(op)); save(); },
      ops() { return db.tagOps; },
    },

    terms: {
      list() { return db.terms; },
      current() { const d = today(); return db.terms.find(t => t.start <= d && d <= t.end) || db.terms[db.terms.length - 1]; },
      async save(term) {
        requireAdmin();
        const i = db.terms.findIndex(t => t.id === term.id);
        if (i >= 0) db.terms[i] = { ...db.terms[i], ...term }; else db.terms.push(term);
        db.terms.sort((a, b) => a.start.localeCompare(b.start));
        log("term.save", term.id); save();
      },
    },

    // paper metadata from free scholarly APIs (CORS-enabled). In the Supabase version this may move to an edge function.
    async lookup(input) {
      input = (input || "").trim();
      const doi = (input.match(/10\.\d{4,9}\/[^\s"<>]+/) || [])[0]?.replace(/[.,;)]$/, "");
      const arxiv = (input.match(/arxiv\.org\/(?:abs|pdf)\/([\w.\-\/]+?)(?:v\d+)?(?:\.pdf)?$/i) || input.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/) || [])[1];
      const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); };
      const fromS2 = d => d && ({ title: d.title, venue: d.venue || d.journal?.name || "", year: d.year || "", abstract: d.abstract || d.tldr?.text || "",
        authors: (d.authors || []).map(a => a.name).join(", "), link: d.externalIds?.DOI ? "https://doi.org/" + d.externalIds.DOI : (d.url || input), source: "Semantic Scholar" });
      const F = "title,venue,year,abstract,authors,externalIds,url,journal,tldr";
      const pii = (input.match(/pii\/(S?[0-9X]{15,17})/i) || [])[1];
      const fromCrossref = c => c && ({ title: (c.title || [])[0] || "", venue: (c["container-title"] || [])[0] || "", year: c.issued?.["date-parts"]?.[0]?.[0] || "",
        authors: (c.author || []).map(a => [a.given, a.family].filter(Boolean).join(" ")).join(", "),
        abstract: (c.abstract || "").replace(/<[^>]+>/g, "").replace(/^\s*Abstract\s*/i, "").trim(), link: c.DOI ? "https://doi.org/" + c.DOI : input, source: "Crossref" });
      const fromDatacite = a => a && ({ title: a.titles?.[0]?.title || "", venue: a.publisher === "arXiv" ? "arXiv" : a.publisher || "", year: a.publicationYear || "",
        authors: (a.creators || []).map(c => c.name?.includes(",") ? c.name.split(",").reverse().join(" ").trim() : c.name).join(", "),
        abstract: (a.descriptions || []).find(d => d.descriptionType === "Abstract")?.description || "", link: input.startsWith("http") ? input : "https://doi.org/" + a.doi, source: "DataCite" });
      const fromOpenAlex = o => {
        if (!o) return null;
        const words = [];
        Object.entries(o.abstract_inverted_index || {}).forEach(([w, pos]) => pos.forEach(i => (words[i] = w)));
        return { title: o.title, venue: o.primary_location?.source?.display_name || "", year: o.publication_year || "",
          authors: (o.authorships || []).map(a => a.author.display_name).join(", "), abstract: words.join(" "),
          link: o.doi || o.primary_location?.landing_page_url || "", source: "OpenAlex" };
      };
      // try sources in order; any network/CORS/rate-limit error just moves on to the next one
      const attempts = [];
      if (arxiv) attempts.push(async () => fromDatacite((await get(`https://api.datacite.org/dois/10.48550/arxiv.${arxiv}`)).data.attributes));
      if (doi) attempts.push(
        async () => fromS2(await get(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${F}`)),
        async () => fromCrossref((await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)).message),
        async () => fromDatacite((await get(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`)).data.attributes));
      if (pii) attempts.push(async () => fromCrossref((await get(`https://api.crossref.org/works?filter=alternative-id:${pii}&rows=1`)).message.items?.[0]));
      if (!doi && !arxiv && !pii && !/^https?:/.test(input)) attempts.push(
        async () => fromS2((await get(`https://api.semanticscholar.org/graph/v1/paper/search/match?query=${encodeURIComponent(input)}&fields=${F}`)).data?.[0]),
        async () => fromOpenAlex((await get(`https://api.openalex.org/works?search=${encodeURIComponent(input)}&per-page=1`)).results?.[0]));
      for (const a of attempts) {
        try { const m = await a(); if (m?.title) return m; } catch (e) { /* next source */ }
      }
      return null;
    },

    // tag suggestions without an LLM: similar papers vote with their tags + keyword rules
    suggestTags({ title, abstract, content }, k = 8) {
      const text = `${title} ${abstract || ""}`;
      const nb = lexSimilar(text.trim().length > 10 ? text : `${title} ${content || ""}`, SEED.allPapers, 12);
      const score = {};
      nb.forEach(([p, s]) => { p.domains.forEach(d => (score["d:" + d] = (score["d:" + d] || 0) + s)); p.methods.forEach(m => (score["m:" + m] = (score["m:" + m] || 0) + s * 0.8)); (p.free || []).forEach(f => (score[f] = (score[f] || 0) + s * 0.6)); });
      const body = `${title} ${abstract || ""} ${content || ""}`;
      Object.entries(RULES).forEach(([tid, pats]) => {
        const hit = pats.filter(p => p.test(title)).length * 0.5 + Math.min(3, pats.filter(p => p.test(body)).length) * 0.15;
        if (hit && SEED.topics.some(t => t.id === tid)) score[tid] = (score[tid] || 0) + hit;
      });
      return {
        tags: Object.entries(score).filter(([tid]) => SEED.topics.some(t => t.id === tid)).sort((a, b) => b[1] - a[1]).slice(0, k).map(([tid, s]) => ({ id: tid, score: s })),
        similar: nb.slice(0, 5).map(([p, s]) => ({ id: p.id, score: s })),
      };
    },
    findPaper(title) { const key = normTitle(title); return key.length > 8 ? SEED.allPapers.find(p => p.key === key) || null : null; },

    // my AI (MCP) tokens — kept by the server (hashed), so only there; the token itself comes back once, from create
    tokens: {
      async list() { const r = await fetch("/api/tokens", { cache: "no-store" }); if (!r.ok) throw new Error("tokens"); return r.json(); },
      async create(label) {
        const r = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
        if (!r.ok) throw new Error("tokens"); return r.json();
      },
      async remove(id) { const r = await fetch(`/api/tokens/${encodeURIComponent(id)}`, { method: "DELETE" }); if (!r.ok) throw new Error("tokens"); },
    },

    admin: {
      exportJSON() { requireAdmin(); return JSON.stringify({ exportedAt: now(), db }, null, 1); },
      async importJSON(text) { requireAdmin(); const j = JSON.parse(text); db = Object.assign(empty(), j.db || j); save(); await saving; },
      async reset() {
        requireAdmin();
        if (server) { db = empty(); save(); await saving; } else localStorage.removeItem(KEY);
        localStorage.removeItem(SESSION); try { indexedDB.deleteDatabase(FILES_DB); } catch (e) {}
      },
      log() { return db.log; },
    },
  };
  window.Store = Store;

  // ---------------------------------------------------------------- MCP (served by scripts/serve.py)
  // snapshot: the built dataset + social data, without password hashes — what the MCP server reads
  function snapshot() {
    const users = Object.values(db.users).map(u => ({ id: u.id, name: u.name, role: u.role, color: u.color || null, quota: u.quota || {}, disabled: !!u.disabled }));
    return {
      at: now(), users, people: SEED.people, topics: SEED.topics, papers: SEED.allPapers, reviews: SEED.allReviews,
      clusters: SEED.clusters, terms: db.terms, comments: Object.values(db.comments), reactions: db.reactions,
      reading: Object.fromEntries(Object.keys(db.reading).map(u => [u, Store.reading.list(u)])), notifications: db.notifications,
      guides: Object.values(db.guides).map(g => ({ ...g, items: g.items.map(it => ({ ...it, title: Store.guides.titleOf(it), paperId: Store.guides.paperOf(it)?.id || null,
        readers: Store.guides.paperOf(it)?.readers || [], studies: Store.guides.studiesFor(it).map(st => st.id) })) })), tagOps: db.tagOps, offDays: Object.values(db.offDays),
      // computed here so the MCP server never re-implements the duty rules (working days, holidays, start/end dates)
      duties: Object.fromEntries((db.terms || []).map(t => [t.id, Object.fromEntries(Object.keys(db.users).map(u => [u, Store.quota(u, t)]))])),
      holidays: [...new Set((db.terms || []).flatMap(t => [+t.start.slice(0, 4), +t.end.slice(0, 4)]))].flatMap(y => Store.calendar.holidays(y)),
      studies: Object.values(db.studies).map(st => ({ ...st, paperId: Store.studies.paperOf(st)?.id || st.paperId,
        picks: Object.fromEntries(Object.entries(st.picks || {}).map(([u, pk]) => [u, { ...pk, paperId: Store.studies.pickPaper(pk)?.id || pk.paperId }])) })),
      studyQuestions: Object.values(db.studyQs), mcpDrafts: db.mcpDrafts || {},
    };
  }
  // one MCP command, applied as its actor. The server runs this in a headless copy of this file (scripts/store_worker.mjs)
  // and stores the result; a hosted DB would do the same in an RPC / edge function. Returns what it made (ids) for the caller.
  const OPS = new Set(["draft", "draft.delete", "comment", "react", "inbox.read", "reading.add", "study.question", "study.questionVote",
    "study.notesDraft", "study.create", "study.join",
    "tag.merge", "tag.rename", "tag.create", "quota.set", "term.save", "user.role", "user.disable", "cluster.name", "paper.tags",
    "offday.save", "offday.remove", "reading.update", "guide.create", "guide.addItem", "guide.vote", "guide.update"]);
  async function applyOp(op) {
    if (!OPS.has(op.op)) throw new Error("unknown op");
    const actor = db.users[op.actor];
    if (!actor || actor.disabled) throw new Error("actor");
    const adminOnly = ["tag.merge", "tag.rename", "tag.create", "quota.set", "term.save", "user.role", "user.disable", "cluster.name", "paper.tags",
      "offday.save", "offday.remove"];
    if (adminOnly.includes(op.op) && actor.role !== "admin") throw new Error("forbidden");
    actingAs = op.actor;
    let res = {};
    try {
      if (op.op === "draft") {
        (db.mcpDrafts ||= {})[op.actor] ||= [];
        db.mcpDrafts[op.actor].unshift({ id: op.id, at: op.at || now(), ...op.data, files: cleanFiles(op.data.files) });
        (db.notifications[op.actor] ||= []).unshift({ id: uid("n"), at: now(), read: false, actor: op.actor, type: "mcpDraft", draftId: op.id, excerpt: op.data.title });
        res = { draftId: op.id };
      }
      if (op.op === "draft.delete") {
        const list = db.mcpDrafts?.[op.actor] || [], i = list.findIndex(d => d.id === op.draftId);
        if (i < 0) throw new Error("draft.missing");
        list.splice(i, 1);
        db.notifications[op.actor] = (db.notifications[op.actor] || []).filter(n => n.draftId !== op.draftId);
      }
      if (op.op === "comment") res = { commentId: (await Store.comments.add({ reviewId: op.reviewId, parent: op.parent || null, kind: op.kind || "comment", body: op.body })).id };
      if (op.op === "react") {  // set, not toggle: 👍 a diary, or "I want to read this too" (→ my reading list)
        if (!["like", "want"].includes(op.kind) || !reviewById(op.reviewId)) throw new Error("react.bad");
        const on = (db.reactions[op.reviewId]?.[op.kind] || []).includes(op.actor);
        if (on !== (op.on !== false)) await Store.reactions.toggle(op.reviewId, op.kind);
        const r = Store.reactions.get(op.reviewId);
        res = { like: r.like.length, want: r.want.length };
      }
      if (op.op === "inbox.read") (db.notifications[op.actor] || []).forEach(n => { if (!op.ids || op.ids.includes(n.id)) n.read = true; });
      if (op.op === "study.question") res = { questionId: (await Store.studies.questions.add(op.studyId, op.body)).id };
      if (op.op === "study.questionVote") {
        const q = db.studyQs[op.questionId]; if (!q) throw new Error("question.missing");
        if (q.votes.includes(op.actor) !== (op.on !== false)) await Store.studies.questions.vote(op.questionId);
        res = { votes: db.studyQs[op.questionId].votes.length };
      }
      if (op.op === "study.join") { const st = db.studies[op.studyId]; if (!st || st.closed) throw new Error("study.missing"); await Store.studies.join(op.studyId); }
      if (op.op === "study.create") {
        // a reading group's next session gets the same defaults as the site's "next session" form
        const g = op.guideId ? db.guides[op.guideId] : null, grp = g && Store.guides.isGroup(g) ? g.group : null;
        if (op.guideId && !g) throw new Error("guide.missing");
        if (grp) {
          if (Store.guides.upcoming(g)) throw new Error("guide.upcoming");
          if (!Store.guides.member(g) && !Store.guides.canManage(g)) throw new Error("forbidden");
        }
        const it = g ? (g.items.find(x => x.id === op.itemId) || (grp && !op.title && !op.paperId ? Store.guides.suggestNext(g)[0] : null)) : null;
        const p = op.paperId ? SEED.allPapers.find(x => x.id === op.paperId) : it ? Store.guides.paperOf(it) : null;
        const title = p?.title || op.title || (it ? Store.guides.titleOf(it) : "");
        res = { studyId: (await Store.studies.create({
          title, paperId: p?.id || null, link: op.link || p?.link || it?.meta?.link || "",
          date: op.date || (grp ? Store.guides.nextDate(g) : ""), time: op.time || grp?.cadence?.time || "", place: op.place || grp?.place || "",
          presenter: op.presenter && db.users[op.presenter] ? op.presenter : grp ? Store.guides.nextPresenter(g) : op.actor,
          desc: op.desc || "", invite: [...new Set([...(op.invite || []), ...(grp ? grp.members : [])])].filter(u => db.users[u]),
          blind: op.blind !== false, bring: !!op.bring, guideId: g ? g.id : null,
        })).id };
      }
      if (op.op === "study.notesDraft") {
        const st = db.studies[op.studyId];
        if (!st || (!st.members.includes(op.actor) && actor.role !== "admin")) throw new Error("forbidden");
        st.notesDraft = { conclusion: op.conclusion || "", open: op.open || "", next: op.next || "", by: op.actor, at: now() };
        (db.notifications[op.actor] ||= []).unshift({ id: uid("n"), at: now(), read: false, actor: op.actor, type: "studyNotesDraft", studyId: st.id, excerpt: st.title });
      }
      if (op.op === "reading.add") {
        if (op.paperId) res = { itemId: await Store.reading.add({ paperId: op.paperId, note: op.note, status: op.status, source: "mcp" }) };
        else {  // a paper of their own: a link / DOI / arXiv id is looked up like in the write form
          const meta = op.input ? await Store.lookup(op.input) : null;
          if (op.input && !meta && /^https?:|^10\.\d/.test(op.input) && !op.title) throw new Error("lookup.failed");
          res = { itemId: await Store.reading.add({ ...(meta || {}), title: meta?.title || op.title || op.input, link: meta?.link || op.link || (/^https?:/.test(op.input || "") ? op.input : ""),
            note: op.note, status: op.status, source: "mcp" }), title: meta?.title || op.title || op.input };
        }
      }
      if (op.op === "reading.update") await Store.reading.update(op.itemId, op.patch || {});
      if (op.op === "guide.create") { await Store.guides.create({ ...op.guide, id: op.guideId }); res = { guideId: op.guideId }; }
      if (op.op === "guide.update") await Store.guides.update(op.guideId, op.patch || {});
      if (op.op === "guide.addItem") {  // a link / DOI / arXiv id is looked up like in the write form
        const meta = op.input && !op.paperId ? await Store.lookup(op.input) : null;
        res = { itemId: await Store.guides.addItem(op.guideId, { ...(meta || {}), paperId: op.paperId, title: meta?.title || op.title || op.input,
          link: meta?.link || op.link || (/^https?:/.test(op.input || "") ? op.input : ""), section: op.section, note: op.note }) };
      }
      if (op.op === "guide.vote") { const it = db.guides[op.guideId]?.items.find(x => x.id === op.itemId); if (it && !(it.votes || []).includes(op.actor)) await Store.guides.vote(op.guideId, op.itemId); }
      if (op.op === "tag.merge") await Store.tags.merge(op.from, op.into);
      if (op.op === "tag.rename") await Store.tags.rename(op.tagId, op.label, op.labelEn, op.color);
      if (op.op === "tag.create") await Store.tags.create({ axis: op.axis, label: op.label, labelEn: op.labelEn, color: op.color });
      if (op.op === "quota.set") await Store.users.setQuota(op.member, op.quota);
      if (op.op === "term.save") await Store.terms.save(op.term);
      if (op.op === "offday.save") await Store.calendar.save(op.offDay);
      if (op.op === "offday.remove") await Store.calendar.remove(op.offDayId);
      if (op.op === "user.role" || op.op === "user.disable") {
        if (!db.users[op.member] || op.member === op.actor) throw new Error("forbidden");  // nobody locks themselves out
        if (op.op === "user.role") await Store.users.setRole(op.member, op.role === "admin" ? "admin" : "member");
        else await Store.users.setDisabled(op.member, !!op.disabled);
      }
      if (op.op === "cluster.name") {
        const c = (SEED.clusters || []).find(x => x.id === op.clusterId); if (!c) throw new Error("cluster.missing");
        const ko = String(op.ko || "").trim().slice(0, 60), en = String(op.en || "").trim().slice(0, 60);
        if (!ko && !en) { if (c.customKey) delete db.clusterNames[c.customKey]; }  // back to the automatic name
        else {
          const prev = c.customKey && db.clusterNames[c.customKey];
          // keywords: the small line under a region's name — given ones replace, none given keeps what an admin set before
          const keywords = Array.isArray(op.keywords) ? op.keywords.map(k => String(k).trim().slice(0, 40)).filter(Boolean).slice(0, 5) : prev?.keywords;
          db.clusterNames[c.customKey || uid("cn_")] = { level: c.level, ko: ko || en, en: en || ko, ...(keywords?.length ? { keywords } : {}),
            members: [...(clusterMembers()[c.id] || [])], by: op.actor, at: now() };
        }
        log("cluster.name", `${c.id} → ${ko || en || "(auto)"}`); save(); buildDataset();
      }
      if (op.op === "paper.tags") {
        const p = SEED.allPapers.find(x => x.id === op.paperId); if (!p) throw new Error("paper.missing");
        const ids = (op.tags || []).map(cleanTag).filter(Boolean);
        if (ids.some(t => !/^[dm]:/.test(t) || !SEED.topics.some(x => x.id === t))) throw new Error("tag.unknown");
        if (!ids.length) delete db.paperTags[p.id];  // back to the keyword-rule tags
        else db.paperTags[p.id] = { domains: ids.filter(t => t[0] === "d").map(t => t.slice(2)), methods: ids.filter(t => t[0] === "m").map(t => t.slice(2)),
          by: op.actor, at: now() };
        log("paper.tags", `${p.title.slice(0, 60)} → ${ids.join(", ") || "(auto)"}`); save(); buildDataset();
      }
      log("mcp." + op.op, `${actor.name}: ${op.summary || ""}`);
    } finally { actingAs = null; }
    return res;
  }
  const RELOADING = new Set(["tag.merge", "tag.rename", "tag.create", "quota.set", "term.save", "user.role", "user.disable", "cluster.name", "paper.tags",
    "offday.save", "offday.remove"]);
  if (HEADLESS) { window.__LABSIDIAN_HEADLESS__({ applyOp, snapshot, db: () => db }); return; }

  // ---------------------------------------------------------------- server sync: changes made elsewhere (MCP, other tabs)
  let misses = 0, ticks = 0;
  async function pull() {
    if (!server) return;
    await saving;
    let r;
    try {
      const x = await fetch(`/api/changes?since=${server.version}`, { cache: "no-store" });
      if (x.status === 401) { location.reload(); return; }  // signed out (password changed elsewhere, session expired) → sign-in
      r = await x.json(); misses = 0;
    }
    catch (e) { misses++; return; }  // server down: poll less and less often (up to once a minute) until it's back
    if (server.failed) save();  // the server is back: resend what didn't get stored
    if (r.version === server.version) return;
    const st = await fetch("/api/state", { cache: "no-store" }).then(x => x.json()).catch(() => null);
    if (!st) return;
    await saving;
    if ([...recordsOf(db)].some(([k, v]) => server.synced.get(k) !== v)) return;  // local edits not sent yet → next round
    db = Object.assign(empty(), st.db);
    server.version = st.version; server.synced = recordsOf(db);
    ensureSeed();  // the server's data may have been reset meanwhile
    buildDataset();
    window.dispatchEvent(new Event("lab:data"));  // pages re-index the rebuilt window.LAB before anything re-renders
    const ops = (r.ops || []).filter(o => o.status === "ok");
    window.dispatchEvent(new CustomEvent("lab:mcp", { detail: { applied: ops.length, needsReload: ops.some(o => RELOADING.has(o.op)) } }));
  }
  if (server) {
    setInterval(() => { if (!document.hidden && ++ticks % Math.min(2 ** misses, 20) === 0) pull(); }, 3000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });  // back to this tab → catch up now
  }

  // attachments that lived in this browser's IndexedDB move to the server together with the data
  if (migrateFiles) (async () => {
    try {
      const ids = await idbDo("readonly", st => st.getAllKeys());
      for (const id of ids) {
        const b = await idbDo("readonly", st => st.get(id));
        if (b) await fetch(`/api/files/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": b.type }, body: b });
      }
    } catch (e) { console.warn("attachment migration failed", e); }
  })();
})();
