// Labsidian ← the lab's shared Paper Diary (a Google Doc in a private Drive folder).
// Deployed as a web app in the Google account of a member who can open the folder. It only reads the doc
// (drive.readonly) and hands it out as .docx to whoever knows KEY: the lab server fetches it every morning
// (scripts/gdoc_pull.py) — the Labsidian server only takes requests from the campus network, so Google can't send it.
// Setup: README → "공유 구글 문서에서 다이어리 가져오기". Script properties:
//   FOLDER_ID  the Drive folder with the "… Paper Diary" docs
//   KEY        a long random string; the same one goes into the server's data/gdoc_import.json

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function doGet(e) {
  const p = PropertiesService.getScriptProperties().getProperties();
  const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  if (!p.KEY || p.KEY.length < 20 || e.parameter.key !== p.KEY) return json({ error: "key" });
  const files = DriveApp.getFolderById(p.FOLDER_ID).getFilesByType(MimeType.GOOGLE_DOCS);
  let doc = null;  // this term's diary: the most recently edited "… Paper Diary"
  while (files.hasNext()) {
    const f = files.next();
    if (/paper\s*diary/i.test(f.getName()) && (!doc || f.getLastUpdated() > doc.getLastUpdated())) doc = f;
  }
  if (!doc) return json({ error: "no Google Doc with 'Paper Diary' in its name in the folder" });
  const docx = UrlFetchApp.fetch(`https://www.googleapis.com/drive/v3/files/${doc.getId()}/export?mimeType=${encodeURIComponent(DOCX)}`,
    { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } }).getBlob().getBytes();
  return json({ name: doc.getName(), updated: doc.getLastUpdated().toISOString(), docx: Utilities.base64Encode(docx) });
}

// run once from the editor: makes KEY (copy it from the log into the server's data/gdoc_import.json)
function makeKey() {
  const key = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("KEY", key);
  Logger.log("KEY = %s", key);
}
