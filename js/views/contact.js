// Bereich Contact – drei Reiter mit je einer klaren Aufgabe:
//   Karte       Überblick: wer steht wo, wie ist der Status
//   Diese Woche Handeln: fällige Kontakte eintragen oder planen
//   Rückblick   Verlauf: wie lief es, wer kam zu kurz, Kontakt-Tagebuch
// Ton: ruhig, freundlich, ohne Schuldgefühle.
import * as pp from '../people.js';
import { h, icon, toast, iso, fromIso, addDays, weekStart, isoWeek, WD_SHORT, fmtShort, saveFile } from '../ui.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

const TABS = [
  { id: 'karte', name: 'Karte' },
  { id: 'woche', name: 'Diese Woche' },
  { id: 'rueckblick', name: 'Rückblick' },
];
const RINGS = [0, 1, 2, 3, 4];
const dayLabel = (d) => `${WD_SHORT[fromIso(d).getDay()]} ${fmtShort(fromIso(d))}`;

// Zuletzt gewählter Reiter – reine Ansichtssache, pro Gerät.
function lastTab() {
  try {
    return localStorage.getItem('life4.contactTab') || 'karte';
  } catch {
    return 'karte';
  }
}

// Auf-/zugeklappte Boxen – pro Gerät gemerkt (reine Ansichtssache)
const OPEN_DEFAULTS = { menschen: true, 'ring-0': true, 'ring-1': true, due: true, planned: true, done: false, verlauf: true, ringe: false, reach: true, tagebuch: false };
let openState = (() => {
  try {
    return JSON.parse(localStorage.getItem('life4.contactOpen')) || {};
  } catch {
    return {};
  }
})();
const isOpen = (k) => openState[k] ?? OPEN_DEFAULTS[k] ?? false;
function toggleOpen(k, refresh) {
  openState = { ...openState, [k]: !isOpen(k) };
  try {
    localStorage.setItem('life4.contactOpen', JSON.stringify(openState));
  } catch { /* egal */ }
  refresh();
}

// Aufklappbare Karte mit Überschrift, Zähler und Pfeil
function box(key, ic, title, count, body, refresh, cls = '') {
  const o = isOpen(key);
  return h(`section.card.collapsible.box${o ? '.open' : ''}${cls}`,
    h('button.sec-title.sec-toggle', { onclick: () => toggleOpen(key, refresh), 'aria-expanded': o },
      h('span.sec-icon', icon(ic, 18)), h('h2', title), count != null && h('span.count', count), h('span.chev', icon('back', 18))),
    o && body,
  );
}

// Geplante Kontakte als Kalenderdatei (Apple Kalender: Datei öffnen → hinzufügen)
async function toCalendar(items) {
  if (!items.length) return toast('Keine geplanten Kontakte.');
  const name = items.length === 1 ? `kontakt-${items[0].p.name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-')}.ics` : 'geplante-kontakte.ics';
  await saveFile(new Blob([pp.plansIcs(items)], { type: 'text/calendar' }), name, 'text/calendar');
}

const planText = (pl) => `${pp.planName(pl.art)} · ${dayLabel(pl.date)}${pl.time ? `, ${pl.time} Uhr` : ''}`;

let logWeeks = 4;
const openWeeks = new Set();

export function render(sub, refresh) {
  if (sub === 'neu') return editView(refresh);
  if (sub === 'ringe') return ringsView();
  if (sub.startsWith('p-')) return personView(sub.slice(2), refresh);
  const tab = TABS.some((t) => t.id === sub) ? sub : lastTab();
  try {
    localStorage.setItem('life4.contactTab', tab);
  } catch { /* egal */ }
  const views = { karte: mapTab, woche: weekTab, rueckblick: reviewTab };
  return h('div.view.a-contact.contact-view',
    h('div.segs.ctabs', TABS.map((t) => h(`a.seg${t.id === tab ? '.on' : ''}`, { href: `#/contact/${t.id}` }, t.name))),
    views[tab](refresh),
  );
}

// ---------- Bausteine ----------

function secTitle(ic, text, right) {
  return h('div.sec-title', h('span.sec-icon', icon(ic, 18)), h('h2', text), right || null);
}

function back() {
  return h('a.backlink', { href: '#/contact' }, icon('back', 18), 'Contact');
}

const goPerson = (id) => { location.hash = `#/contact/p-${id}`; };
const avatar = (p, big) => h(`span.avatar.rg-${pp.ringOf(p)}${big ? '.big' : ''}`, pp.initials(p.name));
const dot = (state) => h(`span.sdot.s-${state}`, { title: pp.STATES[state], 'aria-label': pp.STATES[state] });

