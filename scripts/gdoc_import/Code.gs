// Labsidian ← the lab's shared Paper Diary (a Google Doc in a private Drive folder).
// Runs in the Google account of a member who can open the folder. It only reads the doc (drive.readonly) and sends it
// as .docx to the Labsidian server, which adds the diaries the lab doesn't have yet (POST /api/import/diary).
// Setup: README → "공유 구글 문서에서 다이어리 가져오기". Script properties:
//   LABSIDIAN_URL    e.g. https://labsidian-aim.duckdns.org
//   LABSIDIAN_TOKEN  an admin's token (사이트 → 내 페이지 → AI 연결, signed in as an admin)
//   FOLDER_ID        the Drive folder with the "… Paper Diary" docs
//   APPLY            "true" to really add them; anything else only previews (see the execution log)

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function syncDiary() {
  const props = PropertiesService.getScriptProperties(), p = props.getProperties();
  const files = DriveApp.getFolderById(p.FOLDER_ID).getFilesByType(MimeType.GOOGLE_DOCS);
  let doc = null;  // this term's diary: the most recently edited "… Paper Diary"
  while (files.hasNext()) {
    const f = files.next();
    if (/paper\s*diary/i.test(f.getName()) && (!doc || f.getLastUpdated() > doc.getLastUpdated())) doc = f;
  }
  if (!doc) throw new Error("no Google Doc with 'Paper Diary' in its name in the folder");
  const apply = p.APPLY === "true", stamp = `${doc.getId()} ${doc.getLastUpdated().toISOString()} ${apply}`;
  if (stamp === p.LAST_SENT) return Logger.log("%s: unchanged since the last run", doc.getName());

  const docx = UrlFetchApp.fetch(`https://www.googleapis.com/drive/v3/files/${doc.getId()}/export?mimeType=${encodeURIComponent(DOCX)}`,
    { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } }).getBlob().getBytes();
  const res = UrlFetchApp.fetch(p.LABSIDIAN_URL.replace(/\/+$/, "") + "/api/import/diary", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + p.LABSIDIAN_TOKEN },
    payload: JSON.stringify({ docx: Utilities.base64Encode(docx), apply }),
  });
  const text = res.getContentText();
  if (res.getResponseCode() !== 200) throw new Error(`Labsidian ${res.getResponseCode()}: ${text.slice(0, 300)}`);
  const body = JSON.parse(text), line = x => `  ${x.date} ${x.name} · ${x.title}${x.reason ? ` (${x.reason})` : ""}`;
  Logger.log("%s: %s diaries in the doc · %s %s · skipped %s\n%s\nskipped (not duplicates):\n%s", doc.getName(), body.found,
    body.added.length, body.applied ? "added" : "would be added (preview — set APPLY to true)", body.skipped.length,
    body.added.map(line).join("\n"), body.skipped.filter(x => x.reason !== "duplicate").map(line).join("\n"));
  props.setProperty("LAST_SENT", stamp);
}

// once: run syncDiary every morning
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("syncDiary").timeBased().everyDays(1).atHour(6).create();
}
