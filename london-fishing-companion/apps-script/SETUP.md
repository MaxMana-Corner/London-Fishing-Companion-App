# Connecting the app to Google Sheets

About five minutes. No billing, no Google Cloud project, no server to run.

## 1. Create the script

1. Go to **script.google.com** → **New project**.
2. Delete the sample `myFunction` code and paste in all of **Code.gs**.
3. At the top, change this line to any private string of your own:

   ```js
   var TOKEN = 'change-me-to-something-private';
   ```

   Treat it like a password. You will paste the same string into the app.
4. Rename the project (top left) to something like `Fishing sync`. Save.

## 2. Deploy it as a web app

1. **Deploy** → **New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** Me (your account)
   - **Who has access:** Anyone
4. **Deploy**. Google will ask you to authorise it — this is the normal
   "unverified app" screen for your own scripts. Click **Advanced** →
   **Go to Fishing sync (unsafe)** → **Allow**. It is your own code and it
   only touches a spreadsheet it creates itself.
5. Copy the **Web app URL**. It ends in `/exec`.

## 3. Connect the app

1. Open the app → **Log** tab → **Connect Sheets** in the top right.
2. Paste the URL and your token.
3. Tap **Test the connection**. You should get a green confirmation and a link
   to your new spreadsheet, called *Creel — Data*.
4. Tap **Push to Sheets**.

Open the spreadsheet and you will find:

- **Trips** — one row per session with hours, conditions and a fish count
- **Catches** — one row per fish with species, size, spot, bait, hook and notes
- **_store** — hidden. Do not edit it; it holds the app's data.

Everything in Trips and Catches is rewritten from the app on each push, so
treat those tabs as read-only. Filter them, chart them, pivot them, share them.
Edits you make there will be replaced on the next sync.

## Using it on two devices

Install the app on your phone and your laptop, put the same URL and token into
both. Push from one, pull on the other. Records are matched by id and the newer
version wins, so nothing gets lost if you log fish on your phone while editing
notes on your laptop.

## After you change Code.gs

Redeploy: **Deploy** → **Manage deployments** → pencil icon →
**Version: New version** → **Deploy**. The URL stays the same.

## Things worth knowing

- **Anyone with the URL and the token can read your log.** That is the price of
  a setup with no login. Keep both private. For a fishing diary it is a fair
  trade; do not reuse this pattern for anything sensitive.
- **The app still works with no signal.** Sync is a convenience layered on top.
  Log fish all day at Komoka with no bars and it pushes when you get home.
- **Quotas are not a concern.** Personal use sits far under Apps Script's free
  limits.
- **Auto-sync** pushes a few seconds after you log something. Turn it off in the
  Sync screen if you would rather push by hand.

## Optional extras this unlocks

Once your data is in Sheets, ordinary Google tools apply:

- A **Google Form** for one-tap catch entry, feeding a separate sheet tab.
- **Sheets charts** — catch rate against water clarity, or fish per month.
- A **time-driven trigger** in Apps Script to email yourself a monthly summary.
- **Google Drive** for photos: upload a picture, use its shareable link as the
  photo URL on a catch or a species.
