// Bereich Contact mit drei Reitern: Karte (Kreis), Diese Woche (Fokus), Rückblick.
// Ton: ruhig, freundlich, ohne Schuldgefühle.
import * as pp from '../people.js';
import { h, icon, toast, iso, fromIso, addDays, weekStart, isoWeek, WD_SHORT, fmtShort } from '../ui.js';

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

// Zuletzt gewählter Reiter – reine Ansichtssache, pro Gerät.
function lastTab() {
  try {
    return localStorage.getItem('life4.contactTab') || 'karte';
  } catch {
    return 'karte';
  }
}

let showWaitlist = false;
let logWeeks = 4;

export function render(sub, refresh) {
  if (sub === 'neu') return editView(refresh);
  if (sub === 'ringe') return ringsView();
  if (sub.startsWith('p-')) return personView(sub.slice(2), refresh);
  const tab = TABS.some((t) => t.id === sub) ? sub : lastTab();
  try {
    localStorage.setItem('life4.contactTab', tab);
  } catch { /* egal */ }
  const views = { karte: mapTab, woche: weekTab, rueckblick: reviewTab };
  return h('div.view.a-contact',
    h('div.segs.ctabs', TABS.map((t) => h(`a.seg${t.id === tab ? '.on' : ''}`, { href: `#/contact/${t.id}` }, t.name))),
    views[tab](refresh),
  );
}

function secTitle(ic, text, right) {
  return h('div.sec-title', h('span.sec-icon', icon(ic, 18)), h('h2', text), right || null);
}

function back() {
  return h('a.backlink', { href: '#/contact' }, icon('back', 18), 'Contact');
}

const goPerson = (id) => { location.hash = `#/contact/p-${id}`; };

function prioTag(p) {
  const pr = pp.prio(p);
  return pr === 'normal' ? null : h(`span.prio.prio-${pr}`, pp.prioName(pr));
}

