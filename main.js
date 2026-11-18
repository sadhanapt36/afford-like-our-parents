import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const C = {
  home: '#2a78d6',
  rent: '#eb6834',
  income: '#1baf7a',
  overall: '#9a9993',
  city: '#2a78d6',
  highlight: '#eb6834',
  band: '#ebeae6',
  ink: '#0b0b0b',
  ink2: '#52514e',
  surface: '#fcfcfb',
};

const fmtX = (v) => `${d3.format('.1f')(v)}×`;
const fmtPct = (v) => `${d3.format('.1f')(v)}%`;
const fmtChg = (v) => `${v >= 0 ? '+' : ''}${d3.format('.0f')(v)}%`;
const fmtMoney = d3.format('$,.0f');
const fmtMoneyK = (v) => (v >= 1e6 ? `$${d3.format('.2f')(v / 1e6)}M` : `$${d3.format(',.0f')(v / 1e3)}K`);

const state = { parentYear: 1995, city: 'San Diego, CA' };

const [national, metros] = await Promise.all([
  d3.csv('data/national.csv', d3.autoType),
  d3.csv('data/metros.csv', d3.autoType),
]);

const NAT_FIRST = d3.min(national, (d) => d.year);
const NAT_LAST = d3.max(national, (d) => d.year);
const natByYear = new Map(national.map((d) => [d.year, d]));

const byMetro = d3.group(metros, (d) => d.metro);
for (const rows of byMetro.values()) rows.sort((a, b) => a.year - b.year);

const METRO_FIRST = d3.min(metros, (d) => d.year);
const METRO_LAST = d3.max(metros, (d) => d.year);
// Every year from first to last, so a missing year (2020) shows up as a gap.
const allYears = d3.range(METRO_FIRST, METRO_LAST + 1);
const yearsWithData = new Set(metros.map((d) => d.year));

// Middle-half band and median of rent burden across all metros, per year.
const yearStats = allYears.map((year) => {
  if (!yearsWithData.has(year)) return { year, q1: null, med: null, q3: null };
  const vals = metros.filter((d) => d.year === year).map((d) => d.rent_burden).sort(d3.ascending);
  return {
    year,
    q1: d3.quantileSorted(vals, 0.25),
    med: d3.quantileSorted(vals, 0.5),
    q3: d3.quantileSorted(vals, 0.75),
  };
});

// Change from first to last year, for metros present in both.
const scatterData = [];
for (const [metro, rows] of byMetro) {
  const a = rows.find((d) => d.year === METRO_FIRST);
  const b = rows.find((d) => d.year === METRO_LAST);
  if (!a || !b) continue;
  scatterData.push({
    metro,
    incomeChg: (b.income / a.income - 1) * 100,
    rentChg: (b.rent / a.rent - 1) * 100,
    population: b.population,
    burden: b.rent_burden,
  });
}
scatterData.sort((a, b) => b.population - a.population); // big dots drawn first

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
const yearInput = document.querySelector('#parent-year');
const yearOut = document.querySelector('#parent-year-out');
const citySelect = document.querySelector('#city');

yearInput.min = NAT_FIRST;
yearInput.max = Math.min(2005, NAT_LAST - 5);
yearInput.value = state.parentYear;
yearOut.textContent = state.parentYear;

const latestMetros = [...byMetro.keys()]
  .filter((m) => byMetro.get(m).at(-1).year === METRO_LAST)
  .sort(d3.ascending);
if (!latestMetros.includes(state.city)) state.city = latestMetros[0];
citySelect.innerHTML = latestMetros.map((m) => `<option value="${m}">${m}</option>`).join('');
citySelect.value = state.city;

yearInput.addEventListener('input', () => {
  state.parentYear = +yearInput.value;
  yearOut.textContent = state.parentYear;
  drawNational();
});
citySelect.addEventListener('change', () => setCity(citySelect.value));

function setCity(metro) {
  state.city = metro;
  citySelect.value = metro;
  drawCity();
  drawScatter();
}

// ---------------------------------------------------------------------------
// Tooltip + small helpers
// ---------------------------------------------------------------------------
const tooltip = document.querySelector('#tooltip');

function showTip(html, event) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  const pad = 14;
  const { width, height } = tooltip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + width > window.innerWidth - 8) x = event.clientX - width - pad;
  if (y + height > window.innerHeight - 8) y = event.clientY - height - pad;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}
const hideTip = () => { tooltip.hidden = true; };

