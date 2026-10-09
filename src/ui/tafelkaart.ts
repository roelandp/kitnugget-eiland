import type { App, Screen } from '../app'
import { FACT_STATUSES, FAST_SECONDS, statusOf, type FactResult, type FactStatus } from '../engine/tafels/facts'
import { attempts, daySeries, secondsText, shortDay, speedChange, tableCounts } from '../game/tafelstats'
import { attemptPlot, legend, lineChart, stackedArea, stackedBars, type Series } from './charts'
import { el } from './dom'
import { steunsomBox, sumLabel } from './sommen'

export const FACT_LABEL: Record<FactStatus, string> = {
  nieuw: 'Nieuw',
  oefenen: 'Oefenen',
  snel: 'Gaat goed',
  geautomatiseerd: 'Zit erin',
}

const COLOR: Record<FactStatus, string> = {
  nieuw: 'var(--chart-nieuw)',
  oefenen: 'var(--chart-oefenen)',
  snel: 'var(--chart-snel)',
  geautomatiseerd: 'var(--chart-auto)',
}

const RESULT_SERIES: { result: FactResult; label: string; color: string; hollow?: boolean }[] = [
  { result: 'fast', label: 'Goed, binnen 3 s', color: 'var(--chart-auto)' },
  { result: 'slow', label: 'Goed, rustig', color: 'var(--chart-snel)' },
  { result: 'hint', label: 'Goed, met hulp', color: 'var(--chart-snel)', hollow: true },
  { result: 'wrong', label: 'Fout', color: 'var(--chart-oefenen)' },
]

/**
 * The times tables for parents and for Viggo: how many facts sit, how the
 * answer time drops over the days, every table, and every single fact.
 */
