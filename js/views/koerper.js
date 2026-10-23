// Bereich Körper: Tagesansicht, Wochenplan-Import, Ziele.
import * as body from '../body.js';
import { lineChart } from '../chart.js';
import { h, icon, toast, iso, fromIso, addDays, weekStart, fmtLong, fmtShort, WD_SHORT } from '../ui.js';

let day = iso();
let dayIsToday = true;     // springt bei neuem Tag automatisch mit
let editRoutines = false;
let showExtra = false;
let pendingPlan = null;

const n = (v) => Math.round(v).toLocaleString('de-DE');
const kg = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const parseNum = (s) => Number(String(s).replace(',', '.').trim()) || 0;

export function render(sub, refresh) {
  if (sub === 'import') return importView(refresh);
  if (sub === 'ziele') return goalsView(refresh);
  if (dayIsToday) day = iso();
  return dayView(refresh);
}

function back() {
  return h('a.backlink', { href: '#/koerper' }, icon('back', 18), 'Körper');
}

// ---------- Tagesansicht ----------

function dayView(refresh) {
  const today = iso();
  const go = (delta) => {
    day = iso(addDays(fromIso(day), delta));
    dayIsToday = day === today;
    showExtra = false;
    refresh();
  };
  const label = day === today ? 'Heute' : day === iso(addDays(new Date(), 1)) ? 'Morgen' : day === iso(addDays(new Date(), -1)) ? 'Gestern' : WD_SHORT[fromIso(day).getDay()];

  return h('div.view.a-koerper',
    h('div.daynav',
      h('button.iconbtn', { onclick: () => go(-1), 'aria-label': 'Vorheriger Tag' }, icon('back', 20)),
      h('button.daylabel', {
        onclick: () => {
          day = today;
          dayIsToday = true;
          refresh();
        },
      }, h('b', label), h('span', fmtLong(fromIso(day)))),
      h('button.iconbtn.flip', { onclick: () => go(1), 'aria-label': 'Nächster Tag' }, icon('back', 20)),
    ),
    totalsCard(),
    mealsCard(refresh),
    routinesCard(refresh),
    trainingCard(refresh),
    weightCard(refresh),
    h('div.linkrow',
      h('a.btn.ghost', { href: '#/koerper/import' }, icon('upload', 18), 'Wochenplan importieren'),
      h('a.btn.ghost', { href: '#/koerper/ziele' }, 'Ziele anpassen'),
    ),
  );
}

function totalsCard() {
  const t = body.targets();
  const { eaten, planned } = body.totals(day);
  const pct = (k) => Math.min(100, t[k] ? (eaten[k] / t[k]) * 100 : 0);
  return h('section.card.totals',
    h('div.row.between',
      h('p.label', day === iso() ? 'Heute gegessen' : 'Gegessen'),
      h('p.muted', planned.kcal ? `geplant ${n(planned.kcal)} kcal` : ''),
    ),
    h('div.kcal',
      h('b', n(eaten.kcal)), h('span.muted', ` / ${n(t.kcal)} kcal`),
    ),
    h('div.bar.big', h('i', { style: { width: `${pct('kcal')}%` } })),
    h('div.macros',
      body.MACROS.slice(1).map((m) => h('div.macro',
        h('span.small.muted', m.short || m.name),
        h('span.small', h('b', n(eaten[m.id])), ` / ${n(t[m.id])} g`),
        h('div.bar', h('i', { style: { width: `${pct(m.id)}%` } })),
      )),
    ),
  );
}

