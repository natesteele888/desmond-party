# Desmond's 12th Birthday — RSVP site

**Live:** https://natesteele888.github.io/desmond-party/
**Party:** Friday, Oct 2, 2026 · 5:00 PM · Lunenburg High School upper lot

The website is already built and deployed. The only thing left is connecting it to
your Google Sheet so RSVPs get saved and reminder emails go out.

---

## Why it wasn't working

The web app URL in `index.html` returns a Google sign-in page instead of data.
That means the Apps Script deployment's **Who has access** is set to something
other than **Anyone**. Guests hit Send and nothing was ever saved.

Step 4 below is the fix.

---

## Setup — about 5 minutes

### 1. Open the Apps Script
In your "Desmond Party RSVPs" Google Sheet: **Extensions → Apps Script**.

### 2. Paste the new code
Select everything in the editor, delete it, and paste all of `apps-script.gs`.
Click the 💾 save icon.

Optional, near the top of the file:
- `PARTY_PASSWORD` — the front-door password. Currently `GoBengals`.
- `HOST_KEY` — your secret word for the guest list. Currently `bluenights12`.
- `HOST_EMAIL` — leave blank and alerts go to whichever Google account you're signed in as.

### 3. Run `setup` once
In the toolbar, pick **setup** from the function dropdown and click **▶ Run**.

Google will ask for permission the first time:
> "Google hasn't verified this app" → **Advanced** → **Go to Desmond Party RSVPs (unsafe)** → **Allow**

That warning is normal — it's your own script, and "unsafe" just means Google
hasn't reviewed something you wrote yourself.

`setup` builds the sheet columns, turns on the daily reminder check, and prints
your guest-list link in the log at the bottom.

### 4. Deploy it — this is the step that was wrong
**Deploy → Manage deployments** (use *New deployment* only if there isn't one yet)

- Click the ✏️ pencil
- **Execute as:** Me
- **Who has access:** **Anyone** ← this is the part that has to change
- **Version:** New version
- **Deploy**

Copy the **Web app URL** (it ends in `/exec`).

### 5. Paste the URL into the site
In `index.html`, line 301:

```js
const SCRIPT_URL = 'https://script.google.com/macros/s/..../exec';
```

Replace it with the URL you just copied, then commit and push. GitHub Pages
updates in a minute or two.

> If you re-deployed the *existing* deployment as a new version, the URL doesn't
> change and you can skip this step entirely.

### 6. Check it
Open the live site. You should get the password screen — enter **GoBengals**,
then RSVP as "Test Test" and delete that row from the Sheet afterwards. You
should get an email as soon as the RSVP lands.

---

## The party password

The site asks for **GoBengals** before it shows the RSVP form or the game plan.
Capitals and stray spaces don't matter — `gobengals`, `GOBENGALS` and
`  GoBengals ` all work.

It's checked twice: once on the page, and again by the Apps Script when the RSVP
comes in, so nobody can skip the form and post straight to the web app URL.

Two ways to give it to people:

- Put it on the invitation and let them type it.
- Send a link that opens the door for them:
  `https://natesteele888.github.io/desmond-party/?p=GoBengals`
  The page strips the password out of the address bar once it's in.

Either way the browser remembers it, so guests only do this once per device.

**Worth knowing:** on a plain GitHub Pages site this is a doorbell, not a
deadbolt. The password isn't written in the page source — only a scrambled
(hashed) version is — but someone determined could still work around it. For
keeping strangers and randoms out of a 12-year-old's party, it's the right
amount of lock.

### Changing it later

1. In `apps-script.gs`, change `PARTY_PASSWORD`, then re-deploy a new version.
2. Generate the matching scrambled version — paste this in any browser console
   (F12 → Console), swapping in your new password:

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('desmond-2026:' +
  'yournewpassword'.toLowerCase().trim())).then(b =>
  console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))
```

3. Paste the result into `PASS_HASH` in `index.html`, then commit and push.

To drop the password entirely, set `PARTY_PASSWORD = ''` in the script and
delete the `PASS_HASH` line's value in `index.html`.

---

## Seeing who's coming

Three ways, all the same list:

Your host link skips the password screen entirely.

1. **Tap "Go Blue Knights!" three times** at the bottom of the site, enter your
   host key. After the first time, that device shows a small **Guest list** link
   in the footer — no typing needed again.
2. **Bookmark the direct link:**
   `https://natesteele888.github.io/desmond-party/?host=bluenights12`
3. Open the Google Sheet.

The guest list shows headcount, cheese vs. pepperoni, who can't make it, notes,
and everyone's email and phone. **Copy emails** grabs every address for a group
message; **Download CSV** saves the whole thing.

Guests never see this — the plain site only shows a running headcount, no names.

---

## Reminder emails

Fully automatic once `setup` has run. A daily check at ~9 AM Eastern sends:

| When | Goes out |
|---|---|
| Tue, Sep 29 | "Three days to go" |
| Fri, Oct 2 | "Today's the day" |

They only go to guests who said **yes** and left an email address. The guest list
tells you how many that is — anyone missing, text them.

Everyone who taps **Add to calendar** also gets phone alerts 3 days before and at
9 AM on the day, whether or not they left an email.

Each reminder sends once; the script remembers so a re-run can't spam anyone.

### Useful functions to run by hand

| Function | What it does |
|---|---|
| `sendTestReminder` | Emails both sample reminders to you only. Guests get nothing. |
| `healthCheck` | Headcount, how many have email, days to go, whether the trigger is installed. |
| `sendThreeDayReminderNow` | Sends the 3-day email immediately. |
| `sendDayOfReminderNow` | Sends the day-of email immediately. |

Gmail allows 100 emails a day on a personal account, which is far more than this
party needs.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The whole site — invite, RSVP form, host guest list |
| `apps-script.gs` | Goes in the Google Sheet: saves RSVPs, sends reminders |
| `hero.png` | Invite graphic |
| `rsvp-qr.png` | QR code pointing at the live site |
| `desmonds-birthday.ics` | Spare calendar file (the site generates its own) |

## If something breaks

**RSVPs aren't saving** — almost always step 4. In Manage deployments, confirm
**Who has access** is **Anyone**, and that `SCRIPT_URL` in `index.html` matches
the current `/exec` URL.

**No reminder emails** — run `healthCheck`. "Reminder triggers" should say 1. If
it says 0, run `setup` again.

**Host link says the key doesn't match** — `HOST_KEY` in the script and the
`?host=` value have to be identical, including capitals.

**"Wrong party password" when RSVPing** — `PARTY_PASSWORD` in the script and
`PASS_HASH` in `index.html` have drifted apart. Redo the two steps under
*Changing it later*.

After editing the Apps Script, always **Deploy → Manage deployments → ✏️ →
Version: New version**, or the live site keeps running the old code.
