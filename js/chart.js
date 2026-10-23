// Einfaches Liniendiagramm (SVG): Tageswerte als Punkte, Wochenschnitt als Linie.
// Antippen zeigt den nächstgelegenen Wert.
import { h, fromIso, iso, addDays, weekStart, fmtShort, WD_SHORT } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 340;
const H = 170;
const PAD = { l: 34, r: 10, t: 12, b: 22 };

function svg(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const fmt = (v, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

// points: [{date:'JJJJ-MM-TT', v:Zahl}], weeks: wie viele Wochen zurück
export function lineChart(points, { weeks = 8, unit = 'kg', decimals = 1, avg = true, yMin, yMax } = {}) {
  const end = addDays(weekStart(), 7);
  const start = addDays(end, -7 * weeks);
  const s0 = iso(start);
  const data = points.filter((p) => p.date >= s0).map((p) => ({ ...p, x: fromIso(p.date) }));
  const wrap = h('div.chart');
  if (data.length < 2) {
    wrap.append(h('p.small.muted', 'Ab zwei Einträgen siehst du hier deinen Verlauf.'));
    return wrap;
  }

  // Wochenschnitt (Punkt in der Wochenmitte)
  const weekly = [];
  for (let i = 0; i < weeks; i++) {
    const a = iso(addDays(start, 7 * i));
    const b = iso(addDays(start, 7 * i + 7));
    const vs = data.filter((p) => p.date >= a && p.date < b).map((p) => p.v);
    if (vs.length) weekly.push({ x: addDays(start, 7 * i + 3), v: vs.reduce((s, v) => s + v, 0) / vs.length });
  }

  const vals = data.map((p) => p.v);
  let lo = yMin ?? Math.floor(Math.min(...vals) - 0.5);
  let hi = yMax ?? Math.ceil(Math.max(...vals) + 0.5);
  if (hi - lo < 2) hi = lo + 2;
  const sx = (d) => PAD.l + ((d - start) / (end - start)) * (W - PAD.l - PAD.r);
  const sy = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': `Verlauf der letzten ${weeks} Wochen` });

  // Raster und Achsenbeschriftung (zurückhaltend)
  const steps = 3;
  for (let i = 0; i <= steps; i++) {
    const v = lo + ((hi - lo) * i) / steps;
    root.append(svg('line', { x1: PAD.l, x2: W - PAD.r, y1: sy(v), y2: sy(v), class: 'grid' }));
    const t = svg('text', { x: PAD.l - 6, y: sy(v) + 4, class: 'axis', 'text-anchor': 'end' });
    t.textContent = fmt(v, hi - lo < 6 ? 1 : 0);
    root.append(t);
  }
  for (let i = 0; i < weeks; i += 2) {
    const d = addDays(start, 7 * i);
    const t = svg('text', { x: sx(d), y: H - 6, class: 'axis' });
    t.textContent = fmtShort(d);
    root.append(t);
  }

  if (avg && weekly.length > 1) {
    root.append(svg('polyline', { points: weekly.map((p) => `${sx(p.x)},${sy(p.v)}`).join(' '), class: 'line' }));
  }
  for (const p of data) root.append(svg('circle', { cx: sx(p.x), cy: sy(p.v), r: 3.2, class: 'dot' }));
  if (avg) for (const p of weekly) root.append(svg('circle', { cx: sx(p.x), cy: sy(p.v), r: 4.5, class: 'avg' }));

  // Antippen / Hover: nächster Tageswert
  const marker = svg('circle', { r: 6, class: 'focus', cx: -20, cy: -20 });
  const rule = svg('line', { y1: PAD.t, y2: H - PAD.b, x1: -20, x2: -20, class: 'rule' });
  root.prepend(rule);
  root.append(marker);
  const tip = h('p.chart-tip', ' ');
  function show(ev) {
    const r = root.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    let best = data[0];
    for (const p of data) if (Math.abs(sx(p.x) - x) < Math.abs(sx(best.x) - x)) best = p;
    const cx = sx(best.x);
    marker.setAttribute('cx', cx);
    marker.setAttribute('cy', sy(best.v));
    rule.setAttribute('x1', cx);
    rule.setAttribute('x2', cx);
    const wk = weekly.find((w) => Math.abs(w.x - best.x) <= 3 * 86400000);
    tip.textContent = `${WD_SHORT[best.x.getDay()]} ${fmtShort(best.x)} · ${fmt(best.v, decimals)} ${unit}`
      + (avg && wk ? ` · Wochenschnitt ${fmt(wk.v, decimals)} ${unit}` : '');
  }
  root.addEventListener('pointerdown', show);
  root.addEventListener('pointermove', show);

  wrap.append(root, tip);
  if (avg) {
    wrap.append(h('div.legend',
      h('span', h('i.lg-dot'), 'Tageswert'),
      h('span', h('i.lg-line'), 'Wochenschnitt'),
    ));
  }
  return wrap;
}
