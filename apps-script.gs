/**
 * Desmond's 12th Birthday - RSVP backend + reminder emails
 * ---------------------------------------------------------------
 * Paste this whole file into Extensions > Apps Script in your Google Sheet.
 *
 * Then just run setup() once (see README). It builds the sheet, turns on the
 * daily reminder check, and prints your host link in the log.
 */

// ============ THE ONLY THINGS YOU MIGHT WANT TO CHANGE ============

const PARTY_PASSWORD = 'GoBengals';                // front-door password on the invitation
const HOST_KEY   = 'bluenights12';                 // your secret word for the guest list
const HOST_EMAIL = '';                             // blank = the Google account running this script
const PARTY_ISO  = '2026-10-02T17:00:00-04:00';    // Fri Oct 2, 2026, 5:00 PM Eastern
const SITE_URL   = 'https://natesteele888.github.io/desmond-party/';
const NOTIFY_HOST_ON_RSVP = true;                  // email you every time someone RSVPs

// ==================================================================

const SHEET_NAME = 'RSVPs';
const TZ = 'America/New_York';
const HEADERS = ['Updated', 'Name', 'Attending', 'Pizza', 'Group size', 'Email', 'Phone', 'Notes'];

/**
 * RUN THIS ONCE. Creates the sheet, installs the daily reminder trigger,
 * and logs your host link. Safe to run again any time.
 */
function setup() {
  const sh = getSheet_();
  SpreadsheetApp.getActiveSpreadsheet().setSpreadsheetTimeZone(TZ);

  // Remove any old copies of the trigger, then install exactly one.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendReminders').timeBased().everyDays(1).atHour(9).create();

  const msg = [
    'Setup complete.',
    '',
    'Sheet tab:      ' + sh.getName(),
    'Reminders:      daily check at ~9am ' + TZ,
    '                -> 3 days before (' + fmt_(addDays_(partyDate_(), -3)) + ')',
    '                -> morning of    (' + fmt_(partyDate_()) + ')',
    'Alerts go to:   ' + hostEmail_(),
    'Party password: ' + (PARTY_PASSWORD || '(none - anyone can RSVP)'),
    '',
    'YOUR GUEST LIST LINK (bookmark this, do not share it):',
    SITE_URL + '?host=' + encodeURIComponent(HOST_KEY),
    '',
    'Next: Deploy > New deployment > Web app > Execute as Me,',
    'Who has access ANYONE. Copy the /exec URL into index.html.'
  ].join('\n');
  Logger.log(msg);
  return msg;
}

// ---------------------------------------------------------------- sheet

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  ensureHeaders_(sh);
  return sh;
}

/** Adds any missing columns without disturbing RSVPs already in the sheet. */
function ensureHeaders_(sh) {
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
  } else {
    const width = Math.max(sh.getLastColumn(), 1);
    const have = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
    HEADERS.forEach(function (h) {
      if (have.indexOf(h) === -1) {
        sh.insertColumnAfter(sh.getLastColumn());
        sh.getRange(1, sh.getLastColumn()).setValue(h);
        have.push(h);
      }
    });
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
}

/** Map of header name -> 1-based column number. Order-proof. */
function cols_(sh) {
  const row = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const map = {};
  row.forEach(function (h, i) { map[String(h).trim()] = i + 1; });
  return map;
}

