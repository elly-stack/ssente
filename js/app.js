/* Ssente UI. Renders views from Store.state; all maths lives in money.js. */
'use strict';

(() => {
  const M = Money;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ugx = M.fmtUGX;
  const S = () => Store.state;
  const today = () => M.todayISO();
  let tab = 'home';
  let viewYM = M.ymOf(today());

  const cat = (id) => S().categories.find((c) => c.id === id) || { name: id, icon: '📦' };
  const totalSavings = () => M.sum(S().goals, M.goalBalance) + (S().settings.otherSavings || 0);
  const daysSince = (iso) => Math.floor((Date.parse(today()) - Date.parse(iso)) / 864e5);
  const fmtDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + M.ymLabel(y + '-' + String(m).padStart(2, '0')); };
  function save() { Store.save(); render(); }

  /* ---------- theme ---------- */
  function applyTheme() {
    const t = S().settings.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  /* ---------- amount inputs: live thousands separators ---------- */
  document.addEventListener('input', (e) => {
    if (!e.target.classList.contains('money')) return;
    const n = M.parseAmount(e.target.value);
    e.target.value = n ? M.fmtNum(n) : '';
  });
  const moneyInput = (name, value, extra) =>
    `<input class="money ${extra || ''}" name="${name}" inputmode="numeric" autocomplete="off" value="${value ? M.fmtNum(value) : ''}" placeholder="0">`;

  /* ---------- bottom sheet ---------- */
  const sheet = $('#sheet'), form = $('#sheetForm');
  let sheetHandler = null;
  function openSheet(html, onAction) {
    form.innerHTML = html;
    sheetHandler = onAction;
    sheet.showModal();
    const first = form.querySelector('[autofocus]');
    if (first) setTimeout(() => first.focus(), 50);
  }
  form.addEventListener('click', (e) => {
    const b = e.target.closest('button[value]');
    if (!b) return;
    e.preventDefault();
    if (b.value === 'cancel') return sheet.close();
    const data = Object.fromEntries(new FormData(form));
    if (sheetHandler && sheetHandler(b.value, data, b) !== false) sheet.close();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  /* ---------- expenses ---------- */
  function expenseSheet(exp) {
    const editing = !!exp;
    exp = exp || { amount: 0, categoryId: '', note: '', date: today() };
    openSheet(`<h2>${editing ? 'Edit expense' : 'Add expense'}</h2>
      ${moneyInput('amount', exp.amount, 'amount" autofocus="')}
      <p class="muted" style="text-align:center;margin:6px 0">${editing ? 'Pick a category, then Save' : 'Tap a category to save'}</p>
      <div class="chips">${S().categories.map((c) => `<button class="chip ${c.id === exp.categoryId ? 'on' : ''}" value="cat:${esc(c.id)}"><span>${esc(c.icon)}</span>${esc(c.name)}</button>`).join('')}</div>
      <div class="grid2"><div><label>Note (optional)</label><input name="note" value="${esc(exp.note)}" maxlength="80"></div>
      <div><label>Date</label><input type="date" name="date" value="${esc(exp.date)}" max="${today()}"></div></div>
      <div class="sheet-actions">${editing ? '<button class="btn-danger" value="delete">Delete</button><button value="cancel">Cancel</button><button class="btn-primary" value="save">Save</button>' : '<button value="cancel">Cancel</button>'}</div>`,
    (act, d, btn) => {
      if (act === 'delete') {
        if (!confirm('Delete this expense?')) return false;
        S().expenses = S().expenses.filter((x) => x.id !== exp.id); save(); return;
      }
      if (act.startsWith('cat:')) {
        form.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === btn));
        exp.categoryId = act.slice(4);
        if (editing) return false;
      }
      const amount = M.parseAmount(d.amount);
      if (!amount) { alert('Enter an amount first.'); return false; }
      if (!exp.categoryId) { alert('Pick a category.'); return false; }
      Object.assign(exp, { amount, note: d.note.trim(), date: d.date || today() });
      if (!editing) { exp.id = Store.uid(); S().expenses.push(exp); }
      save();
    });
  }

  function incomeSheet(inc) {
    const editing = !!inc;
    inc = inc || { amount: S().settings.income, source: 'Salary', date: today() };
    openSheet(`<h2>${editing ? 'Edit income' : 'Add income'}</h2>
      <label>Amount (UGX)</label>${moneyInput('amount', inc.amount, 'amount')}
      <div class="grid2"><div><label>Source</label><input name="source" value="${esc(inc.source)}" maxlength="40"></div>
      <div><label>Date</label><input type="date" name="date" value="${esc(inc.date)}"></div></div>
      <div class="sheet-actions">${editing ? '<button class="btn-danger" value="delete">Delete</button>' : ''}<button value="cancel">Cancel</button><button class="btn-primary" value="save">Save</button></div>`,
    (act, d) => {
      if (act === 'delete') { if (!confirm('Delete this income?')) return false; S().incomes = S().incomes.filter((x) => x.id !== inc.id); return save(); }
      const amount = M.parseAmount(d.amount);
      if (!amount) { alert('Enter an amount.'); return false; }
      Object.assign(inc, { amount, source: d.source.trim() || 'Income', date: d.date || today() });
      if (!editing) { inc.id = Store.uid(); S().incomes.push(inc); }
      save();
    });
  }

  const expenseRow = (e) => `<li data-act="editExpense" data-id="${e.id}"><span style="font-size:22px">${esc(cat(e.categoryId).icon)}</span>
    <div class="grow"><div>${esc(e.note || cat(e.categoryId).name)}</div><small class="muted">${esc(cat(e.categoryId).name)} · ${fmtDate(e.date)}</small></div>
    <span class="amt">${ugx(e.amount)}</span></li>`;

  /* ---------- plan helpers ---------- */
  function plan() {
    const payments = M.allPayments(S().semesters, S().paid);
    const st = S().settings;
    const proj = M.projectPlan({ startYM: M.ymOf(today()), startBalance: totalSavings(),
      monthlyFree: st.income - st.expenses, reserve: st.reserve, payments });
    return { payments, proj };
  }
  const STATUS = { paid: ['Paid', 't-paid'], ok: ['Covered', 't-ok'], reserve: ['Breaks reserve', 't-reserve'], short: ['Not covered', 't-short'] };
  const statusTag = (s) => `<span class="tag ${STATUS[s][1]}">${STATUS[s][0]}</span>`;

  function syncGoalTargets() {
    const byKey = {};
    S().semesters.forEach((s) => M.semesterPayments(s).forEach((p) => { byKey[p.key] = p; }));
    S().goals.forEach((g) => { if (g.linkTo && byKey[g.linkTo]) g.target = byKey[g.linkTo].amount; });
  }

  /* ---------- backup ---------- */
  function backupDue() {
    const m = S().meta;
    const hasData = S().expenses.length || S().incomes.length || S().goals.some((g) => g.entries.length);
    if (!hasData) return false;
    if (m.backupSnoozeUntil && today() < m.backupSnoozeUntil) return false;
    return daysSince(m.lastBackup || m.installedAt) >= 14;
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportJSON() {
    S().meta.lastBackup = today(); S().meta.backupSnoozeUntil = null;
    download('ssente-backup-' + today() + '.json', JSON.stringify(S(), null, 2), 'application/json');
    save();
  }
  function importJSON(file) {
    const r = new FileReader();
    r.onload = async () => {
      let data;
      try { data = JSON.parse(r.result); } catch (e) { return alert('That file is not a valid backup.'); }
      if (!data || !Array.isArray(data.expenses) || !data.settings) return alert('That file is not a Ssente backup.');
      if (!confirm(`Replace everything on this phone with the backup (${data.expenses.length} expenses)? This cannot be undone.`)) return;
      await Store.replace(data); applyTheme(); render(); alert('Backup restored.');
    };
    r.readAsText(file);
  }

  /* ---------- views ---------- */
  function viewHome() {
    const ym = M.ymOf(today());
    const s = M.monthSummary(S(), ym, today());
    const { payments, proj } = plan();
    const next = payments.find((p) => !p.paid);
    const nextSt = next && proj.status[next.key];
    const warnMonths = proj.months.filter((m) => m.breaksReserve);
    const recent = S().expenses.slice().sort((a, b) => (b.date + b.id > a.date + a.id ? 1 : -1)).slice(0, 5);
    const pct = Math.min(100, Math.round(s.pct * 100));
    const msg = { ok: 'On track', warn: 'Watch your spending', danger: 'Almost at your limit', over: 'Over budget' }[s.level];
    const first = (S().settings.name || '').trim().split(/\s+/)[0];
    return `<p class="hello">Welcome${first ? ', <b>' + esc(first) + '!</b>' : '!'} here's your <b>money snapshot for today</b></p>
      <p class="muted" style="margin:0 0 6px">Today is ${fmtDate(today())}</p>
      ${backupDue() ? `<div class="banner"><b>Time to back up.</b> Last backup: ${S().meta.lastBackup ? fmtDate(S().meta.lastBackup) : 'never'}.
        <div class="row" style="margin-top:8px"><button class="btn-primary" data-act="exportJSON">Back up now</button><button data-act="snooze">Later</button></div></div>` : ''}
      <div class="card"><div class="row"><div class="grow"><small class="muted">Left to spend in ${M.ymLabel(ym, true)}</small>
        <div class="big ${s.leftToSpend < 0 ? 't-bad' : ''}">${ugx(s.leftToSpend)}</div></div>
        <div style="text-align:right"><small class="muted">Per day, ${s.daysLeft} days left</small><div class="amt">${ugx(s.dailyAllowance)}</div></div></div>
        <div class="bar ${s.level}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        <small class="muted">${ugx(s.spent)} of ${ugx(s.budget)} budget · <b class="${{ ok: 't-ok', warn: 't-warn', danger: 't-bad', over: 't-bad' }[s.level]}">${msg}</b></small></div>
      <div class="grid2">
        <div class="stat"><small>Income this month</small><b>${ugx(s.income)}</b>${s.income ? '' : `<small>Expected ${ugx(S().settings.income)}</small>`}</div>
        <div class="stat"><small>Spent</small><b>${ugx(s.spent)}</b></div>
        <div class="stat"><small>Saved this month</small><b>${ugx(s.saved)}</b></div>
        <div class="stat"><small>Total savings</small><b>${ugx(totalSavings())}</b><small>Reserve ${ugx(S().settings.reserve)}</small></div>
      </div>
      ${next ? `<div class="card" data-act="tab" data-tab="school"><small class="muted">Next school fee · ${M.ymLabel(next.due, true)}</small>
        <div class="row"><div class="grow amt">${ugx(next.amount)}</div>${statusTag(nextSt.status)}</div>
        <small class="muted">${esc(next.semName)} — ${esc(next.label)}</small>
        ${warnMonths.length ? `<div class="banner bad" style="margin-bottom:0">${warnMonths.length} upcoming fee month${warnMonths.length > 1 ? 's' : ''} would break your reserve. Tap to see.</div>` : ''}</div>` : ''}
      <h2>Recent</h2><div class="card" style="padding:0 10px">${recent.length ? `<ul class="list">${recent.map(expenseRow).join('')}</ul>` : '<p class="muted">No expenses yet. Tap + to add one.</p>'}</div>`;
  }

  function viewMonth() {
    const ym = viewYM;
    const s = M.monthSummary(S(), ym, today());
    const exps = S().expenses.filter((e) => M.ymOf(e.date) === ym).sort((a, b) => (b.date > a.date ? 1 : -1));
    const incs = S().incomes.filter((e) => M.ymOf(e.date) === ym).sort((a, b) => (b.date > a.date ? 1 : -1));
    const totals = M.categoryTotals(S().expenses, ym);
    const series = M.savingsSeries(S().goals, M.addMonths(ym, -11), ym);
    return `<div class="grid2"><div class="stat"><small>Income</small><b>${ugx(s.income)}</b></div><div class="stat"><small>Spent</small><b>${ugx(s.spent)}</b></div>
        <div class="stat"><small>Left in budget</small><b class="${s.leftToSpend < 0 ? 't-bad' : ''}">${ugx(s.leftToSpend)}</b></div><div class="stat"><small>Saved</small><b>${ugx(s.saved)}</b></div></div>
      <h2>Spending by category</h2><div class="card chart" id="catChart"></div>
      ${totals.length ? `<details class="card"><summary>Category table</summary><table><tr><th>Category</th><th class="r">UGX</th><th class="r">Share</th></tr>${totals.map((t) => `<tr><td>${esc(cat(t.categoryId).name)}</td><td class="r">${M.fmtNum(t.total)}</td><td class="r">${Math.round(t.total / s.spent * 100)}%</td></tr>`).join('')}</table></details>` : ''}
      <h2>Savings, month by month</h2><div class="card chart" id="saveChart"></div>
      <details class="card"><summary>Savings table</summary><table><tr><th>Month</th><th class="r">Balance (UGX)</th></tr>${series.map((p) => `<tr><td>${M.ymLabel(p.ym)}</td><td class="r">${M.fmtNum(p.balance)}</td></tr>`).join('')}</table></details>
      <div class="row" style="justify-content:space-between"><h2>Income</h2><button class="link" data-act="addIncome">+ Add income</button></div>
      <div class="card" style="padding:0 10px">${incs.length ? `<ul class="list">${incs.map((i) => `<li data-act="editIncome" data-id="${i.id}"><span style="font-size:22px">💰</span><div class="grow"><div>${esc(i.source)}</div><small class="muted">${fmtDate(i.date)}</small></div><span class="amt in">+${ugx(i.amount)}</span></li>`).join('')}</ul>` : '<p class="muted">No income logged for this month.</p>'}</div>
      <h2>Expenses (${exps.length})</h2><div class="card" style="padding:0 10px">${exps.length ? `<ul class="list">${exps.map(expenseRow).join('')}</ul>` : '<p class="muted">No expenses this month.</p>'}</div>`;
  }
  function afterMonth() {
    const totals = M.categoryTotals(S().expenses, viewYM);
    Charts.bars($('#catChart'), totals.map((t) => ({ label: cat(t.categoryId).name, value: t.total })));
    Charts.line($('#saveChart'), M.savingsSeries(S().goals, M.addMonths(viewYM, -11), viewYM).map((p) => ({ label: M.ymLabel(p.ym), value: p.balance })));
  }

  function viewGoals() {
    return `<p class="muted">Total saved across goals: <b>${ugx(M.sum(S().goals, M.goalBalance))}</b></p>
      ${S().goals.map((g) => { const bal = M.goalBalance(g); const pct = g.target ? Math.min(100, Math.round(bal / g.target * 100)) : 0;
        return `<div class="card"><div class="row"><b class="grow">${esc(g.name)}</b><button class="link" data-act="editGoal" data-id="${g.id}">Edit</button></div>
          <div class="big">${ugx(bal)}</div><div class="bar"><i style="width:${pct}%"></i></div>
          <small class="muted">${pct}% of ${ugx(g.target)}${bal < g.target ? ' · ' + ugx(g.target - bal) + ' to go' : ' · reached 🎉'}${g.linkTo ? ' · target follows the semester plan' : ''}</small>
          <div class="row" style="margin-top:10px"><button class="btn-primary grow" data-act="goalMove" data-id="${g.id}" data-dir="1">Deposit</button><button class="grow" data-act="goalMove" data-id="${g.id}" data-dir="-1">Withdraw</button></div>
          ${g.entries.length ? `<details><summary>History (${g.entries.length})</summary><ul class="list">${g.entries.slice().reverse().map((en) => `<li><div class="grow"><div>${esc(en.note || (en.amount > 0 ? 'Deposit' : 'Withdrawal'))}</div><small class="muted">${fmtDate(en.date)}</small></div><span class="amt ${en.amount > 0 ? 'in' : ''}">${en.amount > 0 ? '+' : ''}${ugx(en.amount)}</span><button class="icon-btn" style="font-size:16px" data-act="delEntry" data-id="${g.id}" data-entry="${en.id}" aria-label="Delete entry">✕</button></li>`).join('')}</ul></details>` : ''}</div>`; }).join('')}
      <button class="btn-primary" style="width:100%" data-act="addGoal">+ New goal</button>`;
  }
  function goalMoveSheet(g, dir) {
    openSheet(`<h2>${dir > 0 ? 'Deposit to' : 'Withdraw from'} ${esc(g.name)}</h2>${moneyInput('amount', 0, 'amount" autofocus="')}
      <div class="grid2"><div><label>Note (optional)</label><input name="note" maxlength="60"></div><div><label>Date</label><input type="date" name="date" value="${today()}"></div></div>
      <div class="sheet-actions"><button value="cancel">Cancel</button><button class="btn-primary" value="save">${dir > 0 ? 'Deposit' : 'Withdraw'}</button></div>`,
    (act, d) => {
      const amount = M.parseAmount(d.amount);
      if (!amount) { alert('Enter an amount.'); return false; }
      if (dir < 0 && amount > M.goalBalance(g)) { alert('That is more than this goal holds.'); return false; }
      g.entries.push({ id: Store.uid(), amount: amount * dir, note: d.note.trim(), date: d.date || today() });
      save();
    });
  }
  function goalSheet(g) {
    const editing = !!g;
    g = g || { name: '', target: 0, entries: [] };
    openSheet(`<h2>${editing ? 'Edit goal' : 'New goal'}</h2><label>Name</label><input name="name" value="${esc(g.name)}" maxlength="40" autofocus>
      <label>Target (UGX)</label>${moneyInput('target', g.target)}${g.linkTo ? '<small class="muted">Changing the target here stops it following the semester plan.</small>' : ''}
      <div class="sheet-actions">${editing ? '<button class="btn-danger" value="delete">Delete</button>' : ''}<button value="cancel">Cancel</button><button class="btn-primary" value="save">Save</button></div>`,
    (act, d) => {
      if (act === 'delete') { if (!confirm(`Delete "${g.name}" and its history?`)) return false; S().goals = S().goals.filter((x) => x !== g); return save(); }
      if (!d.name.trim()) { alert('Give the goal a name.'); return false; }
      const target = M.parseAmount(d.target);
      if (g.linkTo && target !== g.target) delete g.linkTo;
      Object.assign(g, { name: d.name.trim(), target });
      if (!editing) { g.id = Store.uid(); S().goals.push(g); }
      save();
    });
  }

  function viewSchool() {
    const { payments, proj } = plan();
    const st = S().settings;
    const warn = proj.months.filter((m) => m.breaksReserve);
    const unpaid = payments.filter((p) => !p.paid);
    return `<div class="card"><small class="muted">Planning from savings of ${ugx(totalSavings())} plus ${ugx(st.income - st.expenses)} free money each month end, keeping a ${ugx(st.reserve)} reserve.</small>
        <div class="grid2" style="margin-top:8px"><div><small class="muted">Still to pay</small><div class="amt">${ugx(M.sum(unpaid, (p) => p.amount))}</div></div><div><small class="muted">Paid so far</small><div class="amt">${ugx(M.sum(payments.filter((p) => p.paid), (p) => p.amount))}</div></div></div></div>
      ${warn.map((m) => `<div class="banner ${m.covered ? '' : 'bad'}"><b>${M.ymLabel(m.ym, true)}:</b> fees of ${ugx(m.fees)} ${m.covered ? `leave ${ugx(m.after)}, which is ${ugx(m.reserveGap)} under your reserve` : `are ${ugx(m.shortfall)} more than you'll have`}.</div>`).join('')}
      <p class="muted">Fee amounts are estimates. Confirm them with Cavendish University and tap Edit to update.</p>
      ${S().semesters.map((sem) => { const ps = payments.filter((p) => p.semId === sem.id);
        return `<div class="card"><div class="row"><b class="grow">${esc(sem.name)}</b><button class="link" data-act="editSem" data-id="${sem.id}">Edit</button></div>
          <ul class="list">${ps.map((p) => { const s = proj.status[p.key] || { status: 'ok' };
            return `<li><div class="grow"><div><b>${M.ymLabel(p.due)}</b> · <span class="amt">${ugx(p.amount)}</span></div><small class="muted">${esc(p.label)}</small><div>${statusTag(s.status)}</div></div>
              <button data-act="togglePaid" data-key="${p.key}" aria-pressed="${p.paid}">${p.paid ? '✓ Paid' : 'Mark paid'}</button></li>`; }).join('')}</ul></div>`; }).join('')}`;
  }
  function semSheet(sem) {
    openSheet(`<h2>Edit ${esc(sem.name)}</h2><label>Name</label><input name="name" value="${esc(sem.name)}">
      <div class="grid2"><div><label>Tuition</label>${moneyInput('tuition', sem.tuition)}</div><div><label>Annual fees</label>${moneyInput('annualFees', sem.annualFees)}</div>
      <div><label>Registration</label>${moneyInput('registration', sem.registration)}</div><div><label>Deposit % of tuition</label><input name="depositPct" type="number" min="0" max="100" value="${sem.depositPct}"></div>
      <div><label>Deposit month</label><input type="month" name="depositMonth" value="${sem.depositMonth}"></div><div></div>
      <div><label>Balance from</label><input type="month" name="balanceFrom" value="${sem.balanceFrom}"></div><div><label>Balance until</label><input type="month" name="balanceTo" value="${sem.balanceTo}"></div></div>
      <div class="sheet-actions"><button value="cancel">Cancel</button><button class="btn-primary" value="save">Save</button></div>`,
    (act, d) => {
      if (!d.depositMonth) { alert('Pick a deposit month.'); return false; }
      Object.assign(sem, { name: d.name.trim() || sem.name, tuition: M.parseAmount(d.tuition), annualFees: M.parseAmount(d.annualFees),
        registration: M.parseAmount(d.registration), depositPct: Math.min(100, Math.max(0, Number(d.depositPct) || 0)),
        depositMonth: d.depositMonth, balanceFrom: d.balanceFrom || M.addMonths(d.depositMonth, 1), balanceTo: d.balanceTo || d.balanceFrom });
      syncGoalTargets(); save();
    });
  }

  function viewMore() {
    const st = S().settings, ln = S().loan, l = M.loanSummary(ln, st.income);
    const share = Math.round(l.shareOfIncome * 1000) / 10;
    return `<div class="card row" style="gap:14px">${avatarHTML('xl')}<div class="grow"><b style="font-size:18px">${esc(st.name || 'Add your name')}</b>
        <div class="row" style="margin-top:6px"><button class="link" data-act="pickPhoto">${st.photo ? 'Change photo' : 'Add photo'}</button>${st.photo ? '<button class="link btn-danger" data-act="removePhoto">Remove</button>' : ''}</div>
        <small class="muted">Your photo stays on this phone (and in your backups).</small></div><input type="file" id="photoFile" accept="image/*" hidden></div>
      <h2>My numbers</h2><form class="card" id="settingsForm">
        <label>Your name</label><input name="name" value="${esc(st.name || '')}" maxlength="40" autocomplete="name">
        <label>Monthly income (net, paid at month end)</label>${moneyInput('income', st.income)}
        <label>Monthly expenses budget</label>${moneyInput('expenses', st.expenses)}
        <label>Reserve to protect</label>${moneyInput('reserve', st.reserve)}
        <label>Other savings not in a goal (counted for the fee plan)</label>${moneyInput('otherSavings', st.otherSavings)}
        <label>Theme</label><select name="theme">${['system', 'light', 'dark'].map((t) => `<option ${st.theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <p class="muted">Free money each month: <b>${ugx(st.income - st.expenses)}</b></p>
        <button class="btn-primary" data-act="saveSettings" style="width:100%">Save numbers</button></form>
      <h2>Backup</h2><div class="card"><p style="margin-top:0">Last backed up: <b>${S().meta.lastBackup ? fmtDate(S().meta.lastBackup) : 'never'}</b><br><small class="muted">Your data lives only on this phone. Back up every 2 weeks and keep the file somewhere safe (Google Drive, email to yourself).</small></p>
        <div class="row"><button class="btn-primary grow" data-act="exportJSON">Export backup (JSON)</button><button class="grow" data-act="importJSON">Import backup</button></div>
        <div class="row" style="margin-top:8px"><button class="grow" data-act="exportCSV">Export expenses (CSV)</button></div>
        <input type="file" id="importFile" accept="application/json,.json" hidden></div>
      <h2>Categories</h2><div class="card"><div class="chips">${S().categories.map((c) => `<button class="chip" data-act="editCat" data-id="${esc(c.id)}"><span>${esc(c.icon)}</span>${esc(c.name)}</button>`).join('')}<button class="chip" data-act="addCat"><span>＋</span>Add</button></div></div>
      <h2>Loan check (optional)</h2><form class="card" id="loanForm">
        <div class="grid2"><div><label>Loan amount</label>${moneyInput('amount', ln.amount)}</div><div><label>Yearly rate %</label><input name="rate" type="number" step="0.1" min="0" value="${ln.rate}"></div>
        <div><label>Months</label><input name="months" type="number" min="1" value="${ln.months}"></div><div><label>Set-up fee</label>${moneyInput('fee', ln.fee)}</div></div>
        <label>Interest method</label><select name="method"><option value="reducing" ${ln.method !== 'flat' ? 'selected' : ''}>Reducing balance (banks)</option><option value="flat" ${ln.method === 'flat' ? 'selected' : ''}>Flat rate (many SACCOs / lenders)</option></select>
        <button data-act="calcLoan" style="width:100%;margin-top:12px">Calculate</button>
        ${ln.amount ? `<table style="margin-top:10px"><tr><td>Monthly repayment</td><td class="r"><b>${ugx(l.monthly)}</b></td></tr><tr><td>Total repaid</td><td class="r">${ugx(l.totalRepaid)}</td></tr>
          <tr><td>Interest</td><td class="r">${ugx(l.interest)}</td></tr><tr><td>Set-up fee</td><td class="r">${ugx(l.fee)}</td></tr><tr><td><b>Total cost of borrowing</b></td><td class="r"><b>${ugx(l.totalCost)}</b></td></tr>
          <tr><td>Share of your income</td><td class="r"><b class="${share > 30 ? 't-bad' : share > 20 ? 't-warn' : 't-ok'}">${share}%</b></td></tr></table>
          <small class="muted">${share > (st.income - st.expenses) / st.income * 100 ? 'This repayment is more than your free money each month.' : `Leaves ${ugx(st.income - st.expenses - l.monthly)} free each month.`}</small>` : ''}</form>
      <p class="muted" style="text-align:center">Ssente · no accounts, no tracking. <a href="https://github.com/pippodima/expense-tracker-web" style="color:inherit">Credits</a></p>`;
  }
  function catSheet(c) {
    const editing = !!c;
    c = c || { name: '', icon: '🏷️' };
    const used = editing && S().expenses.some((e) => e.categoryId === c.id);
    openSheet(`<h2>${editing ? 'Edit category' : 'New category'}</h2><div class="grid2"><div><label>Emoji</label><input name="icon" value="${esc(c.icon)}" maxlength="4"></div><div><label>Name</label><input name="name" value="${esc(c.name)}" maxlength="24" autofocus></div></div>
      <div class="sheet-actions">${editing && !used ? '<button class="btn-danger" value="delete">Delete</button>' : ''}<button value="cancel">Cancel</button><button class="btn-primary" value="save">Save</button></div>`,
    (act, d) => {
      if (act === 'delete') { S().categories = S().categories.filter((x) => x !== c); return save(); }
      if (!d.name.trim()) { alert('Give it a name.'); return false; }
      Object.assign(c, { name: d.name.trim(), icon: d.icon.trim() || '🏷️' });
      if (!editing) { c.id = 'c-' + Store.uid().slice(0, 8); S().categories.push(c); }
      save();
    });
  }

  /* ---------- profile photo (kept on device, shrunk to 256px) ---------- */
  function avatarHTML(size) {
    const st = S().settings;
    const initials = (st.name || '').trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase() || '🙂';
    const inner = st.photo ? `<img src="${st.photo}" alt="">` : esc(initials);
    return size ? `<button class="avatar ${size}" data-act="pickPhoto" aria-label="Change photo">${inner}</button>` : inner;
  }
  function setPhoto(file) {
    const img = new Image();
    img.onload = () => {
      const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, n, n);
      S().settings.photo = c.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(img.src); save();
    };
    img.onerror = () => alert('Could not read that image.');
    img.src = URL.createObjectURL(file);
  }

  /* ---------- render + events ---------- */
  const VIEWS = { home: [viewHome, 'Ssente'], month: [viewMonth, 'Month'], goals: [viewGoals, 'Savings goals'], school: [viewSchool, 'Semester plan'], more: [viewMore, 'More'] };
  function render() {
    const [fn, title] = VIEWS[tab];
    $('#title').textContent = title;
    $('#avatar').innerHTML = avatarHTML();
    $('#monthSwitch').hidden = tab !== 'month';
    $('#monthLabel').textContent = M.ymLabel(viewYM, true);
    $('#fab').hidden = !(tab === 'home' || tab === 'month');
    $('#view').innerHTML = fn();
    if (tab === 'month') afterMonth();
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]:not([data-act]), [data-act]');
    if (!t || sheet.contains(t)) return;
    const act = t.dataset.act, id = t.dataset.id;
    if (!act) { tab = t.dataset.tab; window.scrollTo(0, 0); return render(); }
    const goal = () => S().goals.find((g) => g.id === id);
    switch (act) {
      case 'tab': tab = t.dataset.tab; window.scrollTo(0, 0); render(); break;
      case 'prevMonth': viewYM = M.addMonths(viewYM, -1); render(); break;
      case 'nextMonth': viewYM = M.addMonths(viewYM, 1); render(); break;
      case 'addExpense': expenseSheet(); break;
      case 'editExpense': expenseSheet(S().expenses.find((x) => x.id === id)); break;
      case 'addIncome': incomeSheet(); break;
      case 'editIncome': incomeSheet(S().incomes.find((x) => x.id === id)); break;
      case 'addGoal': goalSheet(); break;
      case 'editGoal': goalSheet(goal()); break;
      case 'goalMove': goalMoveSheet(goal(), Number(t.dataset.dir)); break;
      case 'delEntry': if (confirm('Delete this entry?')) { const g = goal(); g.entries = g.entries.filter((x) => x.id !== t.dataset.entry); save(); } break;
      case 'editSem': semSheet(S().semesters.find((x) => x.id === id)); break;
      case 'togglePaid': { const k = t.dataset.key; if (S().paid[k]) delete S().paid[k]; else S().paid[k] = today(); save(); break; }
      case 'saveSettings': {
        e.preventDefault();
        const d = Object.fromEntries(new FormData($('#settingsForm')));
        Object.assign(S().settings, { name: (d.name || '').trim(), income: M.parseAmount(d.income), expenses: M.parseAmount(d.expenses), reserve: M.parseAmount(d.reserve), otherSavings: M.parseAmount(d.otherSavings), theme: d.theme });
        applyTheme(); save(); break;
      }
      case 'calcLoan': {
        e.preventDefault();
        const d = Object.fromEntries(new FormData($('#loanForm')));
        S().loan = { amount: M.parseAmount(d.amount), rate: Number(d.rate) || 0, months: Number(d.months) || 0, fee: M.parseAmount(d.fee), method: d.method };
        save(); break;
      }
      case 'exportJSON': exportJSON(); break;
      case 'exportCSV': download('ssente-expenses-' + today() + '.csv', M.expensesCSV(S().expenses, S().categories), 'text/csv'); break;
      case 'importJSON': { const f = $('#importFile'); f.onchange = () => f.files[0] && importJSON(f.files[0]); f.click(); break; }
      case 'snooze': S().meta.backupSnoozeUntil = M.todayISO(new Date(Date.now() + 3 * 864e5)); save(); break;
      case 'pickPhoto': { const f = $('#photoFile'); f.onchange = () => f.files[0] && setPhoto(f.files[0]); f.click(); break; }
      case 'removePhoto': if (confirm('Remove your profile photo?')) { S().settings.photo = null; save(); } break;
      case 'addCat': catSheet(); break;
      case 'editCat': catSheet(S().categories.find((c) => c.id === id)); break;
    }
  });

  /* ---------- boot ---------- */
  Store.init().then(() => {
    applyTheme();
    if (new URLSearchParams(location.search).get('action') === 'add') setTimeout(expenseSheet, 100);
    render();
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
  }
})();
