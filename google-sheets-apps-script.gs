/**
 * קליטת פניות מהאתר ל-Google Sheets
 *
 * אם יצרתם את הסקריפט מתוך הגיליון (Extensions ← Apps Script) – אין צורך לשנות כלום.
 * אם יצרתם אותו ב-script.google.com (סקריפט עצמאי) – הדביקו את מזהה הגיליון כאן:
 * המזהה הוא החלק שבין /d/ ל-/edit בכתובת הגיליון.
 */
const SPREADSHEET_ID = '';

const HEADERS = ['תאריך ושעה', 'שם', 'טלפון', 'אימייל', 'נושא', 'הודעה'];

function getSheet_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('הסקריפט לא מחובר לגיליון. הדביקו את מזהה הגיליון ב-SPREADSHEET_ID.');
  return ss.getSheets()[0];
}

/** בדיקת תקינות: פתחו את כתובת ה-/exec בדפדפן ותראו אם יש חיבור לגיליון */
function doGet() {
  try {
    const sheet = getSheet_();
    return ContentService.createTextOutput('OK - מחובר לגיליון: ' + sheet.getParent().getName());
  } catch (err) {
    return ContentService.createTextOutput('שגיאה: ' + err.message);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
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
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
