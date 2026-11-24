/* Tests for js/money.js. Run any of:
     node tests/money.test.js
     /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc js/money.js tests/money.test.js
     open tests/index.html in a browser                                           */
'use strict';

(function () {
  const M = typeof require === 'function' ? require('../js/money.js') : globalThis.Money;
  const log = (typeof console !== 'undefined' && console.log) ? (s) => console.log(s) : (s) => print(s);
  const results = [];
  let failed = 0;

  function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) throw new Error((msg ? msg + ': ' : '') + 'expected ' + e + ', got ' + a);
  }
  function test(name, fn) {
    try { fn(); results.push({ name, ok: true }); log('ok   ' + name); }
    catch (err) { failed++; results.push({ name, ok: false, err: err.message }); log('FAIL ' + name + '\n     ' + err.message); }
  }

  const settings = { income: 750000, expenses: 250000, reserve: 250000 };
  const blank = () => ({ settings, expenses: [], incomes: [], goals: [] });

  /* ---- formatting ---- */
  test('formats UGX with thousands separators and no decimals', () => {
    eq(M.fmtUGX(1430000), 'UGX 1,430,000');
    eq(M.fmtUGX(999.6), 'UGX 1,000');
    eq(M.fmtNum(-250000), '-250,000');
    eq(M.fmtNum(0), '0');
  });
  test('parses typed amounts', () => {
    eq(M.parseAmount('1,430,000'), 1430000);
    eq(M.parseAmount('UGX 5 000'), 5000);
    eq(M.parseAmount(''), 0);
  });

  /* ---- monthly left to spend ---- */
  test('left to spend and daily allowance mid-month', () => {
    const d = blank();
    d.expenses.push({ amount: 50000, date: '2026-11-03', categoryId: 'food' });
    d.expenses.push({ amount: 30000, date: '2026-11-10', categoryId: 'transport' });
    d.expenses.push({ amount: 99999, date: '2026-10-30', categoryId: 'food' }); // other month
    const s = M.monthSummary(d, '2026-11', '2026-11-24');
    eq(s.spent, 80000);
    eq(s.leftToSpend, 170000);
    eq(s.daysLeft, 7, 'Nov 24..30 inclusive');
    eq(s.dailyAllowance, 24285, '170,000 / 7 rounded down');
    eq(s.level, 'ok');
    eq(s.freeMoney, 500000);
  });
  test('budget bar turns amber, then red, then over', () => {
    eq(M.budgetLevel(187500, 250000), 'warn');   // 75%
    eq(M.budgetLevel(225000, 250000), 'danger'); // 90%
    eq(M.budgetLevel(250000, 250000), 'danger'); // exactly at limit
    eq(M.budgetLevel(260000, 250000), 'over');
  });
  test('overspent month has negative left and zero allowance', () => {
    const d = blank();
    d.expenses.push({ amount: 300000, date: '2026-11-01', categoryId: 'rent' });
    const s = M.monthSummary(d, '2026-11', '2026-11-24');
    eq(s.leftToSpend, -50000);
    eq(s.dailyAllowance, 0);
  });
  test('saved counts goal deposits minus withdrawals in the month', () => {
    const d = blank();
    d.goals.push({ entries: [
      { amount: 200000, date: '2026-11-01' }, { amount: -50000, date: '2026-11-20' },
      { amount: 100000, date: '2026-10-28' }] });
    eq(M.monthSummary(d, '2026-11', '2026-11-24').saved, 150000);
  });

  /* ---- loan repayment ---- */
  test('reducing-balance loan repayment', () => {
    const l = M.loanSummary({ amount: 1000000, rate: 24, months: 12, fee: 20000, method: 'reducing' }, 750000);
    eq(l.monthly, 94560);
    eq(l.totalRepaid, 1134720);
    eq(l.interest, 134720);
    eq(l.totalCost, 154720);
    eq(Math.round(l.shareOfIncome * 1000) / 10, 12.6);
  });
  test('flat-rate loan repayment', () => {
    const l = M.loanSummary({ amount: 1000000, rate: 24, months: 12, fee: 0, method: 'flat' }, 750000);
    eq(l.monthly, 103333);
  });
  test('zero-interest loan and empty loan', () => {
    eq(M.loanSummary({ amount: 600000, rate: 0, months: 6, fee: 0 }, 750000).monthly, 100000);
    eq(M.loanSummary({ amount: 0, rate: 10, months: 6, fee: 5000 }, 750000).totalCost, 5000);
  });

  /* ---- semester schedule ---- */
  test('split evenly keeps whole shillings and the exact total', () => {
    eq(M.splitEvenly(657500, 4), [164375, 164375, 164375, 164375]);
    eq(M.splitEvenly(657500, 3), [219167, 219167, 219166]);
  });
  test('semester 1: Jan deposit then Feb–May balance', () => {
    const s1 = M.defaultSemesters(2027)[0];
    const p = M.semesterPayments(s1);
    eq(p.map((x) => x.due), ['2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
    eq(p[0].amount, 1427500, '657,500 + 700,000 + 70,000');
    eq(p.slice(1).map((x) => x.amount), [164375, 164375, 164375, 164375]);
    eq(M.sum(p, (x) => x.amount), 1315000 + 700000 + 70000);
  });
  test('semester 2: Jul deposit, balance by October', () => {
    const p = M.semesterPayments(M.defaultSemesters(2027)[1]);
    eq(p[0].due, '2027-07');
    eq(p[0].amount, 727500);
    eq(p[p.length - 1].due, '2027-10');
    eq(M.sum(p, (x) => x.amount), 1315000 + 70000);
  });
  test('six semesters, alternating January and July', () => {
    const s = M.defaultSemesters(2027);
    eq(s.length, 6);
    eq(s.map((x) => x.depositMonth), ['2027-01', '2027-07', '2028-01', '2028-07', '2029-01', '2029-07']);
  });
  test('projection flags a January shortfall and a reserve break', () => {
    const pays = M.allPayments([M.defaultSemesters(2027)[0]], {});
    // Nov 2026, 600k saved, 500k free per month: Nov end 1.1M, Dec end 1.6M.
    const r = M.projectPlan({ startYM: '2026-11', startBalance: 600000, monthlyFree: 500000,
      reserve: 250000, payments: pays });
    const jan = r.status['sem1:dep'];
    eq(jan.before, 1600000);
    eq(jan.after, 172500);
    eq(jan.status, 'reserve', 'covered, but leaves less than the 250k reserve');
    eq(r.status['sem1:bal:2027-02'].status, 'ok');
    const broke = M.projectPlan({ startYM: '2026-11', startBalance: 0, monthlyFree: 500000,
      reserve: 250000, payments: pays });
    eq(broke.status['sem1:dep'].status, 'short');
    eq(broke.status['sem1:dep'].shortfall, 427500);
  });
  test('paid fees are skipped and overdue ones count as due now', () => {
    const pays = M.allPayments([M.defaultSemesters(2027)[0]], { 'sem1:dep': true });
    const r = M.projectPlan({ startYM: '2027-03', startBalance: 1000000, monthlyFree: 500000,
      reserve: 250000, payments: pays });
    eq(r.status['sem1:dep'].status, 'paid');
    eq(r.months[0].fees, 164375 * 2, 'Feb (overdue) + Mar due in March');
  });

  /* ---- misc ---- */
  test('CSV export quotes commas and quotes', () => {
    const csv = M.expensesCSV([{ date: '2026-11-02', amount: 5000, categoryId: 'food', note: 'rolex, "big"' }],
      [{ id: 'food', name: 'Food' }]);
    eq(csv, 'date,amount_ugx,category,note\r\n2026-11-02,5000,Food,"rolex, ""big"""\r\n');
  });
  test('savings line is cumulative by month', () => {
    const g = [{ entries: [{ amount: 100000, date: '2026-09-10' }, { amount: 50000, date: '2026-11-01' }] }];
    eq(M.savingsSeries(g, '2026-09', '2026-11').map((x) => x.balance), [100000, 100000, 150000]);
  });

  log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  globalThis.__testResults = results;
  if (failed && typeof process !== 'undefined') process.exitCode = 1;
}());