const ttRow = (label, value, color) => `
  <div class="tt-row">
    <span class="tt-key">${color ? `<span class="swatch" style="background:${color}"></span>` : ''}${label}</span>
    <span class="tt-val">${value}</span>
  </div>`;

// Spread end-of-line labels so they never overlap.
function placeLabels(items, minGap, top, bottom) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) {
    if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
  }
  const overflow = items.at(-1).y - bottom;
  if (overflow > 0) items.forEach((d) => { d.y -= overflow; });
  if (items[0].y < top) {
    const shift = top - items[0].y;
    items.forEach((d) => { d.y += shift; });
  }
  return items;
}

function makeSvg(selector, height, margin) {
  const container = document.querySelector(selector);
  container.querySelectorAll('svg, .legend').forEach((el) => el.remove());
  const width = Math.max(320, container.clientWidth - 8);
  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', width)
    .attr('height', height);
  return {
    svg,
    container,
    width,
    height,
    innerW: width - margin.left - margin.right,
    innerH: height - margin.top - margin.bottom,
    g: svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`),
  };
}

function addLegend(container, items) {
  const legend = d3.select(container).insert('div', 'svg').attr('class', 'legend');
  for (const it of items) {
    const span = legend.append('span');
    span.append('span')
      .attr('class', `swatch ${it.style || ''}`)
      .style('background', it.color)
      .style('color', it.color);
    span.append('span').text(it.label);
  }
}

// ---------------------------------------------------------------------------
// Chart 1: national growth since the parents' year
// ---------------------------------------------------------------------------
const NAT_SERIES = [
  { key: 'home_price', label: 'Home prices', color: C.home },
  { key: 'cpi_rent', label: 'Rent', color: C.rent },
  { key: 'income', label: 'Household income', color: C.income },
  { key: 'cpi_all', label: 'Overall prices', color: C.overall, dashed: true },
];

function drawNational() {
  const py = state.parentYear;
  const base = natByYear.get(py);
  const last = natByYear.get(NAT_LAST);
  const rows = national.filter((d) => d.year >= py);
  const growth = (d, key) => d[key] / base[key];

  // ---- words ----
  const g = Object.fromEntries(NAT_SERIES.map((s) => [s.key, growth(last, s.key)]));
  document.querySelector('#national-readout').innerHTML =
    `Since <strong>${py}</strong>, the typical home's price has grown <strong>${fmtX(g.home_price)}</strong> and rent `
    + `<strong>${fmtX(g.cpi_rent)}</strong>, but household income has grown only <strong>${fmtX(g.income)}</strong>. `
    + `Overall prices grew ${fmtX(g.cpi_all)} over the same years.`;

  const ratio0 = base.home_price / base.income;
  const ratio1 = last.home_price / last.income;
  const toToday = (d, key) => d[key] * (last.cpi_all / d.cpi_all);
  document.querySelector('#national-stats').innerHTML = `
    <div class="stat">
      <p class="stat-label">Years of income to buy the median home</p>
      <p class="stat-value">${ratio0.toFixed(1)}<span class="arrow">→</span>${ratio1.toFixed(1)}</p>
      <p class="stat-sub">${py} → ${NAT_LAST}</p>
    </div>
    <div class="stat">
      <p class="stat-label">Median home sale price, in ${NAT_LAST} dollars</p>
      <p class="stat-value">${fmtMoneyK(toToday(base, 'home_price'))}<span class="arrow">→</span>${fmtMoneyK(last.home_price)}</p>
      <p class="stat-sub">${fmtChg((last.home_price / toToday(base, 'home_price') - 1) * 100)} after inflation</p>
    </div>
    <div class="stat">
      <p class="stat-label">Median household income, in ${NAT_LAST} dollars</p>
      <p class="stat-value">${fmtMoneyK(toToday(base, 'income'))}<span class="arrow">→</span>${fmtMoneyK(last.income)}</p>
      <p class="stat-sub">${fmtChg((last.income / toToday(base, 'income') - 1) * 100)} after inflation</p>
    </div>`;

  // ---- chart ----
  const margin = { top: 20, right: 175, bottom: 36, left: 48 };
  const { svg, container, innerW, innerH, g: plot } = makeSvg('#chart-national', 380, margin);
  addLegend(container, NAT_SERIES.map((s) => ({ label: s.label, color: s.color, style: s.dashed ? 'dashed' : '' })));

  const x = d3.scaleLinear().domain([py, NAT_LAST]).range([0, innerW]);
  const maxG = d3.max(NAT_SERIES, (s) => d3.max(rows, (d) => growth(d, s.key)));
  const y = d3.scaleLinear().domain([Math.min(0.9, d3.min(NAT_SERIES, (s) => d3.min(rows, (d) => growth(d, s.key)))), maxG * 1.05]).nice().range([innerH, 0]);

  plot.append('g').attr('class', 'gridline')
    .call(d3.axisLeft(y).ticks(6).tickSize(-innerW).tickFormat(''));
  plot.append('g').attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat((v) => `${d3.format('.1~f')(v)}×`));
  plot.append('g').attr('class', 'axis').attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(Math.max(2, Math.min(Math.floor(innerW / 70), NAT_LAST - py))).tickFormat(d3.format('d')));

  plot.append('line').attr('class', 'ref-line')
    .attr('x1', 0).attr('x2', innerW).attr('y1', y(1)).attr('y2', y(1));
  plot.append('text').attr('class', 'annotation')
    .attr('x', innerW - 4).attr('y', y(1) - 6).attr('text-anchor', 'end')
    .text(`1× = ${py} level`);

  const line = (key) => d3.line().x((d) => x(d.year)).y((d) => y(growth(d, key))).curve(d3.curveMonotoneX)(rows);
  for (const s of NAT_SERIES) {
    plot.append('path')
      .attr('d', line(s.key))
      .attr('fill', 'none')
      .attr('stroke', s.color)
      .attr('stroke-width', s.dashed ? 1.5 : 2.5)
      .attr('stroke-dasharray', s.dashed ? '5 4' : null)
      .attr('stroke-linecap', 'round');
  }

  // direct labels at the right end
  const labels = placeLabels(
    NAT_SERIES.map((s) => ({ ...s, v: growth(last, s.key), y: y(growth(last, s.key)) })),
    17, 0, innerH,
  );
  const lab = plot.append('g').attr('transform', `translate(${innerW + 10},0)`);
  for (const l of labels) {
    const t = lab.append('text').attr('y', l.y).attr('dy', '0.35em');
    t.append('tspan').attr('class', 'series-label').text(`${l.label} `);
    t.append('tspan').attr('class', 'series-value').text(fmtX(l.v));
  }

  // hover: crosshair + tooltip
  const hover = plot.append('g').style('display', 'none');
  hover.append('line').attr('class', 'crosshair').attr('y1', 0).attr('y2', innerH);
  const hoverDots = NAT_SERIES.map((s) => hover.append('circle')
    .attr('r', 4.5).attr('fill', s.color).attr('stroke', C.surface).attr('stroke-width', 2));

  plot.append('rect')
    .attr('width', innerW).attr('height', innerH)
    .attr('fill', 'transparent')
    .on('pointermove', (event) => {
      const [mx] = d3.pointer(event);
      const year = Math.round(x.invert(mx));
      const d = natByYear.get(Math.max(py, Math.min(NAT_LAST, year)));
      hover.style('display', null);
      hover.select('line').attr('x1', x(d.year)).attr('x2', x(d.year));
      NAT_SERIES.forEach((s, i) => hoverDots[i].attr('cx', x(d.year)).attr('cy', y(growth(d, s.key))));
      showTip(
        `<div class="tt-title">${d.year}</div>`
        + NAT_SERIES.map((s) => ttRow(s.label, fmtX(growth(d, s.key)), s.color)).join('')
        + ttRow('Years of income for a home', (d.home_price / d.income).toFixed(1)),
        event,
      );
    })
    .on('pointerleave', () => { hover.style('display', 'none'); hideTip(); });
}