// Kompakte Zeile: Avatar · Name · Zeile darunter · Statuspunkt · Chevron
function personLine(p, sub, s = pp.status(p)) {
  return h('button.pline', { onclick: () => goPerson(p.id) },
    avatar(p),
    h('span.pl-main', h('b', p.name), h('span.small.muted.block', sub ?? pp.lineText(p, s))),
    dot(s.state),
    h('span.chev-r', icon('back', 16)),
  );
}

// ---------- Eintragen (Bottom-Sheet) ----------

function openSheet(p, refresh, preset = {}) {
  const kinds = ['telefoniert', 'getroffen', 'geschrieben', ...(pp.defaultKind(p) === 'date' || pp.ringOf(p) === 0 ? ['date'] : []), 'planen'];
  let kind = preset.kind || pp.defaultKind(p);
  const date = h('input.input', { type: 'date', value: iso() });
  const time = h('input.input', { type: 'time' });
  const timeField = h('label.field', h('span', 'Uhrzeit (optional)'), time);
  const note = h('textarea.input', { rows: 3, placeholder: 'Notiz (optional) – worüber habt ihr gesprochen?' });
  const err = h('p.error');
  const chips = h('div.sheet-kinds', { style: { gridTemplateColumns: `repeat(${kinds.length > 4 ? 3 : 4}, 1fr)` } });
  const paint = () => {
    chips.replaceChildren(...kinds.map((k) => h(`button.kchip${k === kind ? '.on' : ''}`, {
      onclick: () => {
        kind = k;
        if (k === 'planen' && date.value <= iso()) date.value = iso(addDays(new Date(), 1));
        if (k !== 'planen' && date.value > iso()) date.value = iso();
        paint();
      },
    }, icon(k === 'planen' ? 'calendar' : pp.KINDS[k].icon, 18), k === 'planen' ? 'Planen' : pp.KINDS[k].name)));
    date.min = kind === 'planen' ? iso() : '';
    date.max = kind === 'planen' ? '' : iso();
    timeField.hidden = kind !== 'planen';
  };
  paint();

  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 220);
  };
  const save = () => {
    const d = date.value;
    if (!d) return (err.textContent = 'Bitte ein Datum wählen.');
    if (kind === 'planen') {
      if (d < iso()) return (err.textContent = 'Ein Plan liegt heute oder in der Zukunft.');
      const pl = { date: d, art: pp.defaultKind(p), note: note.value.trim(), ...(time.value ? { time: time.value } : {}) };
      pp.setPlan(p.id, pl);
      toast(`Geplant: ${p.name} · ${dayLabel(d)}`, '', { label: 'In Kalender', fn: () => toCalendar([{ p, plan: pl }]) });
    } else {
      if (d > iso()) return (err.textContent = 'Für die Zukunft bitte „Planen“ wählen.');
      pp.logContact(p.id, { date: d, art: kind, note: note.value.trim() });
      toast(`Schön – ${pp.kindName(kind)} mit ${p.name} eingetragen`);
    }
    close();
    refresh();
  };

  const wrap = h('div.sheet-wrap', { onclick: (e) => e.target === wrap && close() },
    h('div.sheet', { role: 'dialog', 'aria-label': `Kontakt mit ${p.name}` },
      h('div.sheet-grip'),
      h('div.sheet-head', avatar(p), h('div', h('h2', p.name), h('p.small.muted', pp.lineText(p)))),
      h('p.sheet-label', 'Was war?'),
      chips,
      h('div.sheet-row', h('label.field', h('span', 'Datum'), date), timeField),
      h('label.field', h('span', 'Notiz'), note),
      err,
      h('div.sheet-btns',
        h('button.btn.ghost', { onclick: close }, 'Abbrechen'),
        h('button.btn.primary', { onclick: save }, 'Speichern'),
      ),
    ),
  );
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
}

// Wischen nach rechts = Standardkontakt für heute (mit „Rückgängig“).
function quickLog(p, refresh) {
  if (pp.hadContactOn(p.id, iso())) {
    toast(`Für ${p.name} ist heute schon ein Kontakt eingetragen.`);
    return;
  }
  const oldPlan = pp.plan(p.id);
  const kind = pp.defaultKind(p);
  pp.logContact(p.id, { art: kind });
  refresh();
  toast(`${pp.kindName(kind)}: ${p.name} – heute`, '', {
    label: 'Rückgängig',
    fn: () => {
      pp.removeContact(p.id, iso());
      if (oldPlan && !pp.plan(p.id)) pp.setPlan(p.id, oldPlan);
      refresh();
    },
  });
}