// Zeile mit Schnell-Aktionen (überall gleich).
function personRow(p, refresh, subText) {
  const s = pp.status(p);
  const today = pp.hadContactOn(p.id, iso());
  const chip = (kind, label) => h(`button.tchip${pp.flag(kind, p.id) ? '.on' : ''}`, {
    onclick: () => {
      pp.toggleFlag(kind, p.id);
      refresh();
    },
  }, pp.flag(kind, p.id) ? icon('check', 14) : null, label);
  const sub = subText ?? `${s.since == null ? 'Noch kein Kontakt eingetragen' : `Kontakt ${pp.sinceText(s.since)}`}${p.rhythm ? ` · ${pp.rhythmName(p.rhythm)}` : ''}`;
  return h(`div.person.st-${s.state}`,
    h('button.person-top', { onclick: () => goPerson(p.id) },
      h('span.avatar', pp.initials(p.name)),
      h('span.hint-main', h('b', p.name, prioTag(p)), h('span.small.muted.block', sub)),
    ),
    h('div.person-actions',
      h(`button.tchip.contact${today ? '.on' : ''}`, {
        onclick: () => {
          pp.toggleContact(p.id);
          if (!today) toast(`Schön – Kontakt mit ${p.name} eingetragen`);
          refresh();
        },
      }, today ? 'Kontakt: heute' : 'Kontakt gehabt'),
      chip('gemeldet', 'Gemeldet'),
      chip('treffen', 'Treffen geplant'),
    ),
  );
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
  const R = [0, 58, 102, 146, 188];
  const root = svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'circle-svg', role: 'img', 'aria-label': 'Dein Kreis' });
  const rings = {};
  for (let n = 4; n >= 1; n--) {
    rings[n] = svg('circle', { cx: C, cy: C, r: R[n], class: `ring ring-${n}` });
    root.append(rings[n]);
  }
  root.append(svg('circle', { cx: C, cy: C, r: 22, class: 'me' }));
  const me = svg('text', { x: C, y: C + 5, 'text-anchor': 'middle', class: 'me-t' });
  me.textContent = 'Ich';
  root.append(me);

  // Welcher Ring liegt bei diesem Abstand zur Mitte?
  const ringAt = (dist) => {
    if (dist > R[4] + 40) return null;
    for (let n = 1; n < 4; n++) if (dist < (R[n] + R[n + 1]) / 2) return n;
    return 4;
  };
  const toSvg = (e) => new DOMPoint(e.clientX, e.clientY).matrixTransform(root.getScreenCTM().inverse());

  // Platzierung: Jeder Ring wird so gedreht, dass sich die Namen möglichst nicht
  // überdecken (mit inneren Ringen, untereinander und mit „Ich“ in der Mitte).
  const placed = [{ x: C, y: C, w: 48, h: 48 }];
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2))
    * Math.max(0, Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2));
  const layout = [];
  for (let n = 1; n <= 4; n++) {
    const inRing = list.filter((p) => (p.ring || 4) === n);
    const count = inRing.length;
    if (!count) continue;
    const size = count > 10 ? 10 : 11.5;
    const dims = inRing.map((p) => ({ w: textWidth(p.name, size) + 18, h: size + 11 }));
    const crowded = dims.reduce((sum, d) => sum + d.w, 0) > 2 * Math.PI * R[n] * 0.9;
    const at = (off) => inRing.map((p, i) => {
      const a = (off + (360 / count) * i) * (Math.PI / 180);
      const rr = R[n] + (crowded ? (i % 2 ? 11 : -11) : 0);
      return { p, x: C + rr * Math.cos(a), y: C + rr * Math.sin(a), ...dims[i], size };
    });
    let best = null;
    for (let off = -90; off < 270; off += 4) {
      const pos = at(off);
      let cost = 0;
      pos.forEach((a, i) => {
        for (const b of placed) cost += overlap(a, b);
        for (let j = i + 1; j < pos.length; j++) cost += overlap(a, pos[j]);
        cost += 50 * (Math.max(0, a.w / 2 - a.x) + Math.max(0, a.x + a.w / 2 - S)); // nicht über den Rand
      });
      if (!best || cost < best.cost - 0.5) best = { cost, pos };
    }
    placed.push(...best.pos);
    layout.push(...best.pos.map((x) => ({ ...x, n })));
  }

  for (const { p, x, y, w, h: ht, size, n } of layout) {
    const st = pp.status(p).state;
    const g = svg('g', { class: `bubble st-${st} pr-${pp.prio(p)}`, role: 'button', 'aria-label': p.name });
    g.append(svg('rect', { x: x - w / 2, y: y - ht / 2, width: w, height: ht, rx: ht / 2 }));
    const t = svg('text', { x, y: y + size * 0.36, 'text-anchor': 'middle', 'font-size': size });
    t.textContent = p.name;
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
      for (let k = 1; k <= 4; k++) rings[k].classList.toggle('target', k === drag.target && k !== n);
    });
    const end = () => {
      if (!drag) return;
      const { moved, target } = drag;
      drag = null;
      g.classList.remove('dragging');
      for (let k = 1; k <= 4; k++) rings[k].classList.remove('target');
      if (!moved) return goPerson(p.id);
      if (target && target !== n) {
        const { id, ...data } = p;
        pp.savePerson(id, { ...data, ring: target });
        toast(`${p.name} → ${pp.ringName(target)}`);
      }
      refresh();
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', () => {
      drag = null;
      refresh();
    });
    root.append(g);
  }
  return root;
}

function mapTab(refresh) {
  const list = pp.people();
  return [
    h('section.contact-hero',
      h('div.row.between',
        h('div', h('h1', 'Dein Kreis'), h('p.ch-sub', list.length ? 'Ziehen zum Verschieben · Tippen zum Öffnen' : 'Füge die Menschen hinzu, die dir wichtig sind.')),
        h('a.navbtn', { href: '#/contact/neu', 'aria-label': 'Person hinzufügen' }, icon('plus', 22)),
      ),
      h('div.circle-wrap', circle(list, refresh)),
      h('div.ring-legend',
        [1, 2, 3, 4].map((n) => h('span', h('b', n), pp.ringName(n), h('i', list.filter((p) => (p.ring || 4) === n).length))),
      ),
      list.length > 0 && h('div.map-key',
        h('span', h('i.k-hoch'), 'Prio hoch'),
        h('span', h('i.k-warte'), 'Warteliste'),
        h('span', h('i.k-due'), 'Schon eine Weile her'),
      ),
    ),
    h('section.card',
      secTitle('contact', 'Deine Menschen', h('a.link', { href: '#/contact/ringe' }, 'Ringe benennen')),
      !list.length && h('p.muted', 'Noch niemand eingetragen. Fang mit Mama und Papa an – oben auf + tippen.'),
      [1, 2, 3, 4].map((n) => {
        const inRing = list.filter((p) => (p.ring || 4) === n);
        if (!inRing.length) return null;
        return h('div.ring-group', h('p.goalarea', `${n} · ${pp.ringName(n)}`), inRing.map((p) => personRow(p, refresh)));
      }),
      h('a.btn.soft.full', { href: '#/contact/neu' }, icon('plus', 18), 'Person hinzufügen'),
    ),
  ];
}

