/* Inline-SVG charts, no library. One hue per chart (magnitude), labels in text ink. */
'use strict';

const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
    : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));

  let tip = null;
  function showTip(e, text) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip); }
    tip.textContent = text; tip.hidden = false;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 12);
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = (e.clientY - 40) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }
  function bindTips(svg) {
    svg.querySelectorAll('[data-tip]').forEach((el) => {
      const t = el.getAttribute('data-tip');
      el.addEventListener('pointerenter', (e) => showTip(e, t));
      el.addEventListener('pointermove', (e) => showTip(e, t));
      el.addEventListener('pointerleave', hideTip);
      el.addEventListener('click', (e) => { showTip(e, t); setTimeout(hideTip, 1800); });
    });
  }

  /** Horizontal bars: rows = [{label, value}], sorted biggest first. */
  function bars(el, rows) {
    if (!rows.length) { el.innerHTML = '<p class="muted">No spending this month yet.</p>'; return; }
    const W = 340, rowH = 34, labelW = 112, valW = 64, max = Math.max(...rows.map((r) => r.value));
    const H = rows.length * rowH;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending by category">`;
    rows.forEach((r, i) => {
      const y = i * rowH, w = Math.max(4, (r.value / max) * (W - labelW - valW - 8));
      s += `<g data-tip="${esc(r.label)}: UGX ${Money.fmtNum(r.value)}">
        <rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"/>
        <text x="0" y="${y + 21}">${esc(r.label)}</text>
        <rect x="${labelW}" y="${y + 9}" width="${w}" height="16" rx="4" fill="var(--brand)"/>
        <text class="val" x="${labelW + w + 6}" y="${y + 21}">${short(r.value)}</text></g>`;
    });
    el.innerHTML = s + '</svg>';
    bindTips(el.querySelector('svg'));
  }

  /** Line: points = [{label, value}] in time order. */
  function line(el, points) {
    const W = 340, H = 170, L = 40, R = 10, T = 12, B = 24;
    const vals = points.map((p) => p.value);
    const max = Math.max(100000, ...vals), min = Math.min(0, ...vals);
    const x = (i) => L + (points.length === 1 ? 0 : i * (W - L - R) / (points.length - 1));
    const y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Savings by month">`;
    [min, (min + max) / 2, max].forEach((v) => {
      s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>
        <text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`;
    });
    s += `<polyline fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" points="${points.map((p, i) => x(i) + ',' + y(p.value)).join(' ')}"/>`;
    points.forEach((p, i) => {
      if (i % 2 === 0 || i === points.length - 1) s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(p.label.slice(0, 3))}</text>`;
      s += `<g data-tip="${esc(p.label)}: UGX ${Money.fmtNum(p.value)}"><rect x="${x(i) - 12}" y="${T}" width="24" height="${H - T - B}" fill="transparent"/>
        <circle cx="${x(i)}" cy="${y(p.value)}" r="4" fill="var(--brand)" stroke="var(--card)" stroke-width="2"/></g>`;
    });
    el.innerHTML = s + '</svg>';
    bindTips(el.querySelector('svg'));
  }

  return { bars, line };
})();
