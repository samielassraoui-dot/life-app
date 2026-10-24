// Bereich Körper: Tagesansicht, Wochenplan-Import, Ziele.
import * as body from '../body.js';
import { lineChart, weekChart } from '../chart.js';
import { h, icon, toast, iso, fromIso, addDays, weekStart, fmtLong, fmtShort, WD_SHORT, saveFile, isoWeek } from '../ui.js';

let day = iso();
let dayIsToday = true;     // springt bei neuem Tag automatisch mit
let editRoutines = false;
let showExtra = false;
let showTraining = false;
let chartMode = 'woche';
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

function secTitle(ic, text, right) {
  return h('div.sec-title', h('span.sec-icon', icon(ic, 18)), h('h2', text), right || null);
}

// ---------- Tagesansicht ----------

function dayView(refresh) {
  return h('div.view.a-koerper',
    hero(refresh),
    mealsCard(refresh),
    routinesCard(refresh),
    trainingCard(refresh),
    weightCard(refresh),
    h('div.tools',
      h('a.tool', { href: '#/koerper/import' }, h('span.tool-icon', icon('upload', 20)), h('span', 'Wochenplan', h('br'), 'importieren')),
      h('button.tool', { onclick: calendarExport }, h('span.tool-icon', icon('bell', 20)), h('span', 'Erinnerungen', h('br'), 'in Kalender')),
      h('a.tool', { href: '#/koerper/ziele' }, h('span.tool-icon', icon('settings', 20)), h('span', 'Ziele', h('br'), 'anpassen')),
    ),
  );
}

function ring(value, goal) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = goal ? Math.min(1, value / goal) : 0;
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 128 128');
  s.setAttribute('class', 'ring');
  s.innerHTML = `<circle cx="64" cy="64" r="${r}" class="ring-track"/>`
    + `<circle cx="64" cy="64" r="${r}" class="ring-val" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 64 64)"/>`;
  return h('div.ring-wrap', s, h('div.ring-text', h('b', n(value)), h('span', `von ${n(goal)}`), h('span', 'kcal')));
}

function hero(refresh) {
  const today = iso();
  const go = (delta) => {
    day = iso(addDays(fromIso(day), delta));
    dayIsToday = day === today;
    showExtra = false;
    showTraining = false;
    refresh();
  };
  const label = day === today ? 'Heute' : day === iso(addDays(new Date(), 1)) ? 'Morgen' : day === iso(addDays(new Date(), -1)) ? 'Gestern' : WD_SHORT[fromIso(day).getDay()];
  const t = body.targets();
  const { eaten, planned } = body.totals(day);

  return h('section.kp-hero',
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
    h('div.kp-sum',
      ring(eaten.kcal, t.kcal),
      h('div.kp-macros',
        body.MACROS.slice(1).map((m) => h('div.kp-macro',
          h('div.row.between', h('span', m.name), h('span', h('b', n(eaten[m.id])), ` / ${n(t[m.id])} g`)),
          h('div.hbar', h('i', { style: { width: `${Math.min(100, t[m.id] ? (eaten[m.id] / t[m.id]) * 100 : 0)}%` } })),
        )),
      ),
    ),
    planned.kcal > 0 && h('p.kp-plan', `Geplant: ${n(planned.kcal)} kcal · ${n(planned.protein)} g Protein`),
  );
}

