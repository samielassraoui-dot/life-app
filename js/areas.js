// Die vier Lebensbereiche: Name, Farbe (siehe CSS-Variablen), Ziel.
export const AREAS = [
  {
    id: 'koerper',
    name: 'Körper',
    tab: 'Körper',
    goal: 'Muskelaufbau von 70 auf 80–85 kg, definiert bis Sommer 2027',
    stage: 2,
    coming: [
      'Mahlzeiten des Tages mit „Gegessen“ / „Nicht gegessen“',
      'Tagessummen für Kalorien, Protein, Kohlenhydrate, Fett',
      'Spontanes Essen schnell nachtragen',
      'Wochenplan-Import (Meal Prep) mit fester Vorlage',
      'Training pro Tag abhaken',
      'Morgengewicht mit Wochenschnitt und Verlauf',
      'Routinen mit Uhrzeit – frei hinzufügen und löschen',
    ],
  },
  {
    id: 'sinn',
    name: 'Reflexion & Sinn',
    tab: 'Sinn',
    goal: 'Mehr Ruhe, Selbstwert und Selbstvertrauen – bewusst leben',
    stage: 4,
    coming: [
      'Meditation abhaken',
      'Eine Affirmation am Tag',
      'Kurzes Journal mit eigenen Fragen',
      'Stimmung und Energie (1–5) mit Verlauf',
    ],
  },
  {
    id: 'leistung',
    name: 'Leistung',
    tab: 'Leistung',
    goal: 'Fachlich wachsen und das Studium erfolgreich abschließen',
    stage: 6,
    coming: [
      'Vier Lernfelder: SAP HCM Customizing, Payroll, Uni, Englisch',
      '„Heute gelernt“ mit einem Tipp abhaken',
      'Wochenziel: wie oft pro Woche je Lernfeld',
      'Abgaben, Prüfungen und Termine mit Countdown',
    ],
  },
  {
    id: 'contact',
    name: 'Contact',
    tab: 'Contact',
    goal: 'Beziehungen bewusst pflegen und meinen Kreis aufbauen',
    stage: 5,
    coming: [
      'Dein Kreis: du in der Mitte, Menschen in vier Ringen',
      'Kontaktrhythmus und „Kontakt gehabt“',
      'Haken: „Ich habe mich gemeldet“ und „Treffen geplant“',
      'Sanfte Hinweise und anstehende Geburtstage',
    ],
  },
];

export const byId = Object.fromEntries(AREAS.map((a) => [a.id, a]));