// ---------------------------------------------------------------------------
// Chart 2: rent burden in the chosen city vs all metros
// ---------------------------------------------------------------------------
function drawCity() {
  const rows = byMetro.get(state.city);
  const cityByYear = new Map(rows.map((d) => [d.year, d]));
  const first = rows[0];
  const last = rows.at(-1);
  const shortName = state.city.split(',')[0];
  const series = allYears.map((year) => ({ year, v: cityByYear.get(year)?.rent_burden ?? null }));
  const statLast = yearStats.find((d) => d.year === last.year);

  // ---- words ----
  const delta = last.rent_burden - first.rent_burden;
  document.querySelector('#city-title').textContent = delta > 0.5
    ? `In ${shortName}, rent takes a bigger share of income than it did in ${first.year}`
    : delta < -0.5
      ? `In ${shortName}, rent's share of income has eased since ${first.year}, but rent itself has climbed`
      : `In ${shortName}, rent's share of income has barely moved since ${first.year}`;

  const rentChg = (last.rent / first.rent - 1) * 100;
  const incChg = (last.income / first.income - 1) * 100;
  document.querySelector('#city-readout').innerHTML =
    `In ${state.city}, median rent went from <strong>${fmtMoney(first.rent)}</strong> a month in ${first.year} to `
    + `<strong>${fmtMoney(last.rent)}</strong> in ${last.year} (${fmtChg(rentChg)}), while median household income went from `
    + `${fmtMoney(first.income)} to ${fmtMoney(last.income)} (${fmtChg(incChg)}). `
    + `The typical renter there now spends <strong>${fmtPct(last.rent_burden)}</strong> of their income on rent`
    + `${last.rent_burden >= 30 ? ', above the 30% line that marks a household as "rent-burdened."' : '.'}`;

  const allLatest = metros.filter((d) => d.year === last.year);
  const medRatio = d3.median(allLatest, (d) => d.home_value / d.income);
  const rank = allLatest.filter((d) => d.rent_burden > last.rent_burden).length + 1;
  document.querySelector('#city-stats').innerHTML = `
    <div class="stat">
      <p class="stat-label">Median rent, ${first.year} → ${last.year}</p>
      <p class="stat-value">${fmtChg(rentChg)}</p>
      <p class="stat-sub">vs. ${fmtChg(incChg)} for household income</p>
    </div>
    <div class="stat">
      <p class="stat-label">Rent as a share of renters' income, ${last.year}</p>
      <p class="stat-value">${fmtPct(last.rent_burden)}</p>
      <p class="stat-sub">#${rank} highest of ${allLatest.length} metros</p>
    </div>
    <div class="stat">
      <p class="stat-label">Years of income to buy the median home, ${last.year}</p>
      <p class="stat-value">${(last.home_value / last.income).toFixed(1)}</p>
      <p class="stat-sub">Median metro: ${medRatio.toFixed(1)}</p>
    </div>`;

  // ---- chart ----
  const margin = { top: 20, right: 170, bottom: 36, left: 48 };
  const { container, innerW, innerH, g: plot } = makeSvg('#chart-city', 360, margin);
  addLegend(container, [
    { label: state.city, color: C.city },
    { label: 'Median metro', color: C.ink2, style: 'dashed' },
    { label: 'Middle half of metros', color: C.band, style: 'band' },
  ]);

  const x = d3.scaleLinear().domain([METRO_FIRST, METRO_LAST]).range([0, innerW]);
  const lo = d3.min([...yearStats.map((d) => d.q1), ...series.map((d) => d.v)].filter((v) => v != null));
  const hi = d3.max([...yearStats.map((d) => d.q3), ...series.map((d) => d.v), 30].filter((v) => v != null));
  const y = d3.scaleLinear().domain([Math.min(lo, 30) - 1.5, hi + 1.5]).nice().range([innerH, 0]);

  plot.append('g').attr('class', 'gridline')
    .call(d3.axisLeft(y).ticks(6).tickSize(-innerW).tickFormat(''));
  plot.append('g').attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat((v) => `${v}%`));
  plot.append('g').attr('class', 'axis').attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(innerW / 70))).tickFormat(d3.format('d')));

  plot.append('path')
    .datum(yearStats)
    .attr('fill', C.band)
    .attr('d', d3.area().defined((d) => d.q1 != null).x((d) => x(d.year)).y0((d) => y(d.q1)).y1((d) => y(d.q3)));

  plot.append('line').attr('class', 'ref-line')
    .attr('x1', 0).attr('x2', innerW).attr('y1', y(30)).attr('y2', y(30));

  plot.append('path')
    .datum(yearStats)
    .attr('fill', 'none').attr('stroke', C.ink2).attr('stroke-width', 1.5).attr('stroke-dasharray', '5 4')
    .attr('d', d3.line().defined((d) => d.med != null).x((d) => x(d.year)).y((d) => y(d.med)));

  plot.append('path')
    .datum(series)
    .attr('fill', 'none').attr('stroke', C.city).attr('stroke-width', 2.5).attr('stroke-linecap', 'round')
    .attr('d', d3.line().defined((d) => d.v != null).x((d) => x(d.year)).y((d) => y(d.v)));

  plot.append('circle')
    .attr('cx', x(last.year)).attr('cy', y(last.rent_burden)).attr('r', 4.5)
    .attr('fill', C.city).attr('stroke', C.surface).attr('stroke-width', 2);

  const labels = placeLabels([
    { label: shortName, v: last.rent_burden, y: y(last.rent_burden) },
    { label: 'Median metro', v: statLast.med, y: y(statLast.med) },
    { label: 'Rent-burdened', v: 30, y: y(30), muted: true },
  ], 18, 0, innerH);
  const lab = plot.append('g').attr('transform', `translate(${innerW + 10},0)`);
  for (const l of labels) {
    const t = lab.append('text').attr('y', l.y).attr('dy', '0.35em');
    t.append('tspan').attr('class', l.muted ? 'series-value' : 'series-label').text(`${l.label} `);
    t.append('tspan').attr('class', 'series-value').text(l.muted ? 'line, 30%' : fmtPct(l.v));
  }

  // gap note for 2020
  if (!yearsWithData.has(2020) && 2020 > METRO_FIRST && 2020 < METRO_LAST) {
    plot.append('text').attr('class', 'annotation')
      .attr('x', x(2020)).attr('y', innerH - 8).attr('text-anchor', 'middle')
      .text('no 2020 data');
  }

  const hover = plot.append('g').style('display', 'none');
  hover.append('line').attr('class', 'crosshair').attr('y1', 0).attr('y2', innerH);
  const dotCity = hover.append('circle').attr('r', 4.5).attr('fill', C.city).attr('stroke', C.surface).attr('stroke-width', 2);
  const dotMed = hover.append('circle').attr('r', 4).attr('fill', C.ink2).attr('stroke', C.surface).attr('stroke-width', 2);

  plot.append('rect')
    .attr('width', innerW).attr('height', innerH).attr('fill', 'transparent')
    .on('pointermove', (event) => {
      const [mx] = d3.pointer(event);
      const year = Math.max(METRO_FIRST, Math.min(METRO_LAST, Math.round(x.invert(mx))));
      const d = cityByYear.get(year);
      const s = yearStats.find((r) => r.year === year);
      hover.style('display', null);
      hover.select('line').attr('x1', x(year)).attr('x2', x(year));
      dotCity.style('display', d ? null : 'none').attr('cx', x(year)).attr('cy', d ? y(d.rent_burden) : 0);
      dotMed.style('display', s.med != null ? null : 'none').attr('cx', x(year)).attr('cy', s.med != null ? y(s.med) : 0);
      showTip(
        `<div class="tt-title">${year}</div>`
        + (d
          ? ttRow(`${shortName} rent burden`, fmtPct(d.rent_burden), C.city)
            + ttRow('Median rent', fmtMoney(d.rent))
            + ttRow('Median income', fmtMoney(d.income))
          : ttRow(shortName, 'no estimate'))
        + (s.med != null ? ttRow('Median metro', fmtPct(s.med), C.ink2) : ''),
        event,
      );
    })
    .on('pointerleave', () => { hover.style('display', 'none'); hideTip(); });
}