function readRows_(sh) {
  if (sh.getLastRow() < 2) return [];
  const c = cols_(sh);
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  return values.map(function (v, i) {
    const get = function (name) { return c[name] ? v[c[name] - 1] : ''; };
    return {
      row: i + 2,
      name: String(get('Name') || '').trim(),
      attending: String(get('Attending')).trim().toLowerCase() === 'yes',
      pizza: String(get('Pizza') || ''),
      count: Number(get('Group size')) || 0,
      email: String(get('Email') || '').trim(),
      phone: String(get('Phone') || '').trim(),
      notes: String(get('Notes') || '')
    };
  }).filter(function (r) { return r.name; });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- write

/** Save or update an RSVP. Same name = update, so people can change their answer. */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'Busy, please try again' });
  }
  try {
    if (!e || !e.postData || !e.postData.contents) return json_({ ok: false, error: 'No data' });
    const d = JSON.parse(e.postData.contents);

    // Front door. Blank out PARTY_PASSWORD above to let anyone RSVP.
    if (PARTY_PASSWORD && tidyPass_(d.pass) !== tidyPass_(PARTY_PASSWORD)) {
      return json_({ ok: false, error: 'Wrong party password' });
    }

    const name = tidyName_(d.name);
    if (!name) return json_({ ok: false, error: 'Missing name' });

    const attending = d.attending === true || d.attending === 'true';
    const pizza = attending && (d.pizza === 'Cheese' || d.pizza === 'Pepperoni') ? d.pizza : '';
    const count = attending ? Math.min(10, Math.max(1, parseInt(d.count, 10) || 1)) : 0;
    const email = validEmail_(d.email) ? String(d.email).trim() : '';
    const phone = String(d.phone || '').trim().slice(0, 25);
    const notes = String(d.notes || '').trim().slice(0, 200);

    const sh = getSheet_();
    const c = cols_(sh);
    const rows = readRows_(sh);
    let target = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].name.toLowerCase() === name.toLowerCase()) { target = rows[i].row; break; }
    }
    const isNew = !target;
    if (isNew) target = sh.getLastRow() + 1;

    const put = function (header, value) {
      if (c[header]) sh.getRange(target, c[header]).setValue(value);
    };
    put('Updated', new Date());
    put('Name', name);
    put('Attending', attending ? 'Yes' : 'No');
    put('Pizza', pizza);
    put('Group size', count);
    put('Email', email);
    put('Phone', phone);
    put('Notes', notes);

    if (NOTIFY_HOST_ON_RSVP) notifyHost_(name, attending, count, pizza, notes, email, phone, isNew);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function notifyHost_(name, attending, count, pizza, notes, email, phone, isNew) {
  try {
    const t = totals_(readRows_(getSheet_()));
    MailApp.sendEmail({
      to: hostEmail_(),
      subject: (attending ? '✅ ' : '❌ ') + name + (attending ? ' is coming' : " can't make it")
               + ' - Desmond\'s party',
      htmlBody:
        '<div style="font-family:system-ui,sans-serif;font-size:16px;color:#14224F">' +
        '<p><b>' + esc_(name) + '</b> just ' + (isNew ? 'RSVP\'d' : 'updated their RSVP') + '.</p>' +
        '<ul>' +
        '<li>' + (attending ? 'Coming - ' + count + (count === 1 ? ' person' : ' people') : 'Not coming') + '</li>' +
        (pizza ? '<li>Pizza: ' + esc_(pizza) + '</li>' : '') +
        (email ? '<li>Email: ' + esc_(email) + '</li>' : '<li>No email - they will not get reminders</li>') +
        (phone ? '<li>Phone: ' + esc_(phone) + '</li>' : '') +
        (notes ? '<li>Notes: ' + esc_(notes) + '</li>' : '') +
        '</ul>' +
        '<p><b>Running total: ' + t.coming + ' coming</b> (' + t.cheese + ' cheese, ' + t.pepperoni + ' pepperoni)</p>' +
        '<p><a href="' + SITE_URL + '?host=' + encodeURIComponent(HOST_KEY) + '">Open the guest list</a></p>' +
        '</div>'
    });
  } catch (err) {
    // Never let a mail hiccup break someone's RSVP.
    Logger.log('Host notify failed: ' + err);
  }
}

// ---------------------------------------------------------------- read

/** Public: totals only. With ?host=HOST_KEY: the full guest list. */
function doGet(e) {
  const rows = readRows_(getSheet_());
  const t = totals_(rows);
  t.ok = true;
  t.daysUntil = daysUntilParty_();

  if (e && e.parameter && e.parameter.host === HOST_KEY) {
    t.rows = rows.map(function (r) {
      return { name: r.name, attending: r.attending, pizza: r.pizza, count: r.count,
               email: r.email, phone: r.phone, notes: r.notes };
    });
    t.reminders = {
      threeDay: !!props_().getProperty('sent_3day'),
      dayOf: !!props_().getProperty('sent_dayof'),
      withEmail: rows.filter(function (r) { return r.attending && r.email; }).length
    };
  }
  return json_(t);
}