// ---------- Reiter 2: Diese Woche ----------

function weekTab(refresh) {
  const mon = weekStart();
  const plan = pp.weekPlan(mon);
  const by = (st) => plan.items.filter((x) => x.state === st);
  const over = by('ueberfaellig');
  const dran = by('dran');
  const done = [...by('erledigt'), ...plan.extra];
  const wait = pp.people().filter((p) => pp.prio(p) === 'warte');
  const bdays = pp.upcomingBirthdays(14);
  const pct = plan.total ? Math.round((plan.done / plan.total) * 100) : 0;
  const dueText = (x) => {
    if (pp.prio(x.p) === 'hoch' && !x.p.rhythm) return 'Prio hoch';
    if (!x.last) return `Noch kein Kontakt eingetragen · ${pp.rhythmName(x.p.rhythm)}`;
    const d = fromIso(x.due);
    return `${x.due < iso() ? 'Fällig seit' : 'Fällig'} ${WD_SHORT[d.getDay()]} ${fmtShort(d)} · ${pp.rhythmName(x.p.rhythm)}`;
  };

  return [
    h('section.card.wk-stats',
      h('div.row.between', h('h2', `KW ${isoWeek(mon)}`), h('span.count', `${plan.done}/${plan.total} erledigt`)),
      h('div.bar.big', h('i', { style: { width: `${pct}%` } })),
      h('div.wk-nums',
        h('span', h('b', over.length), 'überfällig'),
        h('span', h('b', dran.length), 'dran'),
        h('span', h('b', done.length), 'erledigt'),
      ),
      !plan.total && h('p.small.muted', 'Diese Woche ist niemand fällig. Personen mit Prio „Hoch“ erscheinen hier immer.'),
    ),
    bdays.length > 0 && h('section.card',
      secTitle('cake', 'Geburtstage'),
      bdays.map(({ p, b }) => h('button.hint-row', { onclick: () => goPerson(p.id) },
        h('span.avatar', pp.initials(p.name)),
        h('span.hint-main', h('b', p.name), h('span.small.muted.block',
          `${b.inDays === 0 ? 'Heute! 🎉' : b.inDays === 1 ? 'Morgen' : `in ${b.inDays} Tagen`} · ${WD_SHORT[b.date.getDay()]} ${fmtShort(b.date)}${b.age ? ` · wird ${b.age}` : ''}`)),
      )),
    ),
    over.length > 0 && h('section.card',
      secTitle('heart', 'Schon eine Weile her'),
      h('p.small.muted', 'Kein Muss – nur eine freundliche Erinnerung.'),
      over.map((x) => personRow(x.p, refresh, dueText(x))),
    ),
    dran.length > 0 && h('section.card',
      secTitle('calendar', 'Diese Woche dran'),
      dran.map((x) => personRow(x.p, refresh, dueText(x))),
    ),
    done.length > 0 && h('section.card.calm',
      secTitle('check', 'Erledigt'),
      done.map((x) => personRow(x.p, refresh, `Kontakt am ${WD_SHORT[fromIso(x.day).getDay()]} ${fmtShort(fromIso(x.day))}`)),
    ),
    h(`section.card.collapsible${showWaitlist ? '.open' : ''}`,
      h('button.sec-title.sec-toggle', { onclick: () => { showWaitlist = !showWaitlist; refresh(); }, 'aria-expanded': showWaitlist },
        h('span.sec-icon', icon('list', 18)), h('h2', `Warteliste (${wait.length})`), h('span.chev', icon('back', 18))),
      showWaitlist && [
        h('p.small.muted', 'Diese Menschen tauchen nicht im Wochenplan auf. Hochstufen holt sie zurück.'),
        !wait.length && h('p.muted', 'Niemand auf der Warteliste.'),
        wait.map((p) => h('div.hint-row',
          h('button.hint-tap', { onclick: () => goPerson(p.id) },
            h('span.avatar', pp.initials(p.name)),
            h('span.hint-main', h('b', p.name), h('span.small.muted.block', `${pp.ringName(p.ring || 4)} · Kontakt ${pp.sinceText(pp.status(p).since)}`))),
          h('button.btn.ghost.sm', {
            onclick: () => {
              const { id, ...data } = p;
              pp.savePerson(id, { ...data, prio: 'normal' });
              toast(`${p.name} ist zurück im Plan`);
              refresh();
            },
          }, 'Hochstufen'),
        )),
      ],
    ),
  ];
}