// ---------------------------------------------------------------------------
// Chart 3: every metro, rent growth vs income growth
// ---------------------------------------------------------------------------
function drawScatter() {
  const n = scatterData.length;
  const above = scatterData.filter((d) => d.rentChg > d.incomeChg).length;
  const sel = scatterData.find((d) => d.metro === state.city);
  const shortName = state.city.split(',')[0];
  let cityLine;
  if (!sel) {
    cityLine = `${state.city} isn't shown because it doesn't have estimates for both ${METRO_FIRST} and ${METRO_LAST}.`;
  } else if (sel.rentChg > sel.incomeChg) {
    cityLine = `${shortName} is one of them: rent rose ${fmtChg(sel.rentChg)} while income rose ${fmtChg(sel.incomeChg)}.`;
  } else {
    cityLine = `${shortName} is one of the exceptions: income rose ${fmtChg(sel.incomeChg)} while rent rose ${fmtChg(sel.rentChg)}.`;
  }
  document.querySelector('#scatter-readout').innerHTML =
    `From ${METRO_FIRST} to ${METRO_LAST}, rent grew faster than household income in <strong>${above} of ${n}</strong> metro areas `
    + `(${d3.format('.0%')(above / n)}). ${cityLine}`;

  const container = document.querySelector('#chart-scatter');
  const w = Math.max(320, container.clientWidth - 8);
  const height = Math.min(560, Math.max(380, w * 0.6));
  const margin = { top: 20, right: 24, bottom: 48, left: 76 };
  const { innerW, innerH, g: plot } = makeSvg('#chart-scatter', height, margin);

  const ext = d3.extent([...scatterData.map((d) => d.incomeChg), ...scatterData.map((d) => d.rentChg)]);
  const domain = [Math.floor((ext[0] - 5) / 10) * 10, Math.ceil((ext[1] + 5) / 10) * 10];
  const x = d3.scaleLinear().domain(domain).range([0, innerW]);
  const y = d3.scaleLinear().domain(domain).range([innerH, 0]);
  const r = d3.scaleSqrt().domain([0, d3.max(scatterData, (d) => d.population)]).range([2.5, 24]);

  plot.append('g').attr('class', 'gridline')
    .call(d3.axisLeft(y).ticks(6).tickSize(-innerW).tickFormat(''));
  plot.append('g').attr('class', 'gridline').attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6).tickSize(-innerH).tickFormat(''));
  plot.append('g').attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat((v) => `${v >= 0 ? '+' : ''}${v}%`));
  plot.append('g').attr('class', 'axis').attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat((v) => `${v >= 0 ? '+' : ''}${v}%`));
  plot.append('text').attr('class', 'axis-title')
    .attr('x', innerW / 2).attr('y', innerH + 40).attr('text-anchor', 'middle')
    .text(`Change in median household income, ${METRO_FIRST}–${METRO_LAST}`);
  plot.append('text').attr('class', 'axis-title')
    .attr('transform', 'rotate(-90)').attr('x', -innerH / 2).attr('y', -60).attr('text-anchor', 'middle')
    .text(`Change in median rent, ${METRO_FIRST}–${METRO_LAST}`);

  // y = x reference
  plot.append('line').attr('class', 'ref-line')
    .attr('x1', x(domain[0])).attr('y1', y(domain[0]))
    .attr('x2', x(domain[1])).attr('y2', y(domain[1]));
  plot.append('text').attr('class', 'annotation-strong')
    .attr('x', 10).attr('y', 16)
    .text('↑ Rent grew faster than income');
  plot.append('text').attr('class', 'annotation')
    .attr('x', innerW - 10).attr('y', innerH - 12).attr('text-anchor', 'end')
    .text('Income grew faster than rent ↓');

  const dots = plot.append('g').selectAll('circle')
    .data(scatterData, (d) => d.metro)
    .join('circle')
    .attr('class', (d) => `dot${d.metro === state.city ? ' selected' : ''}`)
    .attr('cx', (d) => x(d.incomeChg))
    .attr('cy', (d) => y(d.rentChg))
    .attr('r', (d) => r(d.population))
    .attr('fill', (d) => (d.metro === state.city ? C.highlight : C.home))
    .attr('fill-opacity', (d) => (d.metro === state.city ? 1 : 0.45))
    .attr('stroke', (d) => (d.metro === state.city ? C.ink : C.surface))
    .attr('stroke-width', (d) => (d.metro === state.city ? 2 : 1))
    .on('pointerenter pointermove', (event, d) => {
      d3.select(event.currentTarget).attr('fill-opacity', 1);
      showTip(
        `<div class="tt-title">${d.metro}</div>`
        + ttRow('Rent change', fmtChg(d.rentChg))
        + ttRow('Income change', fmtChg(d.incomeChg))
        + ttRow(`Rent burden, ${METRO_LAST}`, fmtPct(d.burden))
        + ttRow('Population', d3.format('.3~s')(d.population)),
        event,
      );
    })
    .on('pointerleave', (event, d) => {
      d3.select(event.currentTarget).attr('fill-opacity', d.metro === state.city ? 1 : 0.45);
      hideTip();
    })
    .on('click', (event, d) => setCity(d.metro));

  dots.filter((d) => d.metro === state.city).raise();

  if (sel) {
    const sx = x(sel.incomeChg);
    const sy = y(sel.rentChg);
    const right = sx < innerW - 140;
    plot.append('text').attr('class', 'annotation-strong')
      .attr('x', sx + (right ? 1 : -1) * (r(sel.population) + 6))
      .attr('y', sy + 4)
      .attr('text-anchor', right ? 'start' : 'end')
      .attr('paint-order', 'stroke').attr('stroke', C.surface).attr('stroke-width', 4)
      .text(shortName);
  }
}

// ---------------------------------------------------------------------------
// Draw + redraw on resize
// ---------------------------------------------------------------------------
function drawAll() {
  drawNational();
  drawCity();
  drawScatter();
}
drawAll();

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawAll, 150);
});
