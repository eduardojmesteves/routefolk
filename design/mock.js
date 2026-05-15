// Mock data for the PWA prototype.
// In production, swap for fetch() against the real API.
window.RF_DATA = (() => {
  const trip = {
    id: 't_pyr_2026',
    title: 'Pyrenees Crossing',
    sub: 'Bordeaux to Barcelona',
    no: 'No. 16',
    dates: '14 — 18 May 2026',
    daysLine: '14 — 18 May 2026 · day 2 of 5',
    long: 'Bordeaux to Barcelona, by way of the Tourmalet and Andorra',
    status: 'active',
    km: 903,
    stages: 5,
  };

  const upcoming = [
    trip,
    { title: 'Norwegian Atlantic', sub: 'Bergen to Lofoten', no: 'No. 17', dates: '04 — 14 Jul 2026', km: 2140, stages: 9, status: 'planning' },
    { title: 'Scottish NC500',     sub: 'A coastal loop',    no: 'No. 18', dates: '12 — 18 Sep 2026', km:  850, stages: 5, status: 'planning' },
  ];

  const stages = [
    { i: 1, day: 'Thu 14 May', from: 'Bordeaux', to: 'Pau',                  km: 214, h: '3h 02', road: 'A63 · A65',        high: 'Coast → vineyards',     status: 'done'    },
    { i: 2, day: 'Fri 15 May', from: 'Pau',      to: 'Luchon',               km: 187, h: '4h 41', road: 'N134 · D918',      high: 'Col du Tourmalet 2115 m', status: 'today'   },
    { i: 3, day: 'Sat 16 May', from: 'Luchon',   to: 'Andorra la Vella',     km: 168, h: '4h 18', road: 'N230 · Bonaigua',  high: 'Port de la Bonaigua',    status: 'planned' },
    { i: 4, day: 'Sun 17 May', from: 'Andorra',  to: 'Lleida',               km: 156, h: '2h 49', road: 'C-13',             high: 'Pallars Sobirà gorges',  status: 'planned' },
    { i: 5, day: 'Mon 18 May', from: 'Lleida',   to: 'Barcelona',            km: 178, h: '2h 12', road: 'AP-2 · N-II',      high: 'Montserrat detour',      status: 'planned' },
  ];

  const entries = [
    { stage: 2, type: 'stop',    when: '11:25', title: 'Tourmalet summit photo',    loc: 'Col du Tourmalet', note: 'Snowbanks still on north face. 8°C, wind from W.' },
    { stage: 2, type: 'drink',   when: '17:55', title: 'Beers at Le Sherpa',        loc: 'Luchon',           note: '' },
    { stage: 1, type: 'meal',    when: '13:40', title: 'Cassoulet at Chez Boulan',  loc: 'Arcachon',         note: 'Surprise: best stop of day 1. Cash only.' },
  ];

  const expenses = [
    { cat: 'fuel',        amt: 122.60, payer: 'Eduardo' },
    { cat: 'food_drinks', amt: 253.50, payer: 'Marta'   },
    { cat: 'lodging',     amt: 414.00, payer: 'Eduardo' },
    { cat: 'tolls',       amt: 33.10,  payer: 'Tomás'   },
    { cat: 'food_drinks', amt: 72.90,  payer: 'Marta'   },
    { cat: 'tolls',       amt: 18.80,  payer: 'Eduardo' },
  ];
  const totalEur = expenses.reduce((s, e) => s + e.amt, 0);

  const archived = [
    { title: 'Picos de Europa Loop',  year: 2025, km: 1240, stages: 6, eur: 1980, status: 'completed' },
    { title: 'Dolomites Sprint',      year: 2024, km: 1685, stages: 7, eur: 2410, status: 'completed' },
    { title: 'Atlantic Coast',        year: 2024, km:  890, stages: 4, eur: 1340, status: 'completed' },
  ];

  const archiveTotals = { trips: 4, km: 5155, eur: 7830, entries: 87 };

  const weather = [
    { l: 'Pau',       t: '14–22°', i: '☀', w: '8 km/h NW',  warn: false },
    { l: 'Tourmalet', t: '4–9°',   i: '⛅', w: '32 km/h W',  warn: true  },
    { l: 'Luchon',    t: '11–16°', i: '☁', w: '14 km/h SW', warn: false },
  ];

  const profile = {
    initials: 'EE',
    name: 'Eduardo Esteves',
    email: 'edu@routefolk.app',
    memberSince: '2023',
    lifetime: { trips: 15, km: '7,420 km', days: 64 },
  };

  return { trip, upcoming, stages, entries, expenses, totalEur, archived, archiveTotals, weather, profile };
})();
