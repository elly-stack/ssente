# Ssente

A personal finance tracker for one person, in Uganda shillings. It's an installable,
offline web app (PWA) built with plain HTML, CSS and JavaScript: no build step, no backend,
no accounts, no tracking and no network calls. Your data stays on your phone.

## What it does

- **Home**: this month's left to spend, a budget bar that turns amber at 75% and red at 90%,
  a daily allowance for the rest of the month, income / spent / saved, your next school fee and
  any reserve warnings.
- **Add an expense in 3 taps**: tap **+**, type the amount, tap a category (that saves it).
  Notes and date are optional (date defaults to today). Tap any expense to edit or delete it.
- **Month**: month switcher, income entries, all expenses, spending-by-category bars and a
  12-month savings line (inline SVG, no library), each with a table view.
- **Goals**: targets, deposits, withdrawals, progress. "Semester 1 fees" comes pre-made with
  the January payment as its target (UGX 1,427,500), and it follows the semester plan if you
  edit the fees.
- **School**: six semesters of Cavendish BBA fees from January 2027. Each payment shows its
  month, amount, paid / unpaid, and whether your savings cover it. It also warns you if a
  month's fees would push your savings under your reserve.
  *All fee amounts are estimates. Confirm them with the university and tap Edit.*
- **More**: your numbers (income, expenses budget, reserve, other savings), theme
  (system / light / dark), categories, an optional loan check (reducing balance or flat rate)
  and backup.

### How the fee plan works

It starts from your savings now (all goals + "other savings"). Fees due in a month come out of
what you have at the start of that month, and your free money (income − expenses) is added at
each month end, because your salary arrives at month end. A fee is:
**Covered** (you stay above your reserve), **Breaks reserve** (you can pay it, but you dip under
the reserve), or **Not covered** (you're short).

## Backups: important

Data is saved in the browser (IndexedDB, mirrored to localStorage). If you clear browser data
or lose the phone, it's gone. Use **More → Export backup (JSON)** at least every two weeks.
The app shows "Last backed up" and reminds you after 14 days. Save the file to Google Drive or
email it to yourself. **Import backup** restores it, and **Export expenses (CSV)** opens in
Excel or Google Sheets.

## Run it locally

Any static web server works. On a Mac:

```bash
cd ssente
python3 -m http.server 8123
```

Open http://localhost:8123. (Opening `index.html` directly as a file works too, but then
there's no offline mode or install option, because service workers need http.)

## Tests

The money maths (left to spend, daily allowance, loan repayment, semester schedule, fee
projection, CSV) is in `js/money.js` and tested in `tests/money.test.js`. Run the tests any of these ways:

```bash
node tests/money.test.js
```

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc js/money.js tests/money.test.js
```

Or open http://localhost:8123/tests/ in a browser.

## Host it free on GitHub Pages

1. Create a new repository on GitHub (for example `ssente`). It can be public or private
   (private Pages needs a paid plan).
2. Push this folder:
   ```bash
   git remote add origin https://github.com/<your-username>/ssente.git
   ```
   ```bash
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   pick `main` and `/ (root)`, then **Save**.
4. After a minute, your app is at `https://<your-username>.github.io/ssente/`.

Your data is *not* uploaded anywhere. GitHub only serves the app files, and each phone keeps
its own data.

## Install it on your phone

**Android (Chrome):** open your GitHub Pages link → ⋮ menu → **Add to Home screen** (or
**Install app**). It then opens full-screen and works offline.

**iPhone (Safari):** open the link → Share button → **Add to Home Screen**.

Open it once while online so it can save itself for offline use. When you publish an update,
open the app online and it will pick up the new version.

## Credits

The storage layer and service worker are adapted from
[pippodima/expense-tracker-web](https://github.com/pippodima/expense-tracker-web) (MIT).
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Ssente itself is MIT licensed
([LICENSE](LICENSE)).