function mealsCard(refresh) {
  const list = body.meals(day);
  const extras = body.extras(day);
  const next = day === iso() ? body.nextMeal(day) : null;

  const rows = list.map((m, i) => {
    const s = body.mealStatus(day, i);
    const set = (v) => {
      body.setMealStatus(day, i, s === v ? null : v);
      refresh();
    };
    return h(`div.meal${s === 'ja' ? '.eaten' : ''}${s === 'nein' ? '.skipped' : ''}${next && next.i === i ? '.next' : ''}`,
      h('span.time', m.zeit || '–'),
      h('div.meal-main',
        h('p.meal-name', m.name),
        h('p.small.muted', [m.menge, `${n(m.kcal)} kcal`, `${n(m.protein)} P`, `${n(m.kh)} KH`, `${n(m.fett)} F`].filter(Boolean).join(' · ')),
      ),
      h('div.meal-btns',
        h('button.pill.yes', { onclick: () => set('ja'), 'aria-pressed': s === 'ja', 'aria-label': 'Gegessen' }, icon('check', 20)),
        h('button.pill.no', { onclick: () => set('nein'), 'aria-pressed': s === 'nein', 'aria-label': 'Nicht gegessen' }, icon('close', 18)),
      ),
    );
  });

  const extraRows = extras.map((e) => h('div.meal.eaten.extra',
    h('span.time', e.zeit || '–'),
    h('div.meal-main',
      h('p.meal-name', e.name, h('span.tag', 'spontan')),
      h('p.small.muted', `${n(e.kcal)} kcal · ${n(e.protein)} P · ${n(e.kh)} KH · ${n(e.fett)} F`),
    ),
    h('div.meal-btns',
      h('button.pill.no', {
        'aria-label': 'Löschen',
        onclick: () => {
          if (!confirm(`„${e.name}“ entfernen?`)) return;
          body.deleteExtra(e.key);
          refresh();
        },
      }, icon('trash', 18)),
    ),
  ));

  return h('section.card',
    h('div.row.between', h('p.label', 'Mahlzeiten'), list.length > 0 && h('p.small.muted', 'Gegessen ✓ · Nicht gegessen ✕')),
    !list.length && h('p.muted', 'Für diesen Tag ist noch kein Essensplan da. Importiere deinen Wochenplan unten.'),
    rows,
    extraRows,
    showExtra ? extraForm(refresh) : h('button.btn.ghost.full', { onclick: () => { showExtra = true; refresh(); } }, '+ Spontan gegessen'),
  );
}

