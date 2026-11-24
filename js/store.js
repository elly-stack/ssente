/* Storage: one JSON state object, saved to IndexedDB and mirrored to localStorage.
   IndexedDB helpers and the "fall back + ask for persistent storage" pattern are
   adapted from pippodima/expense-tracker-web js/db.js (MIT, see THIRD_PARTY_NOTICES.md). */
'use strict';

const Store = (() => {
  const DB_NAME = 'ssente';
  const DB_STORE = 'kv';
  const LS_KEY = 'ssente:state';
  let idb = null;
  let state = null;
  let saveTimer = null;

  const CATEGORIES = [
    ['transport', 'Transport', '🛵'], ['food', 'Food', '🍲'], ['airtime', 'Airtime & data', '📱'],
    ['bills', 'Rent & bills', '🏠'], ['family', 'Family', '👪'], ['personal', 'Personal', '🧴'],
    ['school', 'School', '🎓'], ['other', 'Other', '📦']
  ].map(([id, name, icon]) => ({ id, name, icon }));

  function uid() {
    if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function defaults() {
    const semesters = Money.defaultSemesters(2027);
    const jan = Money.semesterPayments(semesters[0])[0];
    return {
      version: 1,
      settings: { income: 750000, expenses: 250000, reserve: 250000, otherSavings: 0, theme: 'system' },
      categories: CATEGORIES.map((c) => Object.assign({}, c)),
      expenses: [],
      incomes: [],
      goals: [{ id: 'goal-sem1', name: 'Semester 1 fees', target: jan.amount, linkTo: jan.key, entries: [] }],
      semesters,
      paid: {},                       // payment key -> ISO date paid
      loan: { amount: 0, rate: 24, months: 12, fee: 0, method: 'reducing' },
      meta: { installedAt: Money.todayISO(), lastBackup: null, backupSnoozeUntil: null }
    };
  }

  /** Fill in anything missing (older backups, partial imports). */
  function normalise(s) {
    const d = defaults();
    if (!s || typeof s !== 'object') return d;
    const out = Object.assign({}, d, s);
    out.settings = Object.assign({}, d.settings, s.settings);
    out.meta = Object.assign({}, d.meta, s.meta);
    out.loan = Object.assign({}, d.loan, s.loan);
    ['categories', 'expenses', 'incomes', 'goals', 'semesters'].forEach((k) => {
      if (!Array.isArray(out[k])) out[k] = d[k];
    });
    out.goals.forEach((g) => { if (!Array.isArray(g.entries)) g.entries = []; });
    if (!out.paid || typeof out.paid !== 'object') out.paid = {};
    return out;
  }

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in self)) return reject(new Error('no indexedDB'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb open failed'));
      req.onblocked = () => reject(new Error('idb blocked'));
    });
  }
  function idbGet(key) {
    return new Promise((resolve, reject) => {
      const req = idb.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbPut(key, value) {
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  function lsGet() {
    try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  async function init() {
    try { idb = await openIDB(); } catch (e) { console.warn('IndexedDB unavailable, using localStorage only', e); idb = null; }
    let fromIdb = null;
    if (idb) { try { fromIdb = await idbGet('state'); } catch (e) { fromIdb = null; } }
    const fromLs = lsGet();
    // Use whichever copy was saved last; either can be wiped on its own by the browser.
    const pick = [fromIdb, fromLs].filter(Boolean)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
    state = normalise(pick);
    if (!pick) await saveNow();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    return state;
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    state.savedAt = Date.now();
    const json = JSON.stringify(state);
    try { localStorage.setItem(LS_KEY, json); } catch (e) { console.warn('localStorage save failed', e); }
    if (idb) { try { await idbPut('state', JSON.parse(json)); } catch (e) { console.warn('IndexedDB save failed', e); } }
  }
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 150); }

  async function replace(newState) { state = normalise(newState); await saveNow(); return state; }

  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });

  return { init, save, saveNow, replace, uid, normalise, get state() { return state; } };
})();
