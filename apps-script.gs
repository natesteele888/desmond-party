/**
 * Desmond's 12th Birthday – RSVP backend
 * Paste this into Extensions > Apps Script in a new Google Sheet.
 *
 * Change HOST_KEY to your own secret word. You'll open the guest list at:
 *   https://natesteele888.github.io/desmond-party/?host=YOUR_KEY
 */
const HOST_KEY = 'change-me';
const SHEET_NAME = 'RSVPs';
const HEADERS = ['Updated', 'Name', 'Attending', 'Pizza', 'Group size', 'Notes'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Save or update an RSVP (same name = update, so people can change their answer)
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    const name = String(d.name || '').trim().slice(0, 60);
    if (!name) return json_({ ok: false, error: 'Missing name' });

    const attending = d.attending === true;
    const pizza = attending && (d.pizza === 'Cheese' || d.pizza === 'Pepperoni') ? d.pizza : '';
    const count = attending ? Math.min(10, Math.max(1, parseInt(d.count, 10) || 1)) : 0;
    const notes = String(d.notes || '').trim().slice(0, 200);
    const row = [new Date(), name, attending ? 'Yes' : 'No', pizza, count, notes];

    const sh = getSheet_();
    const names = sh.getLastRow() > 1
      ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim().toLowerCase())
      : [];
    const idx = names.indexOf(name.toLowerCase());
    if (idx >= 0) sh.getRange(idx + 2, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Public: totals only. With ?host=HOST_KEY: full guest list.
function doGet(e) {
  const sh = getSheet_();
  const values = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues()
    : [];
  const rows = values.map(v => ({
    name: v[1],
    attending: v[2] === 'Yes',
    pizza: v[3],
    count: Number(v[4]) || 0,
    notes: v[5]
  }));

  const t = { ok: true, coming: 0, cheese: 0, pepperoni: 0, notComing: 0 };
  rows.forEach(r => {
    if (r.attending) {
      t.coming += r.count;
      if (r.pizza === 'Cheese') t.cheese += r.count;
      if (r.pizza === 'Pepperoni') t.pepperoni += r.count;
    } else {
      t.notComing++;
    }
  });

  if (e && e.parameter && e.parameter.host === HOST_KEY) t.rows = rows;
  return json_(t);
}
