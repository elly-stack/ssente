/* Money maths for Ssente. Pure functions only: no DOM, no storage.
   Works in the browser (window.Money), Node (require) and macOS jsc (tests).
   All amounts are whole Uganda shillings (integers). Months are 'YYYY-MM'. */
'use strict';

(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.Money = M;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* ---------- formatting ---------- */

  /** 1430000 -> '1,430,000'. Done by hand so output is identical everywhere. */
  function fmtNum(n) {
    const v = Math.round(Number(n) || 0);
    const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '-' : '') + s;
  }
  const fmtUGX = (n) => 'UGX ' + fmtNum(n);

  /** '1,430,000' / '1 430 000' / 'UGX 1430000' -> 1430000. Anything else -> 0. */
  function parseAmount(str) {
    const digits = String(str == null ? '' : str).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  /* ---------- months and dates ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  const ymOf = (iso) => String(iso).slice(0, 7);
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function addMonths(ym, k) {
    const [y, m] = ym.split('-').map(Number);
    const t = y * 12 + (m - 1) + k;
    return Math.floor(t / 12) + '-' + pad((t % 12) + 1);
  }
  /** Whole months from a to b (b later => positive). */
  function monthDiff(a, b) {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return (by - ay) * 12 + (bm - am);
  }
  function daysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  function ymLabel(ym, long) {
    const [y, m] = ym.split('-').map(Number);
    return (long ? MONTHS_LONG : MONTHS)[m - 1] + ' ' + y;
  }

  const sum = (list, f) => list.reduce((s, x) => s + (f ? f(x) : x), 0);

  /* ---------- monthly budget ---------- */

  const WARN_AT = 0.75;   // amber from 75% of the budget
  const DANGER_AT = 0.9;  // red from 90%

  function budgetLevel(spent, budget) {
    if (budget <= 0) return spent > 0 ? 'over' : 'ok';
    const p = spent / budget;
    if (p > 1) return 'over';
    if (p >= DANGER_AT) return 'danger';
    if (p >= WARN_AT) return 'warn';
    return 'ok';
  }

  /** Days still to spend in `ym`, counting today. 0 for past months. */
  function daysLeftIn(ym, today) {
    const cur = ymOf(today);
    if (ym < cur) return 0;
    if (ym > cur) return daysInMonth(ym);
    return daysInMonth(ym) - Number(today.slice(8, 10)) + 1;
  }

  /**
   * Summary for one month.
   * settings: { income, expenses (= monthly budget), reserve }
   * Returns income (logged), spent, budget, leftToSpend, saved (net goal moves),
   * pct, level, daysLeft, dailyAllowance, freeMoney.
   */
  function monthSummary(data, ym, today) {
    const s = data.settings;
    const spent = sum(data.expenses.filter((e) => ymOf(e.date) === ym), (e) => e.amount);
    const income = sum(data.incomes.filter((e) => ymOf(e.date) === ym), (e) => e.amount);
    let saved = 0;
    data.goals.forEach((g) => g.entries.forEach((en) => {
      if (ymOf(en.date) === ym) saved += en.amount;
    }));
    const budget = s.expenses;
    const leftToSpend = budget - spent;
    const daysLeft = daysLeftIn(ym, today);
    return {
      income, spent, budget, leftToSpend, saved,
      pct: budget > 0 ? spent / budget : (spent > 0 ? 1 : 0),
      level: budgetLevel(spent, budget),
      daysLeft,
      dailyAllowance: daysLeft > 0 ? Math.floor(Math.max(0, leftToSpend) / daysLeft) : 0,
      freeMoney: s.income - s.expenses
    };
  }

  /* ---------- loans ---------- */

  /**
   * loan: { amount, rate (yearly %), months, fee, method: 'reducing' | 'flat' }
   * Reducing balance = standard amortising loan (banks).
   * Flat = interest on the full amount for the whole term (many SACCOs / microlenders).
   */
  function loanSummary(loan, monthlyIncome) {
    const P = Number(loan.amount) || 0;
    const n = Math.max(0, Math.round(Number(loan.months) || 0));
    const yearly = Number(loan.rate) || 0;
    const fee = Number(loan.fee) || 0;
    if (P <= 0 || n <= 0) {
      return { monthly: 0, totalRepaid: 0, interest: 0, fee, totalCost: fee, shareOfIncome: 0 };
    }
    let monthlyExact;
    if (loan.method === 'flat') {
      monthlyExact = (P + P * (yearly / 100) * (n / 12)) / n;
    } else {
      const r = yearly / 100 / 12;
      monthlyExact = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
    }
    const monthly = Math.round(monthlyExact);
    const totalRepaid = monthly * n;
    const interest = totalRepaid - P;
    return {
      monthly, totalRepaid, interest, fee,
      totalCost: interest + fee,             // what borrowing costs you on top of the loan
      shareOfIncome: monthlyIncome > 0 ? monthly / monthlyIncome : 0
    };
  }

  /* ---------- semester fees ---------- */

  /** Split a whole-shilling total into n whole parts that add back up exactly. */
  function splitEvenly(total, n) {
    if (n <= 0) return [];
    const base = Math.floor(total / n);
    let rem = total - base * n;
    const out = [];
    for (let i = 0; i < n; i++) { out.push(base + (rem > 0 ? 1 : 0)); if (rem > 0) rem--; }
    return out;
  }

  /**
   * Turn a semester's settings into dated payments.
   * sem: { id, name, tuition, annualFees, registration, depositPct,
   *        depositMonth, balanceFrom, balanceTo }
   * Deposit = depositPct% of tuition + annual fees + registration, due depositMonth.
   * The rest of the tuition is split evenly over balanceFrom..balanceTo.
   */
  function semesterPayments(sem) {
    const tuition = Number(sem.tuition) || 0;
    const pct = Math.min(100, Math.max(0, Number(sem.depositPct)));
    const depTuition = Math.round(tuition * pct / 100);
    const out = [];
    const extras = [];
    if (sem.annualFees) extras.push('annual fees');
    if (sem.registration) extras.push('registration');
    out.push({
      key: sem.id + ':dep', semId: sem.id, kind: 'deposit', due: sem.depositMonth,
      amount: depTuition + (Number(sem.annualFees) || 0) + (Number(sem.registration) || 0),
      label: (pct === 100 ? 'Full tuition' : pct + '% tuition') +
        (extras.length ? ' + ' + extras.join(' + ') : '')
    });
    const balance = tuition - depTuition;
    if (balance > 0) {
      const from = sem.balanceFrom || addMonths(sem.depositMonth, 1);
      const to = sem.balanceTo && sem.balanceTo >= from ? sem.balanceTo : from;
      const n = monthDiff(from, to) + 1;
      splitEvenly(balance, n).forEach((amt, i) => {
        const due = addMonths(from, i);
        out.push({
          key: sem.id + ':bal:' + due, semId: sem.id, kind: 'balance', due, amount: amt,
          label: n > 1 ? 'Tuition balance ' + (i + 1) + ' of ' + n : 'Tuition balance'
        });
      });
    }
    return out;
  }

  /**
   * Six semesters from January 2027 for a Cavendish BBA (distance learning).
   * Odd semesters (Jan): annual fees + registration, 50% deposit in Jan, balance Feb–May.
   * Even semesters (Jul): registration, 50% deposit in Jul, balance Aug–Oct.
   * All figures are estimates to confirm with the university.
   */
  function defaultSemesters(startYear) {
    const y0 = startYear || 2027;
    const out = [];
    for (let i = 0; i < 6; i++) {
      const year = y0 + Math.floor(i / 2);
      const jan = i % 2 === 0;
      out.push({
        id: 'sem' + (i + 1),
        name: 'Semester ' + (i + 1) + (jan ? ' (Jan–Jun ' : ' (Jul–Dec ') + year + ')',
        tuition: 1315000,
        annualFees: jan ? 700000 : 0,
        registration: 70000,
        depositPct: 50,
        depositMonth: year + (jan ? '-01' : '-07'),
        balanceFrom: year + (jan ? '-02' : '-08'),
        balanceTo: year + (jan ? '-05' : '-10')
      });
    }
    return out;
  }

  function allPayments(semesters, paid) {
    paid = paid || {};
    const list = [];
    semesters.forEach((s) => semesterPayments(s).forEach((p) => {
      p.paid = !!paid[p.key];
      p.semName = s.name;
      list.push(p);
    }));
    return list.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  }

  /**
   * Walk month by month from `startYM` and check every unpaid fee.
   * opts: { startYM, startBalance (savings now, reserve included), monthlyFree
   *         (income - expenses, added at each month end), reserve, payments }
   * Fees due in a month come out of what you have at the start of that month;
   * that month's free money lands at month end (salary is paid at month end).
   * Unpaid fees from before startYM are treated as due now.
   * Status per payment: paid | ok | reserve (covered but dips under reserve) | short.
   */
  function projectPlan(opts) {
    const unpaid = opts.payments.filter((p) => !p.paid);
    const months = [];
    const status = {};
    opts.payments.filter((p) => p.paid).forEach((p) => { status[p.key] = { status: 'paid' }; });
    if (!unpaid.length) return { months, status };
    const last = unpaid[unpaid.length - 1].due > opts.startYM ? unpaid[unpaid.length - 1].due : opts.startYM;
    let bal = opts.startBalance;
    for (let ym = opts.startYM; ym <= last; ym = addMonths(ym, 1)) {
      const due = unpaid.filter((p) => (ym === opts.startYM ? p.due <= ym : p.due === ym));
      const fees = sum(due, (p) => p.amount);
      const before = bal;
      const after = bal - fees;
      const row = {
        ym, fees, before, after,
        covered: after >= 0,
        breaksReserve: fees > 0 && after < opts.reserve,
        shortfall: Math.max(0, -after),
        reserveGap: Math.max(0, opts.reserve - after)
      };
      if (fees > 0) months.push(row);
      due.forEach((p) => {
        status[p.key] = {
          status: !row.covered ? 'short' : row.breaksReserve ? 'reserve' : 'ok',
          before, after, shortfall: row.shortfall, reserveGap: row.reserveGap
        };
      });
      bal = after + opts.monthlyFree;
    }
    return { months, status };
  }

  /* ---------- goals, charts, export ---------- */

  const goalBalance = (g) => sum(g.entries, (e) => e.amount);

  /** End-of-month total across all goals, from `fromYM` to `toYM` inclusive. */
  function savingsSeries(goals, fromYM, toYM) {
    const entries = [];
    goals.forEach((g) => g.entries.forEach((e) => entries.push(e)));
    const out = [];
    for (let ym = fromYM; ym <= toYM; ym = addMonths(ym, 1)) {
      out.push({ ym, balance: sum(entries.filter((e) => ymOf(e.date) <= ym), (e) => e.amount) });
    }
    return out;
  }

  function categoryTotals(expenses, ym) {
    const map = {};
    expenses.forEach((e) => {
      if (ymOf(e.date) === ym) map[e.categoryId] = (map[e.categoryId] || 0) + e.amount;
    });
    return Object.keys(map).map((k) => ({ categoryId: k, total: map[k] }))
      .sort((a, b) => b.total - a.total);
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function expensesCSV(expenses, categories) {
    const name = {};
    categories.forEach((c) => { name[c.id] = c.name; });
    const rows = [['date', 'amount_ugx', 'category', 'note']];
    expenses.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((e) => {
      rows.push([e.date, e.amount, name[e.categoryId] || e.categoryId, e.note || '']);
    });
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  return {
    fmtNum, fmtUGX, parseAmount,
    ymOf, todayISO, addMonths, monthDiff, daysInMonth, ymLabel, sum,
    WARN_AT, DANGER_AT, budgetLevel, daysLeftIn, monthSummary,
    loanSummary,
    splitEvenly, semesterPayments, defaultSemesters, allPayments, projectPlan,
    goalBalance, savingsSeries, categoryTotals, expensesCSV
  };
}));
