# Desmond's 12th Birthday RSVP

## 1. Make the Google Sheet (stores the RSVPs)
1. Create a new Google Sheet, name it "Desmond Party RSVPs".
2. Extensions > Apps Script. Delete the starter code, paste in `apps-script.gs`.
3. Change `HOST_KEY` to your own secret word. Save.
4. Deploy > New deployment > type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorize when asked, then copy the **Web app URL** (ends in `/exec`).

## 2. Put it on GitHub Pages
1. In `index.html`, paste that URL into `const SCRIPT_URL = '';`
2. Create a new repo named `desmond-party` under natesteele888 and upload `index.html` **and `hero.jpg`** (same folder).
3. Settings > Pages > Deploy from branch > `main` / root > Save.
4. Live in a minute or two at https://natesteele888.github.io/desmond-party/

## 3. Share it
- `rsvp-qr.png` already points to that URL (only works if the repo is named `desmond-party`).
- Your guest list: https://natesteele888.github.io/desmond-party/?host=YOUR_KEY
  (or just open the Google Sheet).

If you edit the Apps Script later: Deploy > Manage deployments > edit > Version: New version.