function totals_(rows) {
  const t = { coming: 0, cheese: 0, pepperoni: 0, notComing: 0, families: 0 };
  rows.forEach(function (r) {
    if (r.attending) {
      t.coming += r.count;
      t.families++;
      if (r.pizza === 'Cheese') t.cheese += r.count;
      if (r.pizza === 'Pepperoni') t.pepperoni += r.count;
    } else {
      t.notComing++;
    }
  });
  return t;
}

// ---------------------------------------------------------------- reminders

function props_() { return PropertiesService.getScriptProperties(); }
function partyDate_() { return new Date(PARTY_ISO); }
function addDays_(d, n) { return new Date(d.getTime() + n * 86400000); }
function fmt_(d) { return Utilities.formatDate(d, TZ, 'EEE MMM d'); }

function daysUntilParty_() {
  const dayStart = function (d) {
    return new Date(Utilities.formatDate(d, TZ, 'yyyy/MM/dd') + ' 00:00:00');
  };
  return Math.round((dayStart(partyDate_()) - dayStart(new Date())) / 86400000);
}

/** Runs daily from the trigger installed by setup(). */
function sendReminders() {
  const days = daysUntilParty_();
  if (days === 3) sendReminderEmails_('3day');
  else if (days === 0) sendReminderEmails_('dayof');
  else Logger.log('No reminder today. Days until party: ' + days);
}

function sendReminderEmails_(kind) {
  const key = 'sent_' + kind;
  if (props_().getProperty(key)) { Logger.log(kind + ' reminder already sent.'); return; }

  const rows = readRows_(getSheet_()).filter(function (r) { return r.attending && r.email; });
  let sent = 0;
  rows.forEach(function (r) {
    try {
      const m = reminderMail_(kind, r);
      MailApp.sendEmail({ to: r.email, subject: m.subject, htmlBody: m.html, name: "Desmond's Birthday" });
      sent++;
    } catch (err) {
      Logger.log('Reminder to ' + r.email + ' failed: ' + err);
    }
  });

  props_().setProperty(key, new Date().toISOString());

  try {
    MailApp.sendEmail({
      to: hostEmail_(),
      subject: 'Reminder sent to ' + sent + ' guest' + (sent === 1 ? '' : 's') + " - Desmond's party",
      htmlBody: '<div style="font-family:system-ui,sans-serif">The <b>' +
        (kind === '3day' ? '3 days to go' : 'party day') + '</b> reminder went out to ' + sent +
        ' of ' + readRows_(getSheet_()).filter(function (r) { return r.attending; }).length +
        ' guests coming (only the ones who left an email address).<br><br>' +
        '<a href="' + SITE_URL + '?host=' + encodeURIComponent(HOST_KEY) + '">Open the guest list</a></div>'
    });
  } catch (err) { Logger.log('Host summary failed: ' + err); }

  Logger.log(kind + ' reminder sent to ' + sent + ' guests.');
}