// ---------- Reiter 3: Rückblick ----------

function reviewTab(refresh) {
  const cur = weekStart();
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(cur, -7 * (7 - i)));
  const plans = weeks.map((m) => ({ m, plan: pp.weekPlan(m), all: pp.weekContacts(m).length }));
  const maxT = Math.max(1, ...plans.map((x) => Math.max(x.plan.total, x.all)));
  const from = iso(addDays(cur, -7 * (logWeeks - 1)));
  const log = pp.contactLog(from);
  const groups = [];
  for (const e of log) {
    const m = iso(weekStart(fromIso(e.d)));
    let g = groups.find((x) => x.m === m);
    if (!g) groups.push((g = { m, list: [] }));
    g.list.push(e);
  }

  return [
    h('section.card',
      secTitle('chart', 'Wochen-Verlauf'),
      h('p.small.muted', 'Erledigt von „dran“ pro Woche (die letzten 8 Wochen).'),
      h('div.wbars', plans.map(({ m, plan }) => h('div.wbar',
        h('span.small', plan.total ? `${plan.done}/${plan.total}` : '–'),
        h('div.wbar-track', { style: { height: `${(plan.total / maxT) * 100}%` } },
          h('i', { style: { height: `${plan.total ? (plan.done / plan.total) * 100 : 0}%` } })),
        h('span.small.muted', `KW${isoWeek(m)}`),
      ))),
    ),
    h('section.card',
      secTitle('contact', 'Pro Ring im Rhythmus'),
      pp.ringStats().map((r) => h('div.part',
        h('span', `${r.n} · ${pp.ringName(r.n)}`),
        h('span.muted', r.total ? `${r.ok}/${r.total}` : '–'),
        h('div.bar', h('i', { style: { width: `${r.total ? (r.ok / r.total) * 100 : 0}%` } })),
      )),
    ),
    h('section.card',
      secTitle('heart', 'Am längsten kein Kontakt'),
      pp.longestWithout(8).map(({ p, since }) => h('button.hint-row', { onclick: () => goPerson(p.id) },
        h('span.avatar', pp.initials(p.name)),
        h('span.hint-main', h('b', p.name, prioTag(p)), h('span.small.muted.block', `${since == null ? 'Noch kein Kontakt eingetragen' : `Kontakt ${pp.sinceText(since)}`} · ${pp.ringName(p.ring || 4)}`)),
      )),
      !pp.people().length && h('p.muted', 'Noch niemand eingetragen.'),
    ),
    h('section.card',
      secTitle('pen', 'Kontakt-Tagebuch'),
      !groups.length && h('p.muted', `Keine Kontakte in den letzten ${logWeeks} Wochen eingetragen.`),
      groups.map((g) => h('div.logweek',
        h('p.goalarea', `KW ${isoWeek(fromIso(g.m))} · ${fmtShort(fromIso(g.m))}–${fmtShort(addDays(fromIso(g.m), 6))}`),
        g.list.map((e) => h('div.logrow', h('span.muted', `${WD_SHORT[fromIso(e.d).getDay()]} ${fmtShort(fromIso(e.d))}`), h('b', e.p.name))),
      )),
      logWeeks < 26 && h('button.btn.ghost.full', {
        onclick: () => {
          logWeeks = logWeeks === 4 ? 12 : 26;
          refresh();
        },
      }, 'Ältere Wochen anzeigen'),
    ),
  ];
}

// ---------- Person ----------

