# Third-party notices

## pippodima/expense-tracker-web

Source: https://github.com/pippodima/expense-tracker-web (MIT)

Adapted parts:
- `js/store.js` — the IndexedDB open / read / write helpers and the
  "in-memory fallback + ask for persistent storage" pattern come from that
  project's `js/db.js`, cut down to a single key-value store.
- `sw.js` — the network-first service worker with `cache: 'reload'` (so GitHub
  Pages' HTTP cache can't serve a stale app) and the cache-fallback for offline
  use come from that project's `sw.js`.
- `js/money.js` — `monthRange`-style date helpers follow that project's
  `js/util.js`.

Licence text:

```
MIT License

Copyright (c) 2026 pippodima

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Feature references only (no code copied)

These repos were read for ideas. Their READMEs mention MIT, but neither has a
LICENSE file and GitHub detects no licence, so no code was taken from them.

- https://github.com/MahdiBarkhordar/Expense-Tracker — budget alerts, savings goals
- https://github.com/Sonu-H-N/Expense-Tracker — green/amber/red budget bar, CSV/JSON export