function extraForm(refresh) {
  const now = new Date();
  const name = h('input.input', { placeholder: 'Was hast du gegessen?' });
  const zeit = h('input.input', { type: 'time', value: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` });
  const fields = body.MACROS.map((m) => ({ m, el: h('input.input', { inputmode: 'numeric', placeholder: m.unit }) }));
  return h('div.form',
    h('p.small.muted', 'Schätzen reicht völlig.'),
    name,
    h('div.grid4', fields.map(({ m, el }) => h('label.field', h('span', m.short || m.name), el))),
    h('label.field', h('span', 'Uhrzeit'), zeit),
    h('div.buttons',
      h('button.btn.primary', {
        onclick: () => {
          if (!name.value.trim()) return toast('Bitte kurz eintragen, was es war.');
          const e = { zeit: zeit.value, name: name.value.trim() };
          for (const { m, el } of fields) e[m.id] = Math.round(parseNum(el.value));
          body.addExtra(day, e);
          showExtra = false;
          toast('Eingetragen');
          refresh();
        },
      }, 'Speichern'),
      h('button.btn.ghost', { onclick: () => { showExtra = false; refresh(); } }, 'Abbrechen'),
    ),
  );
}

function routinesCard(refresh) {
  const list = body.routines();
  const doneCount = list.filter((r) => body.routineDone(day, r.id)).length;
  const nowT = new Date().toTimeString().slice(0, 5);

  if (editRoutines) {
    const nameIn = h('input.input', { placeholder: 'Neue Routine, z. B. Omega 3' });
    const timeIn = h('input.input.time', { type: 'time', value: '08:00' });
    return h('section.card',
      h('div.row.between', h('p.label', 'Routinen bearbeiten'), h('button.link', { onclick: () => { editRoutines = false; refresh(); } }, 'Fertig')),
      list.map((r) => h('div.editrow',
        h('input.input.time', { type: 'time', value: r.zeit || '', onchange: (e) => body.saveRoutine(r.id, { name: r.name, zeit: e.target.value }) }),
        h('input.input', { value: r.name, onchange: (e) => e.target.value.trim() && body.saveRoutine(r.id, { name: e.target.value.trim(), zeit: r.zeit }) }),
        h('button.pill.no', {
          'aria-label': 'Löschen',
          onclick: () => {
            if (!confirm(`Routine „${r.name}“ löschen?`)) return;
            body.deleteRoutine(r.id);
            refresh();
          },
        }, icon('trash', 18)),
      )),
      h('div.editrow.add',
        timeIn,
        nameIn,
        h('button.pill.yes.on', {
          'aria-label': 'Hinzufügen',
          onclick: () => {
            if (!nameIn.value.trim()) return;
            body.saveRoutine(null, { name: nameIn.value.trim(), zeit: timeIn.value });
            refresh();
          },
        }, icon('plus', 20)),
      ),
    );
  }

  return h('section.card',
    h('div.row.between',
      h('p.label', 'Routinen', h('span.count', `${doneCount}/${list.length}`)),
      h('button.link', { onclick: () => { editRoutines = true; refresh(); } }, 'Bearbeiten'),
    ),
    !list.length && h('p.muted', 'Noch keine Routinen. Tippe auf „Bearbeiten“.'),
    list.map((r) => {
      const done = body.routineDone(day, r.id);
      const late = !done && day === iso() && r.zeit && r.zeit < nowT;
      return h(`button.check${done ? '.done' : ''}${late ? '.late' : ''}`, {
        onclick: () => {
          body.toggleRoutine(day, r.id);
          refresh();
        },
      },
      h('span.box', icon('check', 18)),
      h('span.check-name', r.name),
      h('span.time', r.zeit || ''));
    }),
  );
}

function trainingCard(refresh) {
  const list = body.training(day);
  const choose = h('div.chips',
    body.TRAINING_TYPES.map((t) => h('button.chip', {
      onclick: () => {
        body.setTraining(day, [...list, { art: t.id, details: '' }]);
        refresh();
      },
    }, t.name)),
  );

  return h('section.card',
    h('div.row.between',
      h('p.label', 'Training'),
      list.length > 0 && h('button.link', {
        onclick: () => {
          if (!confirm('Training für diesen Tag zurücksetzen?')) return;
          body.setTraining(day, []);
          refresh();
        },
      }, 'Ändern'),
    ),
    !list.length && h('p.muted', 'Nichts geplant. Was steht heute an?'),
    !list.length && choose,
    list.map((t, i) => {
      const art = body.normArt(t.art);
      if (art === 'ruhetag') {
        return h('div.rest', h('b', 'Ruhetag'), h('span.muted', t.details || 'Erholung gehört zum Muskelaufbau dazu.'));
      }
      const done = body.trainingDone(day, i);
      return h(`button.check${done ? '.done' : ''}`, {
        onclick: () => {
          body.toggleTraining(day, i);
          refresh();
        },
      },
      h('span.box', icon('check', 18)),
      h('span.check-name', h('b', body.trainingName(t.art)), t.details ? h('span.small.muted.block', t.details) : null));
    }),
  );
}

function weightCard(refresh) {
  const w = body.weight(day);
  const thisWeek = body.weekAvg(weekStart(fromIso(day)));
  const lastWeek = body.weekAvg(addDays(weekStart(fromIso(day)), -7));
  const diff = thisWeek && lastWeek ? thisWeek - lastWeek : null;
  const input = h('input.input.weight', {
    inputmode: 'decimal',
    placeholder: 'z. B. 70,4',
    value: w ? kg(w) : '',
    onchange: (e) => {
      const v = parseNum(e.target.value);
      if (e.target.value && (v < 30 || v > 250)) return toast('Das Gewicht sieht ungewöhnlich aus – bitte prüfen.', 'error');
      body.setWeight(day, v ? Math.round(v * 10) / 10 : null);
      toast(v ? 'Gewicht gespeichert' : 'Gewicht entfernt');
      refresh();
    },
  });

  return h('section.card',
    h('p.label', 'Morgengewicht'),
    h('div.weightrow',
      h('div.weightin', input, h('span.muted', 'kg')),
      h('div.stat',
        h('span.small.muted', 'Wochenschnitt'),
        h('b', thisWeek ? `${kg(thisWeek)} kg` : '–'),
        diff != null && h('span.small.muted', `${diff >= 0 ? '+' : '–'}${kg(Math.abs(diff))} kg zur Vorwoche`),
      ),
    ),
    lineChart(body.weights(), { weeks: 8 }),
  );
}

// ---------- Import ----------

function importView(refresh) {
  const area = h('textarea.input.paste', { placeholder: 'Plan aus dem Claude-Chat hier einfügen …', rows: 6 });
  const msg = h('p.error');
  const preview = h('div');

  function check() {
    msg.textContent = '';
    try {
      pendingPlan = body.parsePlan(area.value);
    } catch (e) {
      pendingPlan = null;
      msg.textContent = e.message;
      preview.replaceChildren();
      return;
    }
    preview.replaceChildren(planPreview(pendingPlan, refresh));
  }

  return h('div.view.a-koerper',
    back(),
    h('header.hero', h('h1', 'Wochenplan importieren')),
    h('section.card',
      h('p.muted', 'Kopiere den Code-Block aus deinem Claude-Chat und füge ihn hier ein. Essens- und Trainingsplan einzeln nacheinander.'),
      area,
      msg,
      h('div.buttons',
        h('button.btn.ghost', {
          onclick: async () => {
            try {
              area.value = await navigator.clipboard.readText();
              check();
            } catch {
              toast('Bitte lange ins Feld tippen und „Einsetzen“ wählen.');
            }
          },
        }, 'Aus Zwischenablage'),
        h('button.btn.primary', { onclick: check }, 'Prüfen'),
      ),
    ),
    preview,
    h('section.card',
      h('p.label', 'Vorlage für deinen Claude-Chat'),
      h('p.muted', 'Schicke diesen Text einmal in dein Körper-Projekt (oder lege ihn dort als Anweisung ab). Dann kommt der Plan jeden Sonntag direkt im passenden Format.'),
      h('div.buttons',
        h('button.btn.ghost', { onclick: () => copy(body.TEMPLATE_MEALS) }, 'Vorlage Essensplan kopieren'),
        h('button.btn.ghost', { onclick: () => copy(body.TEMPLATE_TRAINING) }, 'Vorlage Trainingsplan kopieren'),
      ),
    ),
  );
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert – jetzt im Claude-Chat einfügen');
  } catch {
    toast('Kopieren hat nicht geklappt', 'error');
  }
}

function planPreview(plan, refresh) {
  const isMeals = plan.typ === 'essen';
  const end = addDays(plan.monday, 6);
  const existing = plan.days.some((items, i) => {
    if (items === undefined) return false;
    const d = iso(addDays(plan.monday, i));
    return isMeals ? body.meals(d).length : body.training(d).length;
  });
  return h('section.card',
    h('p.label', `${isMeals ? 'Essensplan' : 'Trainingsplan'} · ${fmtShort(plan.monday)}–${fmtShort(end)}`),
    h('div.preview',
      plan.days.map((items, i) => {
        const d = addDays(plan.monday, i);
        let text;
        if (items === undefined) text = 'nicht im Plan – bleibt wie es ist';
        else if (isMeals) {
          const k = items.reduce((s, m) => s + m.kcal, 0);
          const p = items.reduce((s, m) => s + m.protein, 0);
          text = `${items.length} Mahlzeiten · ${n(k)} kcal · ${n(p)} g Protein`;
        } else text = items.map((t) => body.trainingName(t.art) + (t.details ? ` (${t.details})` : '')).join(', ') || '–';
        return h('div.prow', h('b', `${WD_SHORT[d.getDay()]} ${fmtShort(d)}`), h('span.muted', text));
      }),
    ),
    existing && h('p.small.muted', 'Für einige Tage gibt es schon einen Plan – er wird ersetzt.'),
    h('div.buttons',
      h('button.btn.primary', {
        onclick: () => {
          body.applyPlan(plan);
          pendingPlan = null;
          toast(`${isMeals ? 'Essensplan' : 'Trainingsplan'} übernommen`);
          day = iso();
          dayIsToday = true;
          location.hash = '#/koerper';
        },
      }, 'Übernehmen'),
    ),
  );
}

// ---------- Ziele ----------

function goalsView(refresh) {
  const t = body.targets();
  const inputs = body.MACROS.map((m) => ({ m, el: h('input.input', { inputmode: 'numeric', value: t[m.id] }) }));
  return h('div.view.a-koerper',
    back(),
    h('header.hero', h('h1', 'Deine Tagesziele')),
    h('section.card',
      h('p.muted', 'Startwerte für Muskelaufbau bei rund 70 kg. Passe sie an, sobald du Werte aus deinem Körper-Projekt hast.'),
      h('div.grid2', inputs.map(({ m, el }) => h('label.field', h('span', `${m.name} (${m.unit})`), el))),
      h('div.buttons',
        h('button.btn.primary', {
          onclick: () => {
            const next = {};
            for (const { m, el } of inputs) next[m.id] = Math.round(parseNum(el.value)) || body.DEFAULT_TARGETS[m.id];
            body.setTargets(next);
            toast('Ziele gespeichert');
            location.hash = '#/koerper';
          },
        }, 'Speichern'),
      ),
    ),
  );
}
