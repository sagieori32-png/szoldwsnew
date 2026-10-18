/**
 * בית ספר סאלד – שרת האתר (Google Apps Script)
 * ------------------------------------------------
 * מטפל בשלושה דברים:
 *  1. טופס "השאירו פרטים": שורה חדשה בגיליון.
 *  2. תוכן האתר: קריאה ציבורית ושמירה על ידי משתמשים מורשים (קובץ JSON ב-Drive).
 *  3. מערכת הניהול: התחברות, ניהול משתמשים, העלאת תמונות וגרסאות קודמות.
 */

/* ========= הגדרות ========= */
const SPREADSHEET_ID = '';            // רק אם הסקריפט לא נוצר מתוך הגיליון (אם הדבקתם מזהה קודם – הדביקו אותו שוב)
const ADMIN_USER = 'ADMINSZ';         // מנהל ראשון – נוצר פעם אחת בלבד, בכניסה הראשונה
const ADMIN_PASS = 'SZOLD12345';      // מומלץ להחליף סיסמה מיד אחרי הכניסה הראשונה (מערכת ניהול ← סיסמה)

const CONTENT_FILE = 'szold-site-content.json';
const BACKUP_FOLDER = 'szold-site-backups';
const IMAGE_FOLDER = 'szold-site-images';
const MAX_BACKUPS = 30;
const SESSION_SECONDS = 6 * 60 * 60;  // 6 שעות
const HEADERS = ['תאריך ושעה', 'שם', 'טלפון', 'אימייל', 'נושא', 'הודעה'];

/* ========= הרשאות (להריץ ידנית פעם אחת מתוך העורך) ========= */
function authorize() {
  DriveApp.getRootFolder();
  PropertiesService.getScriptProperties().getKeys();
  CacheService.getScriptCache().get('x');
  getSheet_();
  ensureUsers_();
  return 'ההרשאות אושרו';
}

/* ========= נקודות כניסה ========= */
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'content') {
    return json_(null, readContentText_());
  }
  try {
    const sheet = getSheet_();
    return ContentService.createTextOutput('OK - מחובר לגיליון: ' + sheet.getParent().getName() + ' | מערכת ניהול פעילה');
  } catch (err) {
    return ContentService.createTextOutput('שגיאה: ' + err.message);
  }
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad request' }); }
  if (d && d.action) return handleAction_(d);
  return handleForm_(d);
}