export function tafelkaartScreen(app: App): Screen {
  const engine = app.makeTafelEngine()
  const t = app.store.profile.tafels
  const root = el('div.screen.solid')
  const tabs = el('div.vak-switch.kaart-tabs', { role: 'tablist' })
  const top = el('div.topbar', {}, el('button.btn.small', { onclick: () => app.go('menu') }, '← Terug'), el('h1', { text: 'Tafelkaart' }))
  const inner = el('div.narrow.wide')
  root.append(top, el('div.scroller', {}, inner))
  app.holdScene(true)

  let tab: 'overzicht' | 'sommen' = 'overzicht'
  const renderTabs = () => {
    tabs.replaceChildren(
      el(`button${tab === 'overzicht' ? '.on' : ''}`, { role: 'tab', onclick: () => show('overzicht') }, '📈 Overzicht'),
      el(`button${tab === 'sommen' ? '.on' : ''}`, { role: 'tab', onclick: () => show('sommen') }, '🔢 Alle sommen'),
    )
  }
  const show = (which: typeof tab) => {
    tab = which
    renderTabs()
    inner.replaceChildren(tabs, ...(which === 'overzicht' ? overview() : grid()))
  }

  function overview(): HTMLElement[] {
    const counts = engine.counts()
    const total = engine.facts.length
    const days = daySeries(engine.dailyStats())
    const speed = speedChange(days)
    const answers = days.reduce((s, d) => s + d.n, 0)
    const recent = days.filter((d) => d.avgRt !== null).slice(-3)
    const nowRt = recent.length ? recent.reduce((s, d) => s + (d.avgRt ?? 0), 0) / recent.length : null

    const tiles = el(
      'div.stat-tiles',
      {},
      tile('Zitten erin', `${counts.geautomatiseerd}`, `van de ${total} sommen`),
      tile('Gaan goed', `${counts.snel}`, 'goed, nog wat vlotter of op een andere dag'),
      tile('Tijd per som', secondsText(nowRt), speed && speed.first > speed.last + 0.05 ? `was ${secondsText(speed.first)}` : 'gemiddeld, laatste dagen'),
      tile('Geoefend', `${answers}`, `sommen, op ${days.length} ${days.length === 1 ? 'dag' : 'dagen'}`),
    )

    const parts: HTMLElement[] = [tiles]
    if (days.length === 0) {
      parts.push(el('div.card.panel', {}, el('p', { text: 'Nog niks geoefend. Na de eerste ronde zie je hier hoe het gaat, en na een paar dagen hoe Viggo groeit.' })))
    } else {
      // Bottom-up: what sits first, so growth reads as a rising green field.
      const order: FactStatus[] = ['geautomatiseerd', 'snel', 'oefenen', 'nieuw']
      const series: Series[] = order.map((s) => ({ label: FACT_LABEL[s], color: COLOR[s] }))
      parts.push(
        el(
          'div.card.panel.chart-card',
          {},
          el('h2', { text: 'Zo groeit het' }),
          el('p.chart-sub', { text: 'Aantal sommen per status, aan het eind van elke dag dat er geoefend is.' }),
          legend(series),
          stackedArea({
            values: days.map((d) => order.map((s) => d.counts[FACT_STATUSES.indexOf(s)])),
            series,
            labels: days.map((d) => shortDay(d.day)),
            tipTitle: (i) => shortDay(days[i].day),
            ariaLabel: 'Aantal sommen per status per dag',
          }),
        ),
        el(
          'div.card.panel.chart-card',
          {},
          el('h2', { text: 'Hoe snel' }),
          el('p.chart-sub', {
            text: 'Gemiddelde tijd voor een goed antwoord (zonder hulp), per dag. Hoe lager, hoe sneller. Onder de lijn van 3 seconden zit een som erin.',
          }),
          lineChart({
            values: days.map((d) => d.avgRt),
            labels: days.map((d) => shortDay(d.day)),
            color: 'var(--chart-snel)',
            reference: { value: FAST_SECONDS, label: '3 s: zit erin' },
            fmt: (v) => `${Math.round(v * 10) / 10}`.replace('.', ',') + ' s',
            tip: (i) => {
              const d = days[i]
              return `<b>${shortDay(d.day)}</b><div>Gemiddeld<span>${secondsText(d.avgRt)}</span></div><div>Sommen<span>${d.n}</span></div><div>Binnen 3 s goed<span>${Math.round(d.fastShare * 100)}%</span></div>`
            },
            ariaLabel: 'Gemiddelde antwoordtijd per dag',
          }),
        ),
      )
    }

    const statusSeries: Series[] = FACT_STATUSES.slice()
      .reverse()
      .map((s) => ({ label: FACT_LABEL[s], color: COLOR[s] }))
    parts.push(
      el(
        'div.card.panel.chart-card',
        {},
        el('h2', { text: 'Per tafel' }),
        el('p.chart-sub', { text: 'De tien sommen van elke tafel (bijvoorbeeld 7 × 1 tot en met 7 × 10).' }),
        legend(statusSeries),
        stackedBars({
          rows: t.tables.map((n) => {
            const c = tableCounts(t.engine.states, n)
            return { label: `tafel ${n}`, values: [...FACT_STATUSES].reverse().map((s) => c[s]) }
          }),
          series: statusSeries,
          max: 10,
          ariaLabel: 'Status van de sommen per tafel',
        }),
      ),
    )

    const tests = t.tests.slice(-10).reverse()
    parts.push(
      el(
        'div.card.panel',
        {},
        el('h2', { text: 'Proeftoetsen' }),
        tests.length === 0
          ? el('p', { text: 'Nog geen proeftoets gedaan.' })
          : el(
              'div.history',
              {},
              ...tests.map((r) =>
                el('span', {
                  text: `${new Date(r.at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}: ${r.correct} van ${r.total} goed, ${secondsText(r.total ? r.seconds / r.total : null)} per som`,
                }),
              ),
            ),
      ),
      el('p.tiny', {
        text: 'Een som zit erin als hij 3 keer achter elkaar binnen 3 seconden goed is, op 2 verschillende dagen. In het spel loopt geen klok: de tijd wordt alleen op de achtergrond gemeten.',
      }),
    )
    return parts
  }

  function grid(): HTMLElement[] {
    const tables = new Set(t.tables)
    const table = el('div.fact-grid')
    table.appendChild(el('span.head.corner', { text: '×' }))
    for (let b = 1; b <= 10; b++) table.appendChild(el('span.head', { text: String(b) }))
    for (let a = 1; a <= 10; a++) {
      table.appendChild(el('span.head', { text: String(a) }))
      for (let b = 1; b <= 10; b++) {
        const key = `${a}x${b}`
        const st = statusOf(engine.state(key))
        const on = tables.has(a)
        table.appendChild(
          el(
            `button.fact.fs-${st}${on ? '' : '.off'}`,
            { 'aria-label': `${a} keer ${b}: ${FACT_LABEL[st]}`, onclick: () => detail(a, b) },
            String(a * b),
          ),
        )
      }
    }
    const counts = engine.counts()
    return [
      el(
        'div.chart-legend.grid-legend',
        {},
        ...FACT_STATUSES.map((s) => el('span', {}, el(`i.fs-${s}`), `${FACT_LABEL[s]} ${counts[s]}`)),
      ),
      el('div.card.panel', {}, table),
      el('p.tiny', { text: 'Tik op een som om te zien hoe het ging. Rij = de tafel, kolom = keer hoeveel.' }),
    ]
  }

  function detail(a: number, b: number): void {
    const s = engine.state(`${a}x${b}`)
    const st = statusOf(s)
    const list = attempts(s)
    const idx = (r: FactResult) => RESULT_SERIES.findIndex((x) => x.result === r)
    const used = RESULT_SERIES.filter((x) => list.some((p) => p.result === x.result))
    const box = el(
      'div.card.detail.fact-detail',
      { onclick: (e: Event) => e.stopPropagation() },
      el('div.q-head', {}, el('h2.som-title', { text: `${sumLabel(a, b)} = ${a * b}`, style: { flex: '1' } })),
      el('div', {}, el(`span.chip.fs-${st}`, { text: FACT_LABEL[st] })),
      el(
        'div.stats',
        {},
        el('div', {}, el('b', { text: String(s.correct - s.hints) }), 'keer goed'),
        el('div', {}, el('b', { text: String(s.wrong) }), 'keer fout'),
        el('div', {}, el('b', { text: String(s.hints) }), 'keer met hulp'),
        el('div', {}, el('b', { text: secondsText(s.rtEma) }), 'gemiddelde tijd'),
        el('div', {}, el('b', { text: String(s.fastDays.length) }), `${s.fastDays.length === 1 ? 'dag' : 'dagen'} binnen 3 s`),
        el('div', {}, el('b', { text: String(s.streakFast) }), 'keer snel op een rij'),
      ),
      list.length > 0
        ? el(
            'div.chart-card',
            {},
            el('div.section-label', { text: 'Elke keer dat deze som langskwam' }),
            legend(used),
            attemptPlot({
              points: list.map((p) => ({
                rt: p.rt,
                series: idx(p.result),
                tip: `<b>${new Date(p.at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}, ${new Date(p.at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</b><div>${RESULT_SERIES[idx(p.result)].label}<span>${secondsText(p.rt)}</span></div>`,
              })),
              series: RESULT_SERIES,
              reference: { value: FAST_SECONDS, label: '3 s' },
              fmt: (v) => `${Math.round(v)} s`,
              ariaLabel: `Antwoordtijden voor ${a} keer ${b}`,
            }),
          )
        : el('p', { text: s.seen > 0 ? 'Deze som kwam al langs in Kit Nugget Klimt; de tijden per keer worden vanaf nu bijgehouden.' : 'Deze som is nog niet langsgekomen.' }),
      el('div.learn', {}, steunsomBox(a, b, true, false)),
      el('button.btn', { style: { width: '100%' }, onclick: () => overlay.remove() }, 'Sluiten'),
    )
    const overlay = el('div.overlay', { onclick: () => overlay.remove() }, box)
    root.appendChild(overlay)
  }

  show('overzicht')
  return { root, dispose: () => app.holdScene(false) }
}

function tile(label: string, value: string, sub: string): HTMLElement {
  return el('div.stat-tile', {}, el('div.stat-label', { text: label }), el('div.stat-value', { text: value }), el('div.stat-sub', { text: sub }))
}
