// Bereich Reflexion & Sinn: Meditation, Affirmation, Stimmung & Energie, Journal.
// Ton: ruhig, warm, ohne Druck.
import * as mind from '../mind.js';
import { h, icon, toast, iso, fromIso, addDays, weekStart, fmtLong, WD_SHORT } from '../ui.js';

let day = iso();
let dayIsToday = true;
let editAff = false;
let editQ = false;

const de1 = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function render(refresh) {
  if (dayIsToday) day = iso();
  return h('div.view.a-sinn',
    hero(refresh),
    meditationCard(refresh),
    affirmationCard(refresh),
    moodCard(refresh),
    journalCard(refresh),
    weekCard(),
  );
}

function secTitle(ic, text, right) {
  return h('div.sec-title', h('span.sec-icon', icon(ic, 18)), h('h2', text), right || null);
}

// ---------- Kopf ----------

function hero(refresh) {
  const today = iso();
  const go = (delta) => {
    day = iso(addDays(fromIso(day), delta));
    dayIsToday = day === today;
    editAff = false;
    editQ = false;
    refresh();
  };
  const label = day === today ? 'Heute' : day === iso(addDays(new Date(), -1)) ? 'Gestern' : day === iso(addDays(new Date(), 1)) ? 'Morgen' : WD_SHORT[fromIso(day).getDay()];
  const items = [
    ['Meditation', mind.meditated(day)],
    ['Affirmation', mind.affirmationRead(day)],
    ['Stimmung', mind.mood(day) != null || mind.energy(day) != null],
    ['Journal', mind.journaled(day)],
  ];
  const hr = new Date().getHours();
  const line = day !== today ? 'Ein Blick zurück – ganz ohne Bewertung.'
    : hr < 11 ? 'Ein ruhiger Start in deinen Tag.'
      : hr < 18 ? 'Kurz innehalten. Du machst das gut.'
        : 'Lass den Tag in Ruhe ausklingen.';

  return h('section.kp-hero.sinn-hero',
    h('div.daynav',
      h('button.navbtn', { onclick: () => go(-1), 'aria-label': 'Vorheriger Tag' }, icon('back', 20)),
      h('button.daylabel', {
        onclick: () => {
          day = today;
          dayIsToday = true;
          refresh();
        },
      }, h('b', label), h('span', fmtLong(fromIso(day)))),
      h('button.navbtn.flip', { onclick: () => go(1), 'aria-label': 'Nächster Tag' }, icon('back', 20)),
    ),
    h('p.sinn-line', line),
    h('div.sinn-pills', items.map(([name, done]) => h(`span.sinn-pill${done ? '.on' : ''}`, done ? icon('check', 14) : null, name))),
  );
}

// ---------- Meditation ----------

function meditationCard(refresh) {
  const done = mind.meditated(day);
  return h('section.card',
    h(`button.check.big${done ? '.done' : ''}`, {
      onclick: () => {
        mind.toggleMeditation(day);
        if (!done) toast('Schön. Ein Moment nur für dich.');
        refresh();
      },
    },
    h('span.box', icon('check', 20)),
    h('span.check-name', h('b', 'Meditiert'), h('span.small.muted.block', done ? 'Gut gemacht – ganz ohne Druck.' : 'Ein paar Minuten Stille zählen schon.')),
    h('span.sec-icon', icon('sinn', 18))),
  );
}

// ---------- Affirmation ----------

function affirmationCard(refresh) {
  if (editAff) {
    const input = h('input.input', { placeholder: 'Neue Affirmation, z. B. Ich bin stolz auf mich.', enterkeyhint: 'done', onkeydown: (e) => e.key === 'Enter' && add() });
    const add = () => {
      if (!input.value.trim()) return;
      mind.addAffirmation(input.value.trim());
      refresh();
    };
    return h('section.card',
      secTitle('sparkle', 'Deine Affirmationen', h('button.link', { onclick: () => { editAff = false; refresh(); } }, 'Fertig')),
      mind.affirmations().map((a) => h('div.editrow.add2',
        h('p.aff-item', a.text),
        h('button.pill.del', {
          'aria-label': 'Löschen',
          onclick: () => {
            if (!confirm(`„${a.text}“ löschen?`)) return;
            mind.deleteAffirmation(a.id);
            refresh();
          },
        }, icon('trash', 18)),
      )),
      h('div.editrow.add2', input, h('button.pill.add', { 'aria-label': 'Hinzufügen', onclick: add }, icon('plus', 20))),
    );
  }

  const a = mind.affirmationOf(day);
  const read = mind.affirmationRead(day);
  return h('section.card.aff-card',
    secTitle('sparkle', 'Affirmation des Tages', h('button.link', { onclick: () => { editAff = true; refresh(); } }, 'Verwalten')),
    a ? h('blockquote.aff', a.text) : h('p.muted', 'Noch keine Affirmationen. Tippe auf „Verwalten“.'),
    a && h('div.buttons.split',
      h(`button.btn${read ? '.done-btn' : '.primary'}`, {
        onclick: () => {
          mind.toggleAffirmationRead(day);
          refresh();
        },
      }, icon('check', 18), read ? 'Gelesen' : 'Als gelesen markieren'),
      h('button.btn.ghost', {
        onclick: () => {
          mind.nextAffirmation(day);
          refresh();
        },
      }, 'Andere'),
    ),
  );
}

