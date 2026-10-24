// Bereich Contact: dein Kreis, sanfte Hinweise, deine Menschen, Person bearbeiten.
// Ton: ruhig, freundlich, ohne Schuldgefühle.
import * as pp from '../people.js';
import { h, icon, toast, iso, fromIso, WD_SHORT, fmtShort } from '../ui.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

export function render(sub, refresh) {
  if (sub === 'neu') return editView(null, refresh);
  if (sub === 'ringe') return ringsView();
  if (sub.startsWith('p-')) return personView(sub.slice(2), refresh);
  return mainView(refresh);
}

function secTitle(ic, text, right) {
  return h('div.sec-title', h('span.sec-icon', icon(ic, 18)), h('h2', text), right || null);
}

function back() {
  return h('a.backlink', { href: '#/contact' }, icon('back', 18), 'Contact');
}

const goPerson = (id) => { location.hash = `#/contact/p-${id}`; };

// ---------- Übersicht ----------

function mainView(refresh) {
  const list = pp.people();
  return h('div.view.a-contact',
    circleCard(list),
    hintsCard(refresh),
    peopleCard(list, refresh),
  );
}

function circleCard(list) {
  const S = 360;
  const C = S / 2;
  const R = [0, 50, 86, 122, 158];
  const root = svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'circle-svg', role: 'img', 'aria-label': 'Dein Kreis' });
  for (let n = 4; n >= 1; n--) {
    root.append(svg('circle', { cx: C, cy: C, r: R[n], class: `ring ring-${n}` }));
  }
  for (let n = 1; n <= 4; n++) {
    const inRing = list.filter((p) => (p.ring || 4) === n);
    const count = inRing.length;
    const r = Math.max(9, Math.min(15, (Math.PI * R[n]) / Math.max(count, 1) - 3));
    inRing.forEach((p, i) => {
      const a = (-90 + n * 23 + (360 / count) * i) * (Math.PI / 180);
      const x = C + R[n] * Math.cos(a);
      const y = C + R[n] * Math.sin(a);
      const st = pp.status(p).state;
      const g = svg('g', { class: `bubble st-${st}`, tabindex: 0, role: 'button', 'aria-label': p.name });
      g.append(svg('circle', { cx: x, cy: y, r }));
      const t = svg('text', { x, y: y + r * 0.32, 'text-anchor': 'middle', 'font-size': r * 0.82 });
      t.textContent = pp.initials(p.name);
      g.append(t);
      g.addEventListener('click', () => goPerson(p.id));
      root.append(g);
    });
  }
  root.append(svg('circle', { cx: C, cy: C, r: 24, class: 'me' }));
  const me = svg('text', { x: C, y: C + 5, 'text-anchor': 'middle', class: 'me-t' });
  me.textContent = 'Ich';
  root.append(me);

  return h('section.contact-hero',
    h('div.row.between',
      h('div', h('h1', 'Dein Kreis'), h('p.ch-sub', list.length ? `${list.length} ${list.length === 1 ? 'Mensch' : 'Menschen'} um dich` : 'Füge die Menschen hinzu, die dir wichtig sind.')),
      h('a.navbtn', { href: '#/contact/neu', 'aria-label': 'Person hinzufügen' }, icon('plus', 22)),
    ),
    h('div.circle-wrap', root),
    h('div.ring-legend',
      [1, 2, 3, 4].map((n) => h('span', h('b', n), pp.ringName(n), h('i', list.filter((p) => (p.ring || 4) === n).length))),
    ),
    list.some((p) => pp.status(p).state === 'faellig') && h('p.ch-note', h('span.dot'), 'Schon eine Weile her – vielleicht magst du dich melden.'),
  );
}

function hintsCard(refresh) {
  const bdays = pp.upcomingBirthdays(30);
  const due = pp.people()
    .map((p) => ({ p, s: pp.status(p) }))
    .filter((x) => x.s.state === 'faellig')
    .sort((a, b) => (b.s.over ?? 999) - (a.s.over ?? 999));
  if (!bdays.length && !due.length) {
    if (!pp.people().length) return null;
    return h('section.card.calm', secTitle('heart', 'Alles im grünen Bereich'), h('p.muted', 'Du bist mit deinen Menschen gut in Kontakt. Schön!'));
  }
  return h('section.card',
    bdays.length > 0 && [
      secTitle('cake', 'Geburtstage'),
      bdays.map(({ p, b }) => h('button.hint-row', { onclick: () => goPerson(p.id) },
        h('span.avatar', pp.initials(p.name)),
        h('span.hint-main', h('b', p.name), h('span.small.muted.block',
          `${b.inDays === 0 ? 'Heute! 🎉' : b.inDays === 1 ? 'Morgen' : `in ${b.inDays} Tagen`} · ${WD_SHORT[b.date.getDay()]} ${fmtShort(b.date)}${b.age ? ` · wird ${b.age}` : ''}`)),
      )),
    ],
    due.length > 0 && [
      secTitle('heart', 'Schon eine Weile her'),
      h('p.small.muted', 'Kein Muss – nur eine freundliche Erinnerung.'),
      due.map(({ p, s }) => h('div.hint-row',
        h('button.hint-tap', { onclick: () => goPerson(p.id) },
          h('span.avatar', pp.initials(p.name)),
          h('span.hint-main', h('b', p.name), h('span.small.muted.block', `${s.since == null ? 'Noch kein Kontakt eingetragen' : `Letzter Kontakt ${pp.sinceText(s.since)}`} · ${pp.rhythmName(p.rhythm)}`))),
        h('button.btn.ghost.sm', {
          onclick: () => {
            pp.toggleContact(p.id);
            toast(`Schön – Kontakt mit ${p.name} eingetragen`);
            refresh();
          },
        }, 'Kontakt gehabt'),
      )),
    ],
  );
}

