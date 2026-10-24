// Wochenziele: Abhak-Liste (Startseite) und Bearbeiten (Review, Wochenansicht).
import * as week from '../week.js';
import { AREAS } from '../areas.js';
import { h, icon } from '../ui.js';

// Alle Ziele der Woche, nach Bereich gruppiert – Antippen hakt ab.
export function goalChecklist(monday, refresh) {
  const groups = AREAS.map((a) => ({ a, list: week.goals(monday, a.id) })).filter((g) => g.list.length);
  if (!groups.length) return null;
  return groups.map(({ a, list }) => h(`div.goalgroup.a-${a.id}`,
    h('p.goalarea', icon(a.id, 15), a.tab),
    list.map((g) => h(`button.check${g.done ? '.done' : ''}`, {
      onclick: () => {
        week.updateGoal(g, { done: !g.done });
        refresh();
      },
    }, h('span.box', icon('check', 18)), h('span.check-name', g.text))),
  ));
}

// Ziele eines Bereichs bearbeiten. suggestions: offene Ziele der Vorwoche zum Übernehmen.
export function goalEditor(monday, area, refresh, suggestions = []) {
  const list = week.goals(monday, area);
  const full = list.length >= week.MAX_GOALS;
  const input = h('input.input', {
    placeholder: list.length ? 'Weiteres Ziel …' : 'z. B. 4× Training',
    enterkeyhint: 'done',
    onkeydown: (e) => e.key === 'Enter' && add(),
  });
  function add() {
    const t = input.value.trim();
    if (!t) return;
    week.addGoal(monday, area, t);
    refresh();
  }
  const open = suggestions.filter((s) => !list.some((g) => g.text === s));

  return h('div.goaledit',
    list.map((g) => h('div.editrow.add2',
      h('input.input', { value: g.text, onchange: (e) => e.target.value.trim() && week.updateGoal(g, { text: e.target.value.trim() }) }),
      h('button.pill.del', {
        'aria-label': 'Ziel löschen',
        onclick: () => {
          week.deleteGoal(g);
          refresh();
        },
      }, icon('trash', 18)),
    )),
    !full && h('div.editrow.add2', input, h('button.pill.add', { 'aria-label': 'Ziel hinzufügen', onclick: add }, icon('plus', 20))),
    !full && open.length > 0 && h('div.suggest',
      h('span.small.muted', 'Aus letzter Woche übernehmen:'),
      h('div.chips', open.map((s) => h('button.chip', {
        onclick: () => {
          week.addGoal(monday, area, s);
          refresh();
        },
      }, `↻ ${s}`))),
    ),
    full && h('p.small.muted', 'Drei Ziele sind genug – weniger ist oft mehr.'),
  );
}
