/* ──────────────────────────────────────────────────────────────
   Routefolk PWA · app.js
   - Hash router (#/trips, #/trips/pyr, #/trips/pyr/journal, …)
   - CSS-variable palette switcher (persisted in localStorage)
   - Vanilla template-literal renderers, one per screen
   ────────────────────────────────────────────────────────────── */
(() => {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const html = (strings, ...values) => strings.map((s, i) => s + (values[i] == null ? '' : values[i])).join('');
  const esc  = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  // ─── Palette ────────────────────────────────────────────────
  const PALETTE_KEY = 'rf.palette';
  const PALETTES = ['forest', 'midnight', 'oxblood', 'alpine'];

  function setPalette(name) {
    if (!PALETTES.includes(name)) name = 'forest';
    document.documentElement.setAttribute('data-palette', name);
    try { localStorage.setItem(PALETTE_KEY, name); } catch {}
    $$('.rf-paletteOpt').forEach(b => b.classList.toggle('is-active', b.dataset.palette === name));
  }
  setPalette(localStorage.getItem(PALETTE_KEY) || 'forest');

  $('#rf-paletteFab').addEventListener('click', () => {
    const sheet = $('#rf-paletteSheet');
    const open = sheet.hasAttribute('hidden');
    if (open) { sheet.removeAttribute('hidden'); $('#rf-paletteFab').setAttribute('aria-expanded', 'true'); }
    else      { sheet.setAttribute('hidden', ''); $('#rf-paletteFab').setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.rf-paletteFab') && !e.target.closest('.rf-paletteSheet')) {
      $('#rf-paletteSheet').setAttribute('hidden', '');
      $('#rf-paletteFab').setAttribute('aria-expanded', 'false');
    }
    const opt = e.target.closest('.rf-paletteOpt');
    if (opt) setPalette(opt.dataset.palette);
  });

  // ─── Atoms (tiny helpers) ──────────────────────────────────
  const pill   = (s) => `<span class="rf-pill rf-pill--${esc(s)}">${esc(pillLabel(s))}</span>`;
  const stamp  = (txt, mod = '') => `<span class="rf-stamp ${mod}">${esc(txt)}</span>`;
  const kicker = (t) => `<div class="rf-kicker">${esc(t)}</div>`;
  const back   = (label) => `<a href="javascript:history.back()" class="rf-back"><span class="rf-back__arrow">←</span> ${esc(label)}</a>`;

  function pillLabel(s) {
    return { active: 'In progress', today: 'Today', planning: 'Planning', completed: 'Completed', cancelled: 'Cancelled', done: 'Done' }[s] || s;
  }

  // ─── Route → render ────────────────────────────────────────
  const routes = [
    { re: /^#?\/?$/,                                render: renderTrips,        tab: 'trips'   },
    { re: /^#\/trips\/?$/,                          render: renderTrips,        tab: 'trips'   },
    { re: /^#\/trips\/([^/]+)\/journal\/?$/,        render: renderJournal,      tab: 'trips'   },
    { re: /^#\/trips\/([^/]+)\/expenses\/?$/,       render: renderExpenses,     tab: 'trips'   },
    { re: /^#\/trips\/([^/]+)\/?$/,                 render: renderTripDetail,   tab: 'trips'   },
    { re: /^#\/archive\/?$/,                        render: renderArchive,      tab: 'archive' },
    { re: /^#\/account\/?$/,                        render: renderAccount,      tab: 'account' },
  ];

  function route() {
    const hash = location.hash || '#/trips';
    for (const r of routes) {
      const m = hash.match(r.re);
      if (m) {
        $('#rf-screen').innerHTML = r.render(...m.slice(1));
        $$('.rf-tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === r.tab));
        window.scrollTo(0, 0);
        attachLocalHandlers();
        return;
      }
    }
    $('#rf-screen').innerHTML = renderTrips();
  }
  window.addEventListener('hashchange', route);

  // Section-tab clicks (within a trip)
  function attachLocalHandlers() {
    $$('[data-section-tab]').forEach(t => {
      t.addEventListener('click', () => {
        const target = t.dataset.sectionTab;
        if (target) location.hash = target;
      });
    });
    $$('[data-chip]').forEach(c => {
      c.addEventListener('click', () => {
        const sib = c.parentElement.querySelectorAll('[data-chip]');
        sib.forEach(s => s.classList.toggle('is-active', s === c));
      });
    });
  }

  // ─── Screens ───────────────────────────────────────────────
  function renderTrips() {
    const D = window.RF_DATA;
    return html`
      <header class="rf-header">
        <div class="rf-header__row">
          <div>
            ${kicker('Routefolk · Field journal')}
            <h1 class="rf-title">Trips</h1>
            <div class="rf-sub">3 on the road map · 12 in archive</div>
          </div>
          <button class="rf-btn--new">+ New</button>
        </div>
      </header>

      <div class="rf-tripList">
        <div class="rf-chips">
          <button class="rf-chip is-active" data-chip>All active</button>
          <button class="rf-chip" data-chip>Planning</button>
          <button class="rf-chip" data-chip>Active</button>
        </div>

        ${D.upcoming.map((t, i) => tripCard(t, i === 0)).join('')}
      </div>
    `;
  }

  function tripCard(t, isActive) {
    return html`
      <a href="#/trips/pyr" class="rf-tripCard ${isActive ? 'is-active' : ''}">
        <span class="rf-tripCard__index">${esc(t.no)}</span>
        <div class="rf-tripCard__title">${esc(t.title)}</div>
        <div class="rf-tripCard__sub">${esc(t.sub)}</div>

        <div class="rf-tripCard__metaRow">
          <span class="rf-tripCard__dates">${esc(t.dates)}</span>
          ${pill(t.status)}
        </div>

        <div class="rf-ornament"><hr><span class="rf-ornament__mark">—</span><hr></div>

        <div class="rf-tripCard__footer">
          <div class="rf-tripCard__stats">
            <div class="rf-stat"><div class="rf-stat__v">${t.km}</div><div class="rf-stat__l">kilometres</div></div>
            <div class="rf-stat"><div class="rf-stat__v">${t.stages}</div><div class="rf-stat__l">stages</div></div>
          </div>
          ${isActive ? stamp('Day 2 / 5') : ''}
        </div>
      </a>
    `;
  }

  function renderTripDetail() {
    const D = window.RF_DATA;
    return html`
      <section class="rf-hero">
        ${back('Trips')}
        ${kicker('No. 16 · Spring 2026')}
        <h1 class="rf-hero__title">${esc(D.trip.title)}</h1>
        <div class="rf-hero__sub">${esc(D.trip.long)}</div>

        <div class="rf-hero__chips">
          ${pill('active')}
          ${stamp('Group · 4 riders', 'rf-stamp--accent')}
        </div>

        <div class="rf-routeSketch">${routeSketchSvg()}</div>
      </section>

      <nav class="rf-tabs">
        <button class="rf-tabs__tab is-active">Stages</button>
        <button class="rf-tabs__tab" data-section-tab="#/trips/pyr/journal">Journal</button>
        <button class="rf-tabs__tab" data-section-tab="#/trips/pyr/expenses">Costs</button>
        <button class="rf-tabs__tab">Summary</button>
      </nav>

      <div class="rf-stages">
        ${D.stages.map(stageRow).join('')}
        <button class="rf-btn--dashed">+ Add another stage</button>
      </div>
    `;
  }

  function stageRow(s) {
    const isToday = s.status === 'today';
    const done    = s.status === 'done';
    return html`
      <div class="rf-stage ${isToday ? 'is-today' : ''} ${done ? 'is-done' : ''}">
        <div class="rf-stage__numCol">
          <div class="rf-stage__num">${s.i}</div>
          <div class="rf-stage__rule"></div>
          <div class="rf-stage__day">${esc(s.day.split(' ')[0])}</div>
        </div>
        <div class="rf-stage__body">
          <div class="rf-stage__head">
            <span class="rf-stage__route">${esc(s.from)} <em>to</em> ${esc(s.to)}</span>
            ${isToday ? stamp('Today', 'rf-stamp--positive') : ''}
            ${done    ? '<span class="rf-check">✓ done</span>' : ''}
          </div>
          <div class="rf-stage__high">${esc(s.high)}</div>
          <div class="rf-stage__data">
            <span><span class="lbl">dist</span>${s.km}km</span>
            <span><span class="lbl">time</span>${esc(s.h)}</span>
            <span class="lbl">${esc(s.road)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderJournal() {
    const D = window.RF_DATA;
    const stage = D.stages[1];
    const stageEntries = D.entries.filter(e => e.stage === 2);
    const typeLabels = { meal: 'A meal', stop: 'A stop', lodging: 'A lodging', drink: 'A drink', note: 'A note' };

    return html`
      <section class="rf-hero">
        ${back('Pyrenees Crossing')}
        ${kicker('Stage II · ' + stage.day)}
        <h1 class="rf-hero__title">${esc(stage.from)} <em style="font-style:italic;color:var(--muted);font-weight:400">to</em> ${esc(stage.to)}</h1>
        <div class="rf-hero__sub">${esc(stage.high)} · ${stage.km} km · ${esc(stage.h)}</div>
      </section>

      <div class="rf-section" style="padding-top:14px">
        <div class="rf-sky">
          <div class="rf-sky__kicker">Sky advisory</div>
          <div class="rf-sky__row">
            ${D.weather.map(w => html`
              <div class="rf-sky__cell">
                <div class="rf-sky__loc ${w.warn ? 'is-warn' : ''}">${esc(w.l)}</div>
                <div class="rf-sky__icon">${esc(w.i)}</div>
                <div class="rf-sky__t">${esc(w.t)}</div>
                <div class="rf-sky__w ${w.warn ? 'is-warn' : ''}">${esc(w.w)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="rf-sectionHead">
          <div class="rf-sectionTitle">The day's notes</div>
          <button class="rf-btn--new">+ Add entry</button>
        </div>

        ${stageEntries.map((e, i) => html`
          <article class="rf-entry">
            <div class="rf-entry__mark">${i + 1}</div>
            <div class="rf-entry__body">
              <div class="rf-entry__head">
                <span class="rf-entry__type">${esc(typeLabels[e.type] || e.type)}</span>
                <span class="rf-entry__when">${esc(e.when)}</span>
              </div>
              <div class="rf-entry__title">${esc(e.title)}</div>
              <div class="rf-entry__loc">at ${esc(e.loc)}</div>
              ${e.note ? `<div class="rf-entry__note">${esc(e.note)}</div>` : ''}
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderExpenses() {
    const D = window.RF_DATA;
    const byCat = {};
    D.expenses.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + e.amt);
    const byPayer = {};
    D.expenses.forEach(e => byPayer[e.payer] = (byPayer[e.payer] || 0) + e.amt);
    const labels = { fuel: 'Fuel', food_drinks: 'Food & drinks', lodging: 'Lodging', tolls: 'Tolls', parking: 'Parking' };
    const total = D.totalEur;
    const euros = Math.round(total).toLocaleString();
    const cents = total.toFixed(2).split('.')[1];

    return html`
      <header class="rf-hero" style="padding-bottom:8px">
        ${back('Pyrenees Crossing')}
      </header>

      <nav class="rf-tabs">
        <button class="rf-tabs__tab" data-section-tab="#/trips/pyr">Stages</button>
        <button class="rf-tabs__tab" data-section-tab="#/trips/pyr/journal">Journal</button>
        <button class="rf-tabs__tab is-active">Costs</button>
        <button class="rf-tabs__tab">Summary</button>
      </nav>

      <div class="rf-section" style="padding-top:16px">
        <div class="rf-ledger">
          <div class="rf-ledger__label">The trip ledger</div>
          <div class="rf-ledger__total">€${euros}<span class="rf-ledger__cents">.${cents}</span></div>
          <div class="rf-ledger__stampRow"><hr>${stamp(D.expenses.length + ' entries · 4 payers')}<hr></div>
        </div>

        <div class="rf-h3">By category</div>
        <div class="rf-listCard">
          ${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => {
            const pct = (amt/total)*100;
            return html`
              <div class="rf-row">
                <div class="rf-row__label">
                  ${esc(labels[cat] || cat)}
                  <div class="rf-row__bar"><div class="rf-row__barFill" style="width:${pct.toFixed(0)}%"></div></div>
                </div>
                <div class="rf-row__v">€${amt.toFixed(0)}</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="rf-h3">By payer</div>
        <div class="rf-listCard">
          ${Object.entries(byPayer).sort((a,b)=>b[1]-a[1]).map(([p, amt]) => html`
            <div class="rf-payer">
              <div class="rf-payer__name">
                <span class="rf-avatar">${esc(p[0])}</span>
                <span style="font-family:var(--font-serif);font-size:14px">${esc(p)}</span>
              </div>
              <span class="rf-row__v" style="width:auto">€${amt.toFixed(0)}</span>
            </div>
          `).join('')}
        </div>

        <button class="rf-btn--primary">+ Log a new expense</button>
      </div>
    `;
  }

  function renderArchive() {
    const D = window.RF_DATA;
    const A = D.archiveTotals;
    return html`
      <header class="rf-header">
        <div class="rf-header__row">
          <div>
            ${kicker('The collection')}
            <h1 class="rf-title">Archive</h1>
            <div class="rf-sub">${A.trips} put to bed · 1 called off</div>
          </div>
        </div>
      </header>

      <div class="rf-section" style="padding-top:14px">
        <div class="rf-stats">
          <div class="rf-stats__head">
            <span class="rf-h3" style="margin:0">Lifetime totals</span>
            <span style="font-family:var(--font-serif);font-style:italic;font-size:11px;color:var(--muted)">since 2023</span>
          </div>
          <div class="rf-stats__grid">
            ${[
              ['Completed', A.trips, 'trips'],
              ['Distance',  A.km.toLocaleString(), 'kilometres'],
              ['Spent',     '€' + A.eur.toLocaleString(), ''],
              ['Notes',     A.entries, 'journal entries'],
            ].map(([k,v,u]) => html`
              <div>
                <div class="rf-stats__label">${esc(k)}</div>
                <div class="rf-stats__v">${esc(v)}</div>
                ${u ? `<div class="rf-stats__u">${esc(u)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <div class="rf-sectionHead" style="margin-bottom:6px">
          <span class="rf-h3" style="margin:0">The geography</span>
        </div>
        <div class="rf-chips">
          <button class="rf-chip is-active" data-chip>Heatmap</button>
          <button class="rf-chip" data-chip>Routes</button>
          <button class="rf-chip" data-chip>Hybrid</button>
        </div>

        <div class="rf-map">${archiveMapSvg()}</div>

        ${D.archived.map((t, i) => html`
          <div class="rf-archRow">
            <div>
              <div style="display:flex;align-items:baseline;gap:8px">
                <span class="rf-archRow__no">No. ${15 - i}</span>
                <span class="rf-archRow__title">${esc(t.title)}</span>
              </div>
              <div class="rf-archRow__meta">${t.year} · ${t.km} km · ${t.stages} stages</div>
            </div>
            <div class="rf-archRow__amt">€${t.eur}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderAccount() {
    const D = window.RF_DATA;
    const P = D.profile;
    return html`
      <header class="rf-header">
        <div class="rf-header__row">
          <div>
            ${kicker('The bearer')}
            <h1 class="rf-title">${esc(P.name.split(' ')[0])}</h1>
          </div>
        </div>
      </header>

      <div class="rf-section" style="padding-top:14px">
        <div class="rf-passport">
          <div class="rf-passport__photo">${esc(P.initials)}</div>
          <div class="rf-passport__body">
            <div class="rf-passport__kicker">The bearer</div>
            <div class="rf-passport__name">${esc(P.name)}</div>
            <div class="rf-passport__email">${esc(P.email)}</div>
          </div>
          <span class="rf-passport__stamp">${stamp('Member · ' + P.memberSince, 'rf-stamp--danger')}</span>
        </div>

        <div class="rf-h3" style="margin-top:0">Mileage to date</div>
        <div class="rf-lifetime">
          <div class="rf-lifetime__cell">
            <div class="rf-lifetime__v">${P.lifetime.trips}</div>
            <div class="rf-lifetime__l">Trips</div>
          </div>
          <div class="rf-lifetime__cell">
            <div class="rf-lifetime__v">${esc(P.lifetime.km)}</div>
            <div class="rf-lifetime__l">Distance</div>
          </div>
          <div class="rf-lifetime__cell">
            <div class="rf-lifetime__v">${P.lifetime.days}</div>
            <div class="rf-lifetime__l">Days</div>
          </div>
        </div>

        <div class="rf-h3">Preferences</div>
        <div class="rf-prefList">
          ${[
            ['Default trip visibility', 'Group'],
            ['Distance unit',           'Kilometres'],
            ['Currency',                'Euro (€)'],
            ['Notifications',           'On'],
          ].map(([k, v]) => html`
            <div class="rf-prefRow">
              <span class="rf-prefRow__k">${esc(k)}</span>
              <span class="rf-prefRow__v">${esc(v)} ›</span>
            </div>
          `).join('')}
        </div>

        <button class="rf-btn--ghost">Sign out</button>
        <div class="rf-foot">routefolk · v0.6.2 · build 20260514</div>
      </div>
    `;
  }

  // ─── Inline SVG: route sketch ──────────────────────────────
  function routeSketchSvg() {
    return `
      <svg viewBox="0 0 320 60" width="100%" height="60">
        <line x1="20" y1="40" x2="300" y2="40" stroke="var(--rule-2)" stroke-width="0.6" stroke-dasharray="2 3"/>
        <path d="M20,40 C60,30 80,15 120,18 C160,21 180,10 220,16 C260,22 280,35 300,40" fill="none" stroke="var(--primary)" stroke-width="1.8"/>
        <path d="M115,18 l4,-9 l5,9 z M165,15 l5,-12 l6,12 z M218,16 l4,-8 l5,8 z" fill="var(--accent)" opacity="0.85"/>
        ${[20,80,140,205,260,300].map((x, i) => `
          <circle cx="${x}" cy="40" r="3.5" fill="var(--surface)" stroke="var(--primary)" stroke-width="1.4"/>
          <text x="${x}" y="54" font-family="IBM Plex Mono, monospace" font-size="7.5" fill="var(--muted)" text-anchor="middle">D${i+1}</text>
        `).join('')}
        <text x="22"  y="14" font-family="Newsreader, serif" font-style="italic" font-size="10" fill="var(--ink-2)">Bordeaux</text>
        <text x="285" y="14" font-family="Newsreader, serif" font-style="italic" font-size="10" fill="var(--ink-2)" text-anchor="end">Barcelona</text>
      </svg>
    `;
  }

  // ─── Inline SVG: archive map ───────────────────────────────
  function archiveMapSvg() {
    return `
      <svg viewBox="0 0 360 240" preserveAspectRatio="xMidYMid slice">
        <rect width="360" height="240" fill="var(--surface)"/>
        <g fill="none" stroke="color-mix(in srgb, var(--primary) 25%, transparent)" stroke-width="0.7">
          <ellipse cx="170" cy="120" rx="120" ry="55"/>
          <ellipse cx="170" cy="120" rx="95"  ry="42"/>
          <ellipse cx="170" cy="120" rx="70"  ry="30"/>
          <ellipse cx="170" cy="120" rx="45"  ry="20"/>
          <ellipse cx="170" cy="120" rx="22"  ry="10"/>
        </g>
        <g fill="none" stroke="color-mix(in srgb, var(--primary) 12%, transparent)" stroke-width="0.5">
          <ellipse cx="170" cy="120" rx="140" ry="65"/>
          <ellipse cx="170" cy="120" rx="155" ry="72"/>
        </g>
        <path d="M40,80 L80,70 L130,60 L180,70 L230,80 L270,85 L300,100 L320,135 L300,160 L270,170 L240,175 L220,200 L180,210 L150,205 L110,195 L80,180 L55,160 L40,130 Z" fill="none" stroke="var(--ink-2)" stroke-width="0.9"/>
        ${[[100,150,'Picos','25'],[170,115,'Pyrenees','26'],[220,100,'Alps','23'],[252,155,'Dolomites','24']].map(([x,y,l,yr]) => `
          <g>
            <circle cx="${x}" cy="${y}" r="6" fill="var(--accent-soft)" stroke="var(--primary)" stroke-width="1.2"/>
            <circle cx="${x}" cy="${y}" r="2" fill="var(--primary)"/>
            <text x="${x+10}" y="${y-2}" font-family="Newsreader, serif" font-size="11" fill="var(--ink)">${l}</text>
            <text x="${x+10}" y="${y+9}" font-family="IBM Plex Mono, monospace" font-size="8" fill="var(--muted)">'${yr}</text>
          </g>
        `).join('')}
        <path d="M80,160 Q110,140 140,150 Q170,160 200,140 Q230,120 260,110" fill="none" stroke="var(--primary)" stroke-width="1.2" stroke-dasharray="3 2"/>
        <path d="M90,180 Q120,170 160,170 Q200,170 240,180" fill="none" stroke="var(--primary)" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.7"/>
        <g transform="translate(322, 32)">
          <circle r="14" fill="rgba(255,255,255,0.5)" stroke="var(--rule-2)" stroke-width="0.6"/>
          <path d="M0,-12 L3,0 L0,12 L-3,0 Z" fill="var(--primary)"/>
          <text x="0" y="-16" font-family="Newsreader, serif" font-size="8" fill="var(--ink)" text-anchor="middle" font-style="italic">N</text>
        </g>
        <g transform="translate(16, 210)">
          <rect width="120" height="20" fill="rgba(255,255,255,0.7)" stroke="var(--rule-2)" stroke-width="0.5" rx="2"/>
          <text x="8" y="13" font-family="IBM Plex Mono, monospace" font-size="8" fill="var(--ink-2)" letter-spacing="0.1em">1 cm ≈ 40 km</text>
        </g>
      </svg>
    `;
  }

  // ─── Boot ──────────────────────────────────────────────────
  if (!location.hash) location.hash = '#/trips';
  route();
})();