/* ========= טופס פניות ========= */
function handleForm_(d) {
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
    const safe = v => { v = String(v || '').slice(0, 2000); return /^[=+\-@]/.test(v) ? "'" + v : v; };
    sheet.appendRow([safe(d.time), safe(d.name), safe(d.phone), safe(d.email), safe(d.topic), safe(d.message)]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('הסקריפט לא מחובר לגיליון. הדביקו את מזהה הגיליון ב-SPREADSHEET_ID.');
  return ss.getSheets()[0];
}

/* ========= פעולות מערכת הניהול ========= */
function handleAction_(d) {
  try {
    if (d.action === 'login') return json_(login_(d));
    const s = session_(d.token);
    switch (d.action) {
      case 'me': return json_({ ok: true, user: s.user.name, username: s.username, role: s.user.role });
      case 'logout': CacheService.getScriptCache().remove('t:' + d.token); return json_({ ok: true });
      case 'save': needRole_(s, ['admin', 'editor']); return json_(saveContent_(d.content, s));
      case 'upload': needRole_(s, ['admin', 'editor']); return json_(upload_(d));
      case 'changePassword': return json_(changePassword_(d, s));
      case 'users': needRole_(s, ['admin']); return json_({ ok: true, users: listUsers_() });
      case 'userCreate': needRole_(s, ['admin']); return json_(userCreate_(d));
      case 'userUpdate': needRole_(s, ['admin']); return json_(userUpdate_(d, s));
      case 'userDelete': needRole_(s, ['admin']); return json_(userDelete_(d, s));
      case 'versions': needRole_(s, ['admin']); return json_({ ok: true, versions: listVersions_() });
      case 'restore': needRole_(s, ['admin']); return json_(restore_(d, s));
      default: return json_({ ok: false, error: 'פעולה לא מוכרת' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---- משתמשים והתחברות ---- */
function hash_(pw, salt) {
  let h = salt + pw;
  for (let i = 0; i < 500; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt));
  }
  return h;
}
function loadUsers_() { const s = PropertiesService.getScriptProperties().getProperty('users'); return s ? JSON.parse(s) : null; }
function saveUsers_(u) { PropertiesService.getScriptProperties().setProperty('users', JSON.stringify(u)); }
function ensureUsers_() {
  let u = loadUsers_();
  if (!u) {
    const salt = Utilities.getUuid();
    u = {};
    u[ADMIN_USER.toLowerCase()] = { name: ADMIN_USER, salt: salt, hash: hash_(ADMIN_PASS, salt), role: 'admin', active: true, created: new Date().toISOString() };
    saveUsers_(u);
  }
  return u;
}
function login_(d) {
  const cache = CacheService.getScriptCache();
  const uname = String(d.username || '').trim().toLowerCase().slice(0, 40);
  const pw = String(d.password || '');
  const failKey = 'f:' + uname;
  if (Number(cache.get(failKey) || 0) >= 5) return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב בעוד 15 דקות.' };
  const users = ensureUsers_();
  const u = users[uname];
  const salt = u ? u.salt : 'x';
  const okPw = hash_(pw, salt) === (u ? u.hash : '-');
  if (!u || !okPw || !u.active) {
    cache.put(failKey, String(Number(cache.get(failKey) || 0) + 1), 900);
    return { ok: false, error: 'שם משתמש או סיסמה שגויים.' };
  }
  cache.remove(failKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('t:' + token, uname, SESSION_SECONDS);
  return { ok: true, token: token, user: u.name, username: uname, role: u.role };
}
function session_(token) {
  if (!token) throw new Error('auth');
  const uname = CacheService.getScriptCache().get('t:' + token);
  if (!uname) throw new Error('auth');
  const users = ensureUsers_();
  const u = users[uname];
  if (!u || !u.active) throw new Error('auth');
  return { username: uname, user: u };
}
function needRole_(s, roles) { if (roles.indexOf(s.user.role) < 0) throw new Error('אין לך הרשאה לפעולה זו.'); }
function activeAdmins_(users) { return Object.keys(users).filter(k => users[k].role === 'admin' && users[k].active); }
function listUsers_() {
  const u = ensureUsers_();
  return Object.keys(u).map(k => ({ username: k, name: u[k].name, role: u[k].role, active: u[k].active, created: u[k].created }));
}
function validPass_(p) { if (String(p || '').length < 8) throw new Error('הסיסמה צריכה להכיל לפחות 8 תווים.'); }
function userCreate_(d) {
  const name = String(d.username || '').trim();
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(name)) throw new Error('שם משתמש: 3–30 תווים באנגלית, ספרות או _ . -');
  validPass_(d.password);
  if (['admin', 'editor'].indexOf(d.role) < 0) throw new Error('תפקיד לא תקין.');
  const users = ensureUsers_();
  if (users[name.toLowerCase()]) throw new Error('שם המשתמש כבר קיים.');
  const salt = Utilities.getUuid();
  users[name.toLowerCase()] = { name: name, salt: salt, hash: hash_(d.password, salt), role: d.role, active: true, created: new Date().toISOString() };
  saveUsers_(users);
  return { ok: true };
}
function userUpdate_(d, s) {
  const users = ensureUsers_();
  const k = String(d.username || '').toLowerCase();
  const u = users[k];
  if (!u) throw new Error('המשתמש לא נמצא.');
  if (d.role !== undefined) {
    if (['admin', 'editor'].indexOf(d.role) < 0) throw new Error('תפקיד לא תקין.');
    if (u.role === 'admin' && d.role !== 'admin' && activeAdmins_(users).length <= 1) throw new Error('חייב להישאר לפחות מנהל פעיל אחד.');
    u.role = d.role;
  }
  if (d.active !== undefined) {
    if (!d.active && k === s.username) throw new Error('אי אפשר להשבית את המשתמש שלך.');
    if (!d.active && u.role === 'admin' && activeAdmins_(users).length <= 1) throw new Error('חייב להישאר לפחות מנהל פעיל אחד.');
    u.active = !!d.active;
  }
  if (d.password) { validPass_(d.password); u.salt = Utilities.getUuid(); u.hash = hash_(d.password, u.salt); }
  saveUsers_(users);
  return { ok: true };
}
function userDelete_(d, s) {
  const users = ensureUsers_();
  const k = String(d.username || '').toLowerCase();
  if (!users[k]) throw new Error('המשתמש לא נמצא.');
  if (k === s.username) throw new Error('אי אפשר למחוק את המשתמש שלך.');
  if (users[k].role === 'admin' && users[k].active && activeAdmins_(users).length <= 1) throw new Error('חייב להישאר לפחות מנהל פעיל אחד.');
  delete users[k];
  saveUsers_(users);
  return { ok: true };
}
function changePassword_(d, s) {
  const users = ensureUsers_();
  const u = users[s.username];
  if (hash_(String(d.oldPassword || ''), u.salt) !== u.hash) throw new Error('הסיסמה הנוכחית שגויה.');
  validPass_(d.newPassword);
  u.salt = Utilities.getUuid();
  u.hash = hash_(d.newPassword, u.salt);
  saveUsers_(users);
  return { ok: true };
}

/* ---- תוכן האתר ---- */
function folder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function contentFile_() {
  const it = DriveApp.getFilesByName(CONTENT_FILE);
  return it.hasNext() ? it.next() : null;
}
function readContentText_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('content');
  if (c) return c;
  const f = contentFile_();
  const text = f ? f.getBlob().getDataAsString('UTF-8') : '{"v":0}';
  try { if (text.length < 90000) cache.put('content', text, 300); } catch (err) {}
  return text;
}
function backupCurrent_(by) {
  const f = contentFile_();
  if (!f) return;
  const fol = folder_(BACKUP_FOLDER);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd_HH-mm-ss');
  fol.createFile('content_' + stamp + '_' + by + '.json', f.getBlob().getDataAsString('UTF-8'), 'application/json');
  const files = [];
  const it = fol.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  files.slice(MAX_BACKUPS).forEach(x => x.setTrashed(true));
}
function writeContent_(text) {
  let f = contentFile_();
  if (f) f.setContent(text); else f = DriveApp.createFile(CONTENT_FILE, text, 'application/json');
  CacheService.getScriptCache().remove('content');
}
function saveContent_(content, s) {
  if (!content || typeof content !== 'object') throw new Error('תוכן לא תקין.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    content.v = Date.now();
    content.by = s.user.name;
    const text = JSON.stringify(content);
    if (text.length > 900000) throw new Error('התוכן גדול מדי.');
    backupCurrent_(s.user.name);
    writeContent_(text);
    return { ok: true, v: content.v };
  } finally { lock.releaseLock(); }
}
function listVersions_() {
  const fol = folder_(BACKUP_FOLDER);
  const files = [];
  const it = fol.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  return files.map(f => ({ id: f.getId(), name: f.getName(), date: Utilities.formatDate(f.getDateCreated(), 'Asia/Jerusalem', 'dd.MM.yyyy HH:mm') }));
}
function restore_(d, s) {
  const f = DriveApp.getFileById(String(d.id));
  const parents = f.getParents();
  let ok = false;
  while (parents.hasNext()) if (parents.next().getName() === BACKUP_FOLDER) ok = true;
  if (!ok) throw new Error('קובץ לא תקין.');
  const text = f.getBlob().getDataAsString('UTF-8');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { backupCurrent_(s.user.name + '_before-restore'); writeContent_(text); } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ---- תמונות ---- */
function upload_(d) {
  const mime = String(d.mime || '');
  if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].indexOf(mime) < 0) throw new Error('סוג קובץ לא נתמך (PNG, JPG, WEBP, GIF).');
  const bytes = Utilities.base64Decode(String(d.data || ''));
  if (bytes.length > 8 * 1024 * 1024) throw new Error('התמונה גדולה מדי (מעל 8MB).');
  const ext = mime.split('/')[1].replace('jpeg', 'jpg');
  const name = 'img_' + Date.now() + '.' + ext;
  const file = folder_(IMAGE_FOLDER).createFile(Utilities.newBlob(bytes, mime, name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w1600' };
}

/* ========= עזר ========= */
function json_(obj, rawText) {
  return ContentService.createTextOutput(rawText !== undefined ? rawText : JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
