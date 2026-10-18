/**
 * קליטת פניות מהאתר ל-Google Sheets
 * הדביקו את הקוד ב: הגיליון ← תוספים/Extensions ← Apps Script
 */
const HEADERS = ['תאריך ושעה', 'שם', 'טלפון', 'אימייל', 'נושא', 'הודעה'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setRightToLeft(true);
    }
    const d = JSON.parse(e.postData.contents);
    // מונע הזרקת נוסחאות בתאים
    const safe = v => { v = String(v || '').slice(0, 2000); return /^[=+\-@]/.test(v) ? "'" + v : v; };
    sheet.appendRow([safe(d.time), safe(d.name), safe(d.phone), safe(d.email), safe(d.topic), safe(d.message)]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