// ---------- Stimmung & Energie ----------

function scale5(value, onPick, low, high) {
  return h('div.scale5wrap',
    h('div.scale5', [1, 2, 3, 4, 5].map((n) => h(`button.scale-btn${value === n ? '.on' : ''}`, { onclick: () => onPick(value === n ? null : n), 'aria-label': `${n} von 5` }, n))),
    h('div.scale-ends', h('span', low), h('span', high)),
  );
}

function moodCard(refresh) {
  return h('section.card',
    secTitle('sun', 'Wie geht es dir?'),
    h('p.rv-q', 'Stimmung'),
    scale5(mind.mood(day), (v) => { mind.setMood(day, v); refresh(); }, 'schwer', 'leicht'),
    h('p.rv-q', 'Energie'),
    scale5(mind.energy(day), (v) => { mind.setEnergy(day, v); refresh(); }, 'leer', 'voller Energie'),
  );
}

// ---------- Journal ----------

function journalCard(refresh) {
  const qs = mind.questions();
  if (editQ) {
    const input = h('input.input', { placeholder: 'Neue Frage, z. B. Was hat mir heute Kraft gegeben?', enterkeyhint: 'done', onkeydown: (e) => e.key === 'Enter' && add() });
    const add = () => {
      if (!input.value.trim()) return;
      mind.addQuestion(input.value.trim());
      refresh();
    };
    return h('section.card',
      secTitle('pen', 'Journal-Fragen', h('button.link', { onclick: () => { editQ = false; refresh(); } }, 'Fertig')),
      qs.map((q) => h('div.editrow.add2',
        h('p.aff-item', q.text),
        h('button.pill.del', {
          'aria-label': 'Löschen',
          onclick: () => {
            if (!confirm(`Frage „${q.text}“ löschen? Frühere Antworten bleiben gespeichert.`)) return;
            mind.deleteQuestion(q.id);
            refresh();
          },
        }, icon('trash', 18)),
      )),
      h('div.editrow.add2', input, h('button.pill.add', { 'aria-label': 'Hinzufügen', onclick: add }, icon('plus', 20))),
    );
  }

  return h('section.card',
    secTitle('pen', 'Journal', h('button.link', { onclick: () => { editQ = true; refresh(); } }, 'Fragen')),
    h('p.small.muted', 'Kurz und ehrlich – jede Antwort ist freiwillig.'),
    qs.map((q) => {
      let timer;
      const ta = h('textarea.input.journal', {
        rows: 2,
        placeholder: 'Ein paar Worte …',
        value: mind.answer(day, q.id),
        // Speichert beim Tippen (kurz verzögert) und beim Verlassen des Feldes.
        oninput: (e) => {
          clearTimeout(timer);
          timer = setTimeout(() => mind.setAnswer(day, q.id, e.target.value.trim()), 600);
        },
        onchange: (e) => {
          clearTimeout(timer);
          mind.setAnswer(day, q.id, e.target.value.trim());
        },
      });
      return h('label.field.jq', h('span', q.text), ta);
    }),
  );
}

// ---------- Woche ----------

function bars(label, vals) {
  return h('div.mw-row',
    h('span.mw-label', label),
    h('div.mw-bars', vals.map((v) => h(`div.mw-cell${v == null ? '.empty' : ''}`,
      h('div.mw-track', h('i', { style: { height: `${v ? (v / 5) * 100 : 0}%` } })),
      h('span', v ?? '·'),
    ))),
  );
}

function weekCard() {
  const mon = weekStart(fromIso(day));
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(mon, i)));
  const s = mind.weekSummary(mon);
  const cmp = (cur, prev) => (cur != null && prev != null ? ` (${cur - prev >= 0 ? '+' : '–'}${de1(Math.abs(cur - prev))} zur Vorwoche)` : '');
  return h('section.card',
    secTitle('chart', 'Deine Woche'),
    h('div.mw',
      bars('Stimmung', days.map(mind.mood)),
      bars('Energie', days.map(mind.energy)),
      h('div.mw-row.mw-days', h('span.mw-label'), h('div.mw-bars', days.map((d) => h(`span.mw-day${d === iso() ? '.today' : ''}`, WD_SHORT[fromIso(d).getDay()])))),
    ),
    (s.mood != null || s.energy != null) && h('p.small.muted.center',
      [s.mood != null && `Ø Stimmung ${de1(s.mood)}${cmp(s.mood, s.moodPrev)}`, s.energy != null && `Ø Energie ${de1(s.energy)}${cmp(s.energy, s.energyPrev)}`].filter(Boolean).join(' · ')),
    h('div.mw-parts', s.parts.map((p) => h('span.mw-part', h('b', `${p.done}/${p.total}`), p.label))),
  );
}