function personView(id, refresh) {
  const p = pp.person(id);
  if (!p) return h('div.view.a-contact', back(), h('p.muted', 'Diese Person gibt es nicht mehr.'));
  const s = pp.status(p);
  const b = pp.nextBirthday(p.birthday);
  const dates = pp.contactDates(id).slice(-6).reverse();
  const other = h('input.input', { type: 'date', max: iso() });

  return h('div.view.a-contact',
    back(),
    h('section.card.person-head',
      h('span.avatar.big', pp.initials(p.name)),
      h('h1', p.name),
      h('p.muted', `${pp.ringName(p.ring || 4)} · ${pp.rhythmName(p.rhythm)} · Prio ${pp.prioName(pp.prio(p))}`),
      h('p.small.muted', s.since == null ? 'Noch kein Kontakt eingetragen' : `Letzter Kontakt ${pp.sinceText(s.since)}`),
      b && h('p.small.muted', `Geburtstag ${pp.birthdayText(p.birthday)} · ${b.inDays === 0 ? 'heute 🎉' : `in ${b.inDays} Tagen`}${b.age ? ` (wird ${b.age})` : ''}`),
      h('div.person-actions.center',
        h(`button.tchip.contact${pp.hadContactOn(id, iso()) ? '.on' : ''}`, { onclick: () => { pp.toggleContact(id); refresh(); } }, pp.hadContactOn(id, iso()) ? 'Kontakt: heute' : 'Kontakt gehabt'),
        h(`button.tchip${pp.flag('gemeldet', id) ? '.on' : ''}`, { onclick: () => { pp.toggleFlag('gemeldet', id); refresh(); } }, 'Gemeldet'),
        h(`button.tchip${pp.flag('treffen', id) ? '.on' : ''}`, { onclick: () => { pp.toggleFlag('treffen', id); refresh(); } }, 'Treffen geplant'),
      ),
    ),
    p.notes && h('section.card', secTitle('pen', 'Notizen'), h('p.notes', p.notes)),
    h('section.card',
      secTitle('calendar', 'Letzte Kontakte'),
      dates.length ? h('div.chips', dates.map((d) => h('span.datechip', `${WD_SHORT[fromIso(d).getDay()]} ${fmtShort(fromIso(d))}`))) : h('p.small.muted', 'Noch keine eingetragen.'),
      h('div.editrow.add2', other, h('button.pill.add', {
        'aria-label': 'Kontakt an diesem Tag eintragen',
        onclick: () => {
          if (!other.value) return toast('Bitte ein Datum wählen.');
          if (!pp.hadContactOn(id, other.value)) pp.toggleContact(id, other.value);
          toast('Kontakt eingetragen');
          refresh();
        },
      }, icon('plus', 20))),
      h('p.small.muted', 'Früheren Kontakt nachtragen.'),
    ),
    editForm(p, refresh),
  );
}

// ---------- Hinzufügen / Bearbeiten ----------

function editView(refresh) {
  return h('div.view.a-contact', back(), h('header.hero', h('h1', 'Neue Person')), editForm(null, refresh));
}

function editForm(p, refresh) {
  let ring = p?.ring || 3;
  let prio = p ? pp.prio(p) : 'normal';
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
  const prioBox = h('div.segs');
  const prioHint = h('p.small.muted');
  const rhythmBox = h('div.chips');
  const paint = (syncCustom = true) => {
    ringBox.replaceChildren(...[1, 2, 3, 4].map((n) => h(`button.seg${ring === n ? '.on' : ''}`, {
      onclick: () => {
        ring = n;
        if (!rhythmTouched) rhythm = pp.RING_RHYTHM[n];
        paint();
      },
    }, `${n} · ${pp.ringName(n)}`)));
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
    h('div.field', h('span', 'Priorität'), prioBox, prioHint),
    h('div.field', h('span', 'Wie oft möchtest du dich melden?'), rhythmBox,
      h('div.daysrow', h('span.small.muted', 'oder alle'), custom, h('span.small.muted', 'Tage'))),
    h('label.field', h('span', 'Geburtstag (Jahr optional)'), bday),
    h('label.field', h('span', 'Notizen'), notes),
    h('div.buttons',
      h('button.btn.primary', {
        onclick: () => {
          if (!name.value.trim()) return toast('Bitte einen Namen eintragen.');
          const b = pp.parseBirthday(bday.value);
          if (b === null) return toast('Geburtstag bitte als TT.MM. oder TT.MM.JJJJ eingeben.', 'error');
          const id = pp.savePerson(p?.id, { name: name.value.trim(), ring, prio, rhythm, birthday: b, notes: notes.value.trim() });
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
  const inputs = [1, 2, 3, 4].map((n) => ({ n, el: h('input.input', { value: pp.ringName(n) }) }));
  return h('div.view.a-contact',
    back(),
    h('header.hero', h('h1', 'Deine Ringe')),
    h('section.card',
      h('p.muted', 'Ring 1 ist dir am nächsten. Gib den Ringen Namen, die für dich passen.'),
      inputs.map(({ n, el }) => h('label.field', h('span', `Ring ${n}`), el)),
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