function personRow(p, refresh) {
  const s = pp.status(p);
  const today = pp.hadContactOn(p.id, iso());
  const chip = (kind, label) => h(`button.tchip${pp.flag(kind, p.id) ? '.on' : ''}`, {
    onclick: () => {
      pp.toggleFlag(kind, p.id);
      refresh();
    },
  }, pp.flag(kind, p.id) ? icon('check', 14) : null, label);
  return h(`div.person.st-${s.state}`,
    h('button.person-top', { onclick: () => goPerson(p.id) },
      h('span.avatar', pp.initials(p.name)),
      h('span.hint-main', h('b', p.name), h('span.small.muted.block',
        `${s.since == null ? 'Noch kein Kontakt eingetragen' : `Kontakt ${pp.sinceText(s.since)}`}${p.rhythm ? ` · ${pp.rhythmName(p.rhythm)}` : ''}`)),
      s.state === 'faellig' && h('span.dot'),
    ),
    h('div.person-actions',
      h(`button.tchip.contact${today ? '.on' : ''}`, {
        onclick: () => {
          pp.toggleContact(p.id);
          if (!today) toast(`Kontakt mit ${p.name} eingetragen`);
          refresh();
        },
      }, today ? 'Kontakt: heute' : 'Kontakt gehabt'),
      chip('gemeldet', 'Gemeldet'),
      chip('treffen', 'Treffen geplant'),
    ),
  );
}

function peopleCard(list, refresh) {
  return h('section.card',
    secTitle('contact', 'Deine Menschen', h('a.link', { href: '#/contact/ringe' }, 'Ringe benennen')),
    !list.length && h('p.muted', 'Noch niemand eingetragen. Fang mit Mama und Papa an – oben auf + tippen.'),
    [1, 2, 3, 4].map((n) => {
      const inRing = list.filter((p) => (p.ring || 4) === n);
      if (!inRing.length) return null;
      return h('div.ring-group', h('p.goalarea', `${n} · ${pp.ringName(n)}`), inRing.map((p) => personRow(p, refresh)));
    }),
    h('a.btn.soft.full', { href: '#/contact/neu' }, icon('plus', 18), 'Person hinzufügen'),
  );
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
      h('p.muted', `${pp.ringName(p.ring || 4)} · ${pp.rhythmName(p.rhythm)}`),
      h('p.small.muted', s.since == null ? 'Noch kein Kontakt eingetragen' : `Letzter Kontakt ${pp.sinceText(s.since)}`),
      b && h('p.small.muted', `Geburtstag ${pp.birthdayText(p.birthday)} · ${b.inDays === 0 ? 'heute 🎉' : `in ${b.inDays} Tagen`}${b.age ? ` (wird ${b.age})` : ''}`),
      h('div.person-actions.center',
        h(`button.tchip.contact${pp.hadContactOn(id, iso()) ? '.on' : ''}`, { onclick: () => { pp.toggleContact(id); refresh(); } }, pp.hadContactOn(id, iso()) ? 'Kontakt heute ✓' : 'Kontakt gehabt'),
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

function editView(_, refresh) {
  return h('div.view.a-contact', back(), h('header.hero', h('h1', 'Neue Person')), editForm(null, refresh));
}

function editForm(p, refresh) {
  let ring = p?.ring || 3;
  let rhythm = p?.rhythm ?? 30;
  const name = h('input.input', { placeholder: 'Name', value: p?.name || '', autocapitalize: 'words' });
  const bday = h('input.input', { placeholder: 'z. B. 14.3. oder 14.3.1995', inputmode: 'numeric', value: p?.birthday ? pp.birthdayText(p.birthday) : '' });
  const notes = h('textarea.input', { rows: 3, placeholder: 'Was dir wichtig ist: Interessen, Kinder, letzte Themen …', value: p?.notes || '' });
  const ringBox = h('div.segs.wrap');
  const rhythmBox = h('div.chips');
  const paint = () => {
    ringBox.replaceChildren(...[1, 2, 3, 4].map((n) => h(`button.seg${ring === n ? '.on' : ''}`, { onclick: () => { ring = n; paint(); } }, `${n} · ${pp.ringName(n)}`)));
    rhythmBox.replaceChildren(...pp.RHYTHMS.map((r) => h(`button.chip${rhythm === r.days ? '.on' : ''}`, { onclick: () => { rhythm = r.days; paint(); } }, r.name)));
  };
  paint();

  return h('section.card',
    p && secTitle('settings', 'Bearbeiten'),
    h('label.field', h('span', 'Name'), name),
    h('div.field', h('span', 'Ring – wie nah steht ihr euch?'), ringBox),
    h('div.field', h('span', 'Wie oft möchtest du Kontakt?'), rhythmBox),
    h('label.field', h('span', 'Geburtstag (Jahr optional)'), bday),
    h('label.field', h('span', 'Notizen'), notes),
    h('div.buttons',
      h('button.btn.primary', {
        onclick: () => {
          if (!name.value.trim()) return toast('Bitte einen Namen eintragen.');
          const b = pp.parseBirthday(bday.value);
          if (b === null) return toast('Geburtstag bitte als TT.MM. oder TT.MM.JJJJ eingeben.', 'error');
          const id = pp.savePerson(p?.id, { name: name.value.trim(), ring, rhythm, birthday: b, notes: notes.value.trim() });
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
          location.hash = '#/contact';
        },
      }, 'Speichern')),
    ),
  );
}