function mealsCard(refresh) {
  const list = body.meals(day);
  const extras = body.extras(day);
  const next = day === iso() ? body.nextMeal(day) : null;

  const rows = list.map((m, i) => {
    const s = body.mealStatus(day, i);
    const cat = body.category(m);
    const set = (v) => {
      body.setMealStatus(day, i, s === v ? null : v);
      refresh();
    };
    return h(`div.meal.cat-${cat}${s === 'ja' ? '.eaten' : ''}${s === 'nein' ? '.skipped' : ''}`,
      h('div.meal-main',
        h('div.meal-meta',
          h('span.cat', body.catName(cat)),
          h('span.time', m.zeit || ''),
          next && next.i === i && h('span.nexttag', 'als Nächstes'),
        ),
        h('p.meal-name', m.name),
        h('p.small.muted', [m.menge, `${n(m.kcal)} kcal`, `${n(m.protein)} P`, `${n(m.kh)} KH`, `${n(m.fett)} F`].filter(Boolean).join(' · ')),
      ),
      h('div.meal-btns',
        h('button.pill.yes', { onclick: () => set('ja'), 'aria-pressed': s === 'ja', 'aria-label': 'Gegessen' }, icon('check', 22)),
        h('button.pill.no', { onclick: () => set('nein'), 'aria-pressed': s === 'nein', 'aria-label': 'Nicht gegessen' }, icon('close', 20)),
      ),
    );
  });

  const extraRows = extras.map((e) => h('div.meal.cat-spontan.eaten',
    h('div.meal-main',
      h('div.meal-meta', h('span.cat', 'Spontan'), h('span.time', e.zeit || '')),
      h('p.meal-name', e.name),
      h('p.small.muted', `${n(e.kcal)} kcal · ${n(e.protein)} P · ${n(e.kh)} KH · ${n(e.fett)} F`),
    ),
    h('div.meal-btns',
      h('button.pill.del', {
        'aria-label': 'Löschen',
        onclick: () => {
          if (!confirm(`„${e.name}“ entfernen?`)) return;
          body.deleteExtra(e.key);
          refresh();
        },
      }, icon('trash', 18)),
    ),
  ));

  const eatenCount = list.filter((_, i) => body.mealStatus(day, i) === 'ja').length;
  return h('section.card',
    secTitle('meal', 'Mahlzeiten', list.length > 0 && h('span.count', `${eatenCount}/${list.length}`)),
    !list.length && h('p.muted', 'Für diesen Tag ist noch kein Essensplan da. Importiere deinen Wochenplan unten.'),
    h('div.meals', rows, extraRows),
    showExtra ? extraForm(refresh) : h('button.btn.soft.full', { onclick: () => { showExtra = true; refresh(); } }, icon('plus', 18), 'Spontan gegessen'),
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
      secTitle('list', 'Routinen bearbeiten', h('button.link', { onclick: () => { editRoutines = false; refresh(); } }, 'Fertig')),
      list.map((r) => h('div.editrow',
        h('input.input.time', { type: 'time', value: r.zeit || '', onchange: (e) => body.saveRoutine(r.id, { name: r.name, zeit: e.target.value }) }),
        h('input.input', { value: r.name, onchange: (e) => e.target.value.trim() && body.saveRoutine(r.id, { name: e.target.value.trim(), zeit: r.zeit }) }),
        h('button.pill.del', {
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
        h('button.pill.add', {
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
    secTitle('list', 'Routinen', h('span.row',
      h('span.count', `${doneCount}/${list.length}`),
      h('button.link', { onclick: () => { editRoutines = true; refresh(); } }, 'Bearbeiten'),
    )),
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

  const items = list.map((t, i) => {
    const art = body.normArt(t.art);
    const remove = h('button.pill.del.small', {
      'aria-label': 'Entfernen',
      onclick: (e) => {
        e.stopPropagation();
        if (!confirm(`${body.trainingName(t.art)} entfernen?`)) return;
        body.removeTraining(day, i);
        refresh();
      },
    }, icon('close', 16));
    if (art === 'ruhetag') {
      return h('div.rest', h('div', h('b', 'Ruhetag'), h('span.small.muted.block', t.details || 'Erholung gehört zum Muskelaufbau dazu.')), remove);
    }
    const done = body.trainingDone(day, i);
    return h('div.check-wrap',
      h(`button.check${done ? '.done' : ''}`, {
        onclick: () => {
          body.toggleTraining(day, i);
          refresh();
        },
      },
      h('span.box', icon('check', 18)),
      h('span.check-name',
        h('b', body.trainingName(t.art)),
        t.spontan && h('span.tag', 'spontan'),
        t.details ? h('span.small.muted.block', t.details) : null),
      h('span.time', t.zeit || '')),
      remove,
    );
  });

  let adder;
  if (showTraining) {
    const custom = h('input.input', { placeholder: 'Andere Art, z. B. Schwimmen' });
    const details = h('input.input', { placeholder: 'Details (optional), z. B. 30 Min' });
    const add = (art) => {
      body.addTraining(day, { art: body.normArt(art), details: details.value.trim(), spontan: true });
      showTraining = false;
      toast(`${body.trainingName(art)} hinzugefügt`);
      refresh();
    };
    adder = h('div.form',
      h('p.small.muted', 'Antippen fügt das Training direkt hinzu.'),
      details,
      h('div.chips', body.trainingChoices().map((c) => h('button.chip', { onclick: () => add(c.id) }, c.name))),
      h('div.editrow.add2',
        custom,
        h('button.pill.add', { 'aria-label': 'Hinzufügen', onclick: () => custom.value.trim() && add(custom.value.trim()) }, icon('plus', 20)),
      ),
      h('button.btn.ghost', { onclick: () => { showTraining = false; refresh(); } }, 'Abbrechen'),
    );
  } else {
    adder = h('button.btn.soft.full', { onclick: () => { showTraining = true; refresh(); } }, icon('plus', 18), 'Training hinzufügen');
  }

  return h('section.card',
    secTitle('koerper', 'Training'),
    !list.length && h('p.muted', 'Für diesen Tag ist nichts geplant.'),
    items,
    adder,
  );
}

function weightCard(refresh) {
  const w = body.weight(day);
  const monday = weekStart(fromIso(day));
  const thisWeek = body.weekAvg(monday);
  const lastWeek = body.weekAvg(addDays(monday, -7));
  const diff = thisWeek && lastWeek ? thisWeek - lastWeek : null;
  const input = h('input.input.weight', {
    inputmode: 'decimal',
    placeholder: '70,0',
    value: w ? kg(w) : '',
    onchange: (e) => {
      const v = parseNum(e.target.value);
      if (e.target.value && (v < 30 || v > 250)) return toast('Das Gewicht sieht ungewöhnlich aus – bitte prüfen.', 'error');
      body.setWeight(day, v ? Math.round(v * 10) / 10 : null);
      toast(v ? 'Gewicht gespeichert' : 'Gewicht entfernt');
      refresh();
    },
  });
  const seg = (id, label) => h(`button.seg${chartMode === id ? '.on' : ''}`, { onclick: () => { chartMode = id; refresh(); } }, label);

  return h('section.card',
    secTitle('scale', 'Morgengewicht'),
    h('div.weightrow',
      h('div.weightin', input, h('span.muted', 'kg')),
      h('div.stat',
        h('span.small.muted', `Schnitt KW ${isoWeek(monday)}`),
        h('b', thisWeek ? `${kg(thisWeek)} kg` : '–'),
        diff != null && h(`span.small.delta${diff >= 0 ? '.up' : '.down'}`, `${diff >= 0 ? '▲ +' : '▼ –'}${kg(Math.abs(diff))} kg zur Vorwoche`),
      ),
    ),
    h('div.segs', seg('woche', `Woche ${fmtShort(monday)}–${fmtShort(addDays(monday, 6))}`), seg('verlauf', '8 Wochen')),
    chartMode === 'woche'
      ? weekChart(body.weights(), monday, { refValue: lastWeek })
      : lineChart(body.weights(), { weeks: 8 }),
  );
}

// ---------- Kalender-Export ----------

async function calendarExport() {
  // Sonntags meint man meist schon die kommende Woche.
  const base = fromIso(day);
  const monday = base.getDay() === 0 && dayIsToday ? addDays(weekStart(base), 7) : weekStart(base);
  const { text, count } = body.weekIcs(monday);
  if (!count) return toast('Für diese Woche gibt es noch keine Mahlzeiten mit Uhrzeit.', 'error');
  if (!confirm(`${count} Erinnerungen für die Woche ${fmtShort(monday)}–${fmtShort(addDays(monday, 6))} als Kalender-Datei erstellen?`)) return;
  await saveFile(new Blob([text], { type: 'text/calendar' }), `essen-kw${isoWeek(monday)}.ics`, 'text/calendar');
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
    preview.replaceChildren(planPreview(pendingPlan));
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
      h('p.muted', 'Lege diesen Text in deinem Körper-Projekt als Anweisung ab. Dann kommt der Plan jeden Sonntag direkt im passenden Format.'),
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

function planPreview(plan) {
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

function goalsView() {
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