function swipeRow(p, refresh, sub, s) {
  const inner = h('div.sw-inner',
    h('button.sw-tap', { onclick: () => goPerson(p.id) },
      avatar(p),
      h('span.pl-main', h('b', p.name), h('span.small.muted.block', sub)),
      dot(s.state),
    ),
    h('button.btn.ghost.sm.eintragen', { onclick: () => openSheet(p, refresh) }, 'Eintragen'),
  );
  const row = h('div.sw-row',
    h('div.sw-bg', icon('check', 20), pp.kindName(pp.defaultKind(p))),
    inner,
  );

  let x0 = null;
  let y0 = 0;
  let dx = 0;
  let active = false;
  let pid = null;
  let swallowClick = false;
  inner.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.eintragen')) return;
    x0 = e.clientX;
    y0 = e.clientY;
    dx = 0;
    active = false;
    pid = e.pointerId;
  });
  inner.addEventListener('pointermove', (e) => {
    if (x0 == null) return;
    const mx = e.clientX - x0;
    const my = e.clientY - y0;
    if (!active) {
      if (mx > 12 && mx > Math.abs(my) * 1.5) {
        active = true;
        row.classList.add('swiping');
        inner.setPointerCapture(pid);
      } else if (Math.abs(my) > 12 || mx < -12) {
        x0 = null;
        return;
      } else return;
    }
    dx = Math.max(0, Math.min(mx, 170));
    inner.style.transform = `translateX(${dx}px)`;
    row.classList.toggle('armed', dx > 90);
  });
  const end = () => {
    if (x0 == null) return;
    const swiped = active && dx > 90;
    if (active) swallowClick = true;
    x0 = null;
    active = false;
    inner.style.transition = 'transform .2s ease';
    inner.style.transform = '';
    setTimeout(() => {
      inner.style.transition = '';
      row.classList.remove('swiping');
    }, 220);
    row.classList.remove('armed');
    if (swiped) quickLog(p, refresh);
  };
  inner.addEventListener('pointerup', end);
  inner.addEventListener('pointercancel', end);
  inner.addEventListener('click', (e) => {
    if (swallowClick) {
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  return row;
}

// ---------- Reiter 1: Karte ----------

let measureCtx;
function textWidth(t, size) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = `650 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  return measureCtx.measureText(t).width;
}

function circle(list, refresh) {
  const S = 400;
  const C = S / 2;
  const R = [0, 78, 118, 157, 194];
  const root = svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'circle-svg', role: 'img', 'aria-label': 'Dein Kreis' });
  const rings = {};
  for (let n = 4; n >= 1; n--) {
    rings[n] = svg('circle', { cx: C, cy: C, r: R[n], class: `ring ring-${n}` });
    root.append(rings[n]);
  }
  rings[0] = svg('circle', { cx: C, cy: C, r: 27, class: 'me' });
  root.append(rings[0]);
  const me = svg('text', { x: C, y: C + 5, 'text-anchor': 'middle', class: 'me-t' });
  me.textContent = 'Ich';
  root.append(me);

  const ringAt = (dist) => {
    if (dist > R[4] + 40) return null;
    if (dist < 48) return 0;
    for (let n = 1; n < 4; n++) if (dist < (R[n] + R[n + 1]) / 2) return n;
    return 4;
  };
  const toSvg = (e) => new DOMPoint(e.clientX, e.clientY).matrixTransform(root.getScreenCTM().inverse());
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2))
    * Math.max(0, Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2));
  const DOTW = 12; // Platz für den Statuspunkt im Namensschild

  const layout = [];
  const placed = [{ x: C, y: C, w: 54, h: 54 }];
  const partners = list.filter((p) => pp.ringOf(p) === 0);
  partners.forEach((p, i) => {
    const size = 12;
    const w = textWidth(`♥ ${p.name}`, size) + 22 + DOTW;
    const x = C + (i - (partners.length - 1) / 2) * (w + 6);
    const pos = { p, x, y: C + 40, w, h: size + 12, size, n: 0 };
    placed.push(pos);
    layout.push(pos);
  });

  // Gleichmäßig im Winkel verteilt; der Ring wird so gedreht, dass nichts überlappt.
  for (let n = 1; n <= 4; n++) {
    const inRing = list.filter((p) => pp.ringOf(p) === n);
    const count = inRing.length;
    if (!count) continue;
    const size = count > 10 ? 11 : 12.5;
    const dims = inRing.map((p) => ({ w: textWidth(p.name, size) + 20 + DOTW, h: size + 12 }));
    const crowded = dims.reduce((sum, d) => sum + d.w, 0) > 2 * Math.PI * R[n] * 0.9;
    const at = (off) => inRing.map((p, i) => {
      const a = (off + (360 / count) * i) * (Math.PI / 180);
      const rr = R[n] + (crowded ? (i % 2 ? 11 : -11) : 0);
      // Am Rand nach innen rücken, damit der Name immer ganz sichtbar ist.
      const x = Math.min(Math.max(C + rr * Math.cos(a), dims[i].w / 2 + 4), S - dims[i].w / 2 - 4);
      return { p, x, y: C + rr * Math.sin(a), ...dims[i], size, n };
    });
    let best = null;
    for (let off = -90; off < 270; off += 3) {
      const pos = at(off);
      let cost = 0;
      pos.forEach((a, i) => {
        for (const b of placed) cost += overlap(a, b);
        for (let j = i + 1; j < pos.length; j++) cost += overlap(a, pos[j]);
      });
      if (!best || cost < best.cost - 0.5) best = { cost, pos };
    }
    placed.push(...best.pos);
    layout.push(...best.pos);
  }

  for (const { p, x, y, w, h: ht, size, n } of layout) {
    const st = pp.status(p).state;
    const g = svg('g', { class: `bubble${n === 0 ? ' partner' : ''}`, role: 'button', 'aria-label': `${p.name}, ${pp.STATES[st]}` });
    g.append(svg('rect', { x: x - w / 2, y: y - ht / 2, width: w, height: ht, rx: ht / 2 }));
    g.append(svg('circle', { cx: x - w / 2 + 11, cy: y, r: 4, class: `bdot s-${st}` }));
    const t = svg('text', { x: x + DOTW / 2 - 2, y: y + size * 0.36, 'text-anchor': 'middle', 'font-size': size });
    t.textContent = n === 0 ? `♥ ${p.name}` : p.name;
    g.append(t);

    // Ziehen = in anderen Ring verschieben, kurz tippen = Person öffnen.
    let drag = null;
    g.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const pt = toSvg(e);
      drag = { x0: pt.x, y0: pt.y, moved: false, target: n };
      root.append(g); // nach vorne holen – vor dem Festhalten, sonst geht der Finger „verloren“
      g.setPointerCapture(e.pointerId);
      g.classList.add('dragging');
    });
    g.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const pt = toSvg(e);
      const dx = pt.x - drag.x0;
      const dy = pt.y - drag.y0;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      g.setAttribute('transform', `translate(${dx} ${dy})`);
      drag.target = ringAt(Math.hypot(x + dx - C, y + dy - C));
      for (const k of RINGS) rings[k].classList.toggle('target', k === drag.target && k !== n);
    });
    g.addEventListener('pointerup', () => {
      if (!drag) return;
      const { moved, target } = drag;
      drag = null;
      g.classList.remove('dragging');
      for (const k of RINGS) rings[k].classList.remove('target');
      if (!moved) return goPerson(p.id);
      if (target != null && target !== n) {
        const { id, ...data } = p;
        pp.savePerson(id, { ...data, ring: target });
        toast(`${p.name} → ${pp.ringName(target)}`);
      }
      refresh();
    });
    g.addEventListener('pointercancel', () => {
      drag = null;
      refresh();
    });
    root.append(g);
  }
  return root;
}

function legend() {
  return h('div.slegend', Object.entries(pp.STATES).map(([k, v]) => h('span', dot(k), v)));
}

function mapTab(refresh) {
  const list = pp.people();
  return [
    h('section.card.circle-card',
      h('div.ch-head',
        h('div', h('h2', 'Dein Kreis'), h('p.small.muted', list.length ? 'Ziehen zum Verschieben · Tippen zum Öffnen' : 'Füge die Menschen hinzu, die dir wichtig sind.')),
        h('a.addbtn', { href: '#/contact/neu', 'aria-label': 'Person hinzufügen' }, icon('plus', 22)),
      ),
      h('div.circle-wrap', circle(list, refresh)),
    ),
    box('menschen', 'contact', 'Deine Menschen', list.length, [
      !list.length && h('p.muted', 'Noch niemand eingetragen. Fang mit Mama und Papa an – oben auf + tippen.'),
      RINGS.map((n) => {
        const inRing = list.filter((p) => pp.ringOf(p) === n);
        if (!inRing.length) return null;
        const key = `ring-${n}`;
        const o = isOpen(key);
        const counts = {};
        for (const p of inRing) {
          const st = pp.status(p).state;
          counts[st] = (counts[st] || 0) + 1;
        }
        return h(`div.ring-group${o ? '.open' : ''}`,
          h(`button.ring-title.rg-${n}`, { onclick: () => toggleOpen(key, refresh), 'aria-expanded': o },
            h('i'), h('span.rt-name', n === 0 ? pp.ringName(0) : `${n} · ${pp.ringName(n)}`),
            h('span.rt-sum', Object.keys(pp.STATES).filter((k) => counts[k]).map((k) => h('span', dot(k), counts[k]))),
            h('span.chev', icon('back', 16))),
          o && h('div.plist', inRing.map((p) => personLine(p))));
      }),
      list.length > 0 && legend(),
      h('a.link.rename', { href: '#/contact/ringe' }, 'Ringe benennen'),
    ], refresh),
  ];
}

// ---------- Reiter 2: Diese Woche ----------

function group(id, ic, title, items, refresh, empty, extra = null) {
  return box(id, ic, title, items.length, [extra, items.length ? h('div.plist', items) : h('p.small.muted', empty)], refresh, '.grp');
}

function weekTab(refresh) {
  const mon = weekStart();
  const { due, planned, done } = pp.thisWeek(mon);
  const total = due.length + done.length;
  const pct = total ? Math.round((done.length / total) * 100) : 100;
  const r = 30;
  const c = 2 * Math.PI * r;
  const bdays = pp.upcomingBirthdays(7);

  const dueRows = due.map(({ p, s }) => swipeRow(p, refresh,
    `${s.state === 'ueberfaellig' ? 'Überfällig' : s.state === 'bald_faellig' ? 'Bald fällig' : 'Diese Woche'} · ${pp.lineText(p, s)}`, s));
  const planRows = planned.map(({ p, s }) => swipeRow(p, refresh,
    `${planText(s.plan)}${s.plan.note ? ` · ${s.plan.note}` : ''}`, s));
  const doneRows = done.map(({ p, s, day }) => {
    const c2 = pp.contacts(p.id).find((x) => x.date === day);
    return personLine(p, `${pp.kindName(c2?.art)} · ${dayLabel(day)}${c2?.note ? ` · ${c2.note}` : ''}`, s);
  });

  return [
    h('section.card.week-head',
      h('div.wh-ring', h('span', { html: `<svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="${r}" class="t"/><circle cx="36" cy="36" r="${r}" class="v" stroke-dasharray="${(c * pct) / 100} ${c}" transform="rotate(-90 36 36)"/></svg>` }), h('b', `${pct}%`)),
      h('div.wh-text',
        h('p.small.muted', `KW ${isoWeek(mon)} · ${fmtShort(mon)}–${fmtShort(addDays(mon, 6))}`),
        h('h2', total ? `${done.length} von ${total} erledigt` : 'Alles im Rhythmus'),
        h('div.wh-nums',
          h('span', dot('ueberfaellig'), h('b', due.length), 'fällig'),
          h('span', dot('geplant'), h('b', planned.length), 'geplant'),
          h('span', dot('im_rhythmus'), h('b', done.length), 'erledigt'),
        ),
      ),
      bdays.length > 0 && h('p.wh-bday', icon('cake', 16), bdays.map(({ p, b }) => `${p.name} ${b.inDays === 0 ? 'heute' : b.inDays === 1 ? 'morgen' : `in ${b.inDays} Tagen`}`).join(' · ')),
    ),
    (due.length > 0 || planned.length > 0) && h('p.small.muted.swipe-hint', '→ Nach rechts wischen trägt den Standardkontakt für heute ein.'),
    group('due', 'heart', 'Fällig', dueRows, refresh, 'Niemand ist fällig – schön!'),
    group('planned', 'calendar', 'Geplant', planRows, refresh, 'Nichts geplant. Über „Eintragen“ → „Planen“ legst du etwas fest.',
      planned.length > 0 && h('button.btn.ghost.sm.cal-all', { onclick: () => toCalendar(planned.map(({ p, s }) => ({ p, plan: s.plan }))) }, icon('calendar', 16), 'Alle in Apple Kalender')),
    group('done', 'check', 'Erledigt', doneRows, refresh, 'Diese Woche noch kein Kontakt eingetragen.'),
  ];
}

// ---------- Reiter 3: Rückblick ----------

// Verlauf als Fläche: Anteil erledigt pro Woche, darunter Kontakte pro Woche.
function trendChart(rows) {
  const W = 340;
  const H = 168;
  const P = { l: 16, r: 16, t: 28, b: 30 };
  const n = rows.length;
  const x = (i) => (n === 1 ? W / 2 : P.l + (i * (W - P.l - P.r)) / (n - 1));
  const y = (v) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'trend-svg', role: 'img', 'aria-label': 'Wochen-Verlauf' });
  root.innerHTML = '<defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--contact)" stop-opacity=".32"/><stop offset="1" stop-color="var(--contact)" stop-opacity="0"/></linearGradient></defs>';
  for (const v of [0, 50, 100]) {
    root.append(svg('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'grid' }));
  }
  const pts = rows.map((r, i) => ({ ...r, i })).filter((r) => r.pct != null);
  if (pts.length > 1) {
    const line = pts.map((r) => `${x(r.i)},${y(r.pct)}`).join(' L ');
    root.append(svg('path', { d: `M ${x(pts[0].i)},${y(0)} L ${line} L ${x(pts[pts.length - 1].i)},${y(0)} Z`, fill: 'url(#trendFill)' }));
    root.append(svg('path', { d: `M ${line}`, class: 'tline' }));
  }
  const info = h('p.trend-info', ' ');
  const show = (r) => {
    info.textContent = `KW ${isoWeek(r.m)}: ${r.total ? `${r.done} von ${r.total} erledigt` : 'niemand fällig'} · ${r.n} ${r.n === 1 ? 'Kontakt' : 'Kontakte'}`;
    root.querySelectorAll('.tpt').forEach((c) => c.classList.toggle('on', +c.dataset.i === r.i));
  };
  rows.forEach((r, i) => {
    const lbl = svg('text', { x: x(i), y: H - 9, 'text-anchor': 'middle', class: 'axis' });
    lbl.textContent = `KW${isoWeek(r.m)}`;
    root.append(lbl);
    if (r.pct == null) return;
    const c = svg('circle', { cx: x(i), cy: y(r.pct), r: 5, class: 'tpt', 'data-i': i });
    root.append(c);
    const t = svg('text', { x: x(i), y: y(r.pct) - 10, 'text-anchor': 'middle', class: 'tval' });
    t.textContent = `${r.pct}%`;
    root.append(t);
  });
  root.addEventListener('pointerdown', (e) => {
    const b = root.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * W;
    let best = 0;
    rows.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    show({ ...rows[best], i: best });
  });
  if (rows.length) show({ ...rows[rows.length - 1], i: rows.length - 1 });
  return h('div.trend', root, info);
}

function reviewTab(refresh) {
  const cur = weekStart();
  const first = pp.firstContactDate();
  const weeks = [];
  if (first) {
    let m = weekStart(fromIso(first));
    if (+m < +addDays(cur, -7 * 7)) m = addDays(cur, -7 * 7);
    for (; +m <= +cur; m = addDays(m, 7)) weeks.push(m);
  }
  const rows = weeks.map((m) => {
    const wp = pp.weekPlan(m);
    return { m, ...wp, pct: wp.total ? Math.round((wp.done / wp.total) * 100) : null, n: pp.weekContacts(m).length };
  });
  const withPct = rows.filter((r) => r.pct != null);
  const avg = withPct.length ? Math.round(withPct.reduce((sum, r) => sum + r.pct, 0) / withPct.length) : null;
  const totalContacts = rows.reduce((sum, r) => sum + r.n, 0);
  const reach = pp.reachOut();

  const from = iso(addDays(cur, -7 * (logWeeks - 1)));
  const log = pp.contactLog(from);
  const groups = [];
  for (const e of log) {
    const m = iso(weekStart(fromIso(e.date)));
    let g = groups.find((x) => x.m === m);
    if (!g) groups.push((g = { m, list: [] }));
    g.list.push(e);
  }
  if (groups.length && !openWeeks.size) openWeeks.add(groups[0].m);

  return [
    box('verlauf', 'chart', 'Wochen-Verlauf', null, weeks.length
      ? [
        h('div.trend-stats',
          h('span', h('b', avg != null ? `${avg}%` : '–'), 'Ø erledigt'),
          h('span', h('b', totalContacts), 'Kontakte'),
          h('span', h('b', rows.length ? (totalContacts / rows.length).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '–'), 'pro Woche'),
        ),
        trendChart(rows),
      ]
      : h('p.small.muted', 'Sobald du Kontakte einträgst, entsteht hier dein Verlauf.'), refresh),
    box('reach', 'heart', 'Melde dich mal wieder', reach.length, [
      h('p.small.muted', 'Nach deinem eigenen Rhythmus ist es hier schon eine Weile her – ganz ohne Druck.'),
      reach.length
        ? h('div.plist', reach.map(({ p, s }) => h('button.pline', { onclick: () => goPerson(p.id) },
          avatar(p),
          h('span.pl-main', h('b', p.name), h('span.small.muted.block', `${pp.ringName(pp.ringOf(p))} · ${pp.rhythmShort(p.rhythm)}${pp.prio(p) === 'warte' ? ' · Warteliste' : ''}`)),
          h('span.since.over', s.since == null ? 'noch nie' : `seit ${s.since} Tagen`),
          h('span.chev-r', icon('back', 16)),
        )))
        : h('p.calm-ok', icon('check', 18), 'Alle sind in deinem Rhythmus. Schön!'),
    ], refresh),
    box('ringe', 'contact', 'Pro Ring im Rhythmus', null, pp.ringStats().map((r) => h(`div.part.rg-${r.n}`,
      h('span', r.n === 0 ? pp.ringName(0) : `${r.n} · ${pp.ringName(r.n)}`),
      h('span.muted', r.total ? `${r.ok}/${r.total}` : '–'),
      h('div.bar', h('i', { style: { width: `${r.total ? (r.ok / r.total) * 100 : 0}%` } })),
    )), refresh),
    box('tagebuch', 'pen', 'Kontakt-Tagebuch', log.length || null, [
      !groups.length && h('p.muted', `Keine Kontakte in den letzten ${logWeeks} Wochen eingetragen.`),
      groups.map((g) => {
        const o = openWeeks.has(g.m);
        return h(`div.tl-week${o ? '.open' : ''}`,
          h('button.tl-head', {
            onclick: () => {
              if (o) openWeeks.delete(g.m);
              else openWeeks.add(g.m);
              refresh();
            },
          }, h('b', `KW ${isoWeek(fromIso(g.m))}`), h('span.muted', `${fmtShort(fromIso(g.m))}–${fmtShort(addDays(fromIso(g.m), 6))}`), h('span.count', g.list.length), h('span.chev', icon('back', 16))),
          o && h('div.timeline', g.list.map((e) => h('div.tl-item',
            h(`span.tl-dot.rg-${pp.ringOf(e.p)}`, icon(pp.KINDS[e.art].icon, 13)),
            h('div.tl-body',
              h('div.tl-top', h('b', e.p.name), h('span.small.muted', `${pp.kindName(e.art)} · ${dayLabel(e.date)}`)),
              e.note && h('p.tl-note', e.note),
            ),
          ))),
        );
      }),
      logWeeks < 26 && groups.length > 0 && h('button.btn.ghost.full', {
        onclick: () => {
          logWeeks = logWeeks === 4 ? 12 : 26;
          refresh();
        },
      }, 'Ältere Wochen anzeigen'),
    ], refresh),
  ];
}

// ---------- Person ----------

function personView(id, refresh) {
  const p = pp.person(id);
  if (!p) return h('div.view.a-contact', back(), h('p.muted', 'Diese Person gibt es nicht mehr.'));
  const s = pp.status(p);
  const b = pp.nextBirthday(p.birthday);
  const list = pp.contacts(id).reverse().slice(0, 10);

  return h('div.view.a-contact.contact-view',
    back(),
    h('section.card.person-head',
      avatar(p, true),
      h('h1', p.name),
      h('p.muted', `${pp.ringName(pp.ringOf(p))} · ${pp.rhythmName(p.rhythm)}`),
      h(`span.spill.s-${s.state}`, dot(s.state), pp.STATES[s.state]),
      h('p.small.muted', s.since == null ? 'Noch kein Kontakt eingetragen' : `Letzter Kontakt ${pp.sinceText(s.since)}`),
      b && h('p.small.muted', `🎂 ${pp.birthdayText(p.birthday)} · ${b.inDays === 0 ? 'heute!' : `in ${b.inDays} Tagen`}${b.age ? ` (wird ${b.age})` : ''}`),
      h('button.btn.primary.full', { onclick: () => openSheet(p, refresh) }, icon('plus', 18), 'Eintragen'),
    ),
    s.plan && h('section.card.plan-card',
      secTitle('calendar', 'Geplant'),
      h('p', h('b', planText(s.plan))),
      s.plan.note && h('p.small.muted', s.plan.note),
      h('div.buttons',
        h('button.btn.ghost.sm', { onclick: () => toCalendar([{ p, plan: s.plan }]) }, icon('calendar', 16), 'In Apple Kalender'),
        h('button.btn.ghost.sm', { onclick: () => { pp.clearPlan(id); refresh(); } }, 'Plan entfernen'),
      ),
    ),
    p.notes && h('section.card', secTitle('pen', 'Notizen'), h('p.notes', p.notes)),
    h('section.card',
      secTitle('list', 'Letzte Kontakte'),
      !list.length && h('p.small.muted', 'Noch keine eingetragen.'),
      list.length > 0 && h('div.timeline', list.map((c) => h('div.tl-item',
        h(`span.tl-dot.rg-${pp.ringOf(p)}`, icon(pp.KINDS[c.art].icon, 13)),
        h('div.tl-body',
          h('div.tl-top', h('b', pp.kindName(c.art)), h('span.small.muted', dayLabel(c.date))),
          c.note && h('p.tl-note', c.note),
        ),
        h('button.pill.del.small', {
          'aria-label': 'Eintrag löschen',
          onclick: () => {
            if (!confirm(`Eintrag vom ${dayLabel(c.date)} löschen?`)) return;
            pp.removeContact(id, c.date);
            refresh();
          },
        }, icon('close', 14)),
      ))),
    ),
    editForm(p, refresh),
  );
}

// ---------- Hinzufügen / Bearbeiten ----------

function editView(refresh) {
  return h('div.view.a-contact.contact-view', back(), h('header.hero', h('h1', 'Neue Person')), editForm(null, refresh));
}

function editForm(p, refresh) {
  let ring = p ? pp.ringOf(p) : 3;
  let prio = p ? pp.prio(p) : 'normal';
  let art = p ? pp.defaultKind(p) : 'getroffen';
  let artTouched = !!p;
  let rhythm = p ? (p.rhythm ?? 0) : pp.RING_RHYTHM[ring];
  let rhythmTouched = !!p;
  const name = h('input.input', { placeholder: 'Name', value: p?.name || '', autocapitalize: 'words' });
  const bday = h('input.input', { placeholder: 'z. B. 14.3. oder 14.3.1995', inputmode: 'numeric', value: p?.birthday ? pp.birthdayText(p.birthday) : '' });
  const notes = h('textarea.input', { rows: 3, placeholder: 'Was dir wichtig ist: Interessen, Kinder, letzte Themen …', value: p?.notes || '' });
  const custom = h('input.input.days', {
    inputmode: 'numeric',
    placeholder: 'eigene',
    oninput: (e) => {
      const v = parseInt(e.target.value, 10);
      if (v > 0) {
        rhythm = v;
        rhythmTouched = true;
        paint(false);
      }
    },
  });
  const ringBox = h('div.segs.wrap');
  const artBox = h('div.chips');
  const prioBox = h('div.segs');
  const prioHint = h('p.small.muted');
  const rhythmBox = h('div.chips');
  const paint = (syncCustom = true) => {
    ringBox.replaceChildren(...RINGS.map((n) => h(`button.seg${ring === n ? '.on' : ''}`, {
      onclick: () => {
        ring = n;
        if (!rhythmTouched) rhythm = pp.RING_RHYTHM[n];
        if (!artTouched) art = n === 0 ? 'date' : 'getroffen';
        paint();
      },
    }, n === 0 ? `♥ ${pp.ringName(0)}` : `${n} · ${pp.ringName(n)}`)));
    artBox.replaceChildren(...Object.entries(pp.KINDS).map(([id, k]) => h(`button.chip${art === id ? '.on' : ''}`, { onclick: () => { art = id; artTouched = true; paint(); } }, k.name)));
    prioBox.replaceChildren(...pp.PRIOS.map((x) => h(`button.seg${prio === x.id ? '.on' : ''}`, { onclick: () => { prio = x.id; paint(); } }, x.name)));
    prioHint.textContent = pp.PRIOS.find((x) => x.id === prio).hint;
    rhythmBox.replaceChildren(...pp.RHYTHMS.map((r) => h(`button.chip${rhythm === r.days ? '.on' : ''}`, {
      onclick: () => {
        rhythm = r.days;
        rhythmTouched = true;
        custom.value = '';
        paint();
      },
    }, r.name)));
    if (syncCustom) custom.value = pp.RHYTHMS.some((r) => r.days === rhythm) ? '' : rhythm;
  };
  paint();

  return h('section.card',
    p && secTitle('settings', 'Bearbeiten'),
    h('label.field', h('span', 'Name'), name),
    h('div.field', h('span', 'Ring – wie nah steht ihr euch?'), ringBox),
    h('div.field', h('span', 'Wie oft?'), rhythmBox,
      h('div.daysrow', h('span.small.muted', 'oder alle'), custom, h('span.small.muted', 'Tage'))),
    h('div.field', h('span', 'Standardkontakt'), artBox, h('p.small.muted', 'Wird eingetragen, wenn du in „Diese Woche“ nach rechts wischst – z. B. Telefoniert für die Eltern, Date Night für deinen Partner.')),
    h('div.field', h('span', 'Priorität'), prioBox, prioHint),
    h('label.field', h('span', 'Geburtstag (Jahr optional)'), bday),
    h('label.field', h('span', 'Notizen'), notes),
    h('div.buttons',
      h('button.btn.primary', {
        onclick: () => {
          if (!name.value.trim()) return toast('Bitte einen Namen eintragen.');
          const b = pp.parseBirthday(bday.value);
          if (b === null) return toast('Geburtstag bitte als TT.MM. oder TT.MM.JJJJ eingeben.', 'error');
          const id = pp.savePerson(p?.id, { name: name.value.trim(), ring, art, prio, rhythm, birthday: b, notes: notes.value.trim() });
          toast(p ? 'Gespeichert' : `${name.value.trim()} hinzugefügt`);
          if (p) refresh();
          else goPerson(id);
        },
      }, p ? 'Speichern' : 'Hinzufügen'),
      p && h('button.btn.danger', {
        onclick: () => {
          if (!confirm(`${p.name} wirklich entfernen?`)) return;
          pp.deletePerson(p.id);
          location.hash = '#/contact';
        },
      }, 'Entfernen'),
    ),
  );
}

// ---------- Ringe ----------

function ringsView() {
  const inputs = RINGS.map((n) => ({ n, el: h('input.input', { value: pp.ringName(n) }) }));
  return h('div.view.a-contact.contact-view',
    back(),
    h('header.hero', h('h1', 'Deine Ringe')),
    h('section.card',
      h('p.muted', 'Ring 1 ist dir am nächsten. Gib den Ringen Namen, die für dich passen.'),
      inputs.map(({ n, el }) => h('label.field', h('span', n === 0 ? 'Mitte (bei dir)' : `Ring ${n}`), el)),
      h('div.buttons', h('button.btn.primary', {
        onclick: () => {
          for (const { n, el } of inputs) pp.setRingName(n, el.value.trim());
          toast('Gespeichert');
          location.hash = '#/contact/karte';
        },
      }, 'Speichern')),
    ),
  );
}