function reminderMail_(kind, r) {
  const first = esc_(r.name.split(' ')[0]);
  const wrap = function (inner) {
    return '<div style="font-family:system-ui,-apple-system,sans-serif;font-size:17px;line-height:1.5;color:#14224F;max-width:520px">' +
      inner +
      '<p style="margin-top:22px;padding-top:16px;border-top:1px solid #C9D6F5;font-size:15px;color:#55638F">' +
      'Lunenburg High School, upper parking lot &middot; ' +
      '<a href="https://www.google.com/maps/search/?api=1&query=Lunenburg+High+School+Lunenburg+MA">Directions</a><br>' +
      'Need to change your answer? <a href="' + SITE_URL + '">Update your RSVP</a>' +
      '</p></div>';
  };
  const plan = '<ul style="padding-left:20px">' +
    '<li><b>5:00 PM</b> - meet at the upper high school parking lot</li>' +
    '<li>Tailgate: pizza, drinks &amp; cupcakes, then flag football</li>' +
    '<li><b>6:30 PM</b> - LHS football game. Go Blue Knights!</li></ul>';

  if (kind === '3day') {
    return {
      subject: "3 days to go - Desmond's 12th birthday this Friday",
      html: wrap(
        '<h2 style="color:#1D3FD1;margin:0 0 12px">Three days to go!</h2>' +
        '<p>Hi ' + first + ' - just a heads up that Desmond\'s birthday tailgate is <b>this Friday, ' +
        'October 2 at 5:00 PM</b>.</p>' + plan +
        '<p>We have you down for <b>' + r.count + (r.count === 1 ? ' person' : ' people') + '</b>' +
        (r.pizza ? ' and <b>' + esc_(r.pizza.toLowerCase()) + ' pizza</b>' : '') + '.</p>' +
        '<p>See you Friday!</p>')
    };
  }
  return {
    subject: "Today's the day - Desmond's birthday tailgate at 5 PM",
    html: wrap(
      '<h2 style="color:#1D3FD1;margin:0 0 12px">Today\'s the day!</h2>' +
      '<p>Hi ' + first + ' - we\'ll see you this afternoon at <b>5:00 PM</b> in the upper ' +
      'parking lot at Lunenburg High School.</p>' + plan +
      '<p>Dress for the weather, and bring your cheering voice.</p>')
  };
}

/** Sends both sample reminders to you only, so you can see what guests get. */
function sendTestReminder() {
  const sample = { name: 'Test Parent', count: 2, pizza: 'Cheese', email: hostEmail_() };
  ['3day', 'dayof'].forEach(function (kind) {
    const m = reminderMail_(kind, sample);
    MailApp.sendEmail({ to: hostEmail_(), subject: '[TEST] ' + m.subject, htmlBody: m.html });
  });
  const msg = 'Two sample reminders sent to ' + hostEmail_() + '. No guests were emailed.';
  Logger.log(msg);
  return msg;
}

/** Force a reminder out right now (also un-blocks it if it already ran). */
function sendThreeDayReminderNow() { props_().deleteProperty('sent_3day');  sendReminderEmails_('3day');  }
function sendDayOfReminderNow()    { props_().deleteProperty('sent_dayof'); sendReminderEmails_('dayof'); }

// ---------------------------------------------------------------- helpers

function hostEmail_() { return HOST_EMAIL || Session.getEffectiveUser().getEmail(); }

/** Trim, collapse spaces, and un-shout ALL-CAPS entries so greetings read normally. */
function tidyName_(raw) {
  let n = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (n && n === n.toUpperCase() && /[A-Z]/.test(n)) {
    n = n.toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }
  return n;
}
function tidyPass_(s) { return String(s || '').trim().toLowerCase(); }
function validEmail_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()); }
function esc_(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/** Quick self-check. Run this if something seems off. */
function healthCheck() {
  const sh = getSheet_();
  const rows = readRows_(sh);
  const out = [
    'Sheet rows:        ' + rows.length,
    'Coming (people):   ' + totals_(rows).coming,
    'With email:        ' + rows.filter(function (r) { return r.attending && r.email; }).length,
    'Days until party:  ' + daysUntilParty_(),
    'Party password:    ' + (PARTY_PASSWORD || '(none)'),
    'Alerts go to:      ' + hostEmail_(),
    'Emails left today: ' + MailApp.getRemainingDailyQuota(),
    'Reminder triggers: ' + ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === 'sendReminders';
    }).length + ' (should be 1)',
    '3-day sent:        ' + (props_().getProperty('sent_3day') || 'not yet'),
    'Day-of sent:       ' + (props_().getProperty('sent_dayof') || 'not yet'),
    'Host link:         ' + SITE_URL + '?host=' + encodeURIComponent(HOST_KEY)
  ].join('\n');
  Logger.log(out);
  return out;
}
