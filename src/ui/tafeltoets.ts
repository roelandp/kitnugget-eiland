import type { App, Screen } from '../app'
import type { Fact } from '../engine/tafels/facts'
import { makeRng, weightedPick, type Rng } from '../engine/rng'
import { addItems, rewardFor } from '../game/rewards'
import { addTime, clock, secondsFor } from '../game/buildtime'
import { secondsText } from '../game/tafelstats'
import type { TafelTestResult } from '../storage/schema'
import { el } from './dom'
import { Numpad } from './numpad'
import { sumLabel } from './sommen'

/** Sums for a practice test: no fact twice, and x1 and x10 only now and then. */
export function pickTestFacts(facts: Fact[], count: number, rng: Rng): Fact[] {
  const pool = [...facts]
  const out: Fact[] = []
  const weight = (f: Fact) => (f.a === 1 || f.b === 1 || f.a === 10 || f.b === 10 ? 0.25 : 1)
  while (out.length < count && pool.length > 0) {
    const f = weightedPick(rng, pool, weight)
    out.push(f)
    pool.splice(pool.indexOf(f), 1)
  }
  return out
}

/**
 * Practice test for the tables: sums in random order, typed on the numpad.
 * Like at school: no help and no feedback per sum. No clock on screen either;
 * the time is measured and shown at the end, so progress in speed is visible.
 */
export function tafeltoetsScreen(app: App): Screen {
  const root = el('div.screen.solid')
  const top = el('div.topbar', {}, el('button.btn.small', { onclick: () => app.go('menu') }, '✕ Stoppen'), el('h1', { text: 'Proeftoets tafels' }))
  const body = el('div.scroller')
  const inner = el('div.narrow')
  body.appendChild(inner)
  root.append(top, body)
  app.holdScene(true)
  let pad: Numpad | null = null

  intro()

  function intro(): void {
    pad?.dispose()
    pad = null
    const history = app.store.profile.tafels.tests.slice(-10).reverse()
    const start = (n: number) => el('button.btn.primary', { onclick: () => run(n) }, `${n} sommen`)
    const panels: HTMLElement[] = [
      el(
        'div.card.panel',
        {},
        el('h2', { text: 'Proeftoets tafels' }),
        el('p', {
          text: 'Je krijgt sommen door elkaar en typt steeds het antwoord. Net als op school: geen hulp, en pas aan het eind zie je hoe het ging. Er loopt geen klok, neem je tijd. Elk goed antwoord levert een blok op.',
        }),
        el('div.row', {}, start(20), start(40)),
      ),
    ]
    if (history.length > 0)
      panels.push(
        el(
            'div.card.panel',
            {},
            el('h2', { text: 'Eerdere proeftoetsen' }),
            el(
              'div.history',
              {},
              ...history.map((r) =>
                el('span', {
                  text: `${new Date(r.at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}: ${r.correct} van ${r.total} goed, ${clock(r.seconds)}`,
                }),
              ),
            ),
          ),
      )
    inner.replaceChildren(...panels)
  }

  function run(count: number): void {
    const engine = app.makeTafelEngine()
    const rng = makeRng(Date.now() & 0x7fffffff)
    const order = pickTestFacts(engine.facts, count, rng)
    const answers: { fact: Fact; answer: number | null; ok: boolean }[] = []
    const startedAt = performance.now()
    let i = 0
    let typed = ''
    let shownAt = performance.now()
    let busy = false

    const counter = el('div.q-kind')
    const box = el('span.som-answer.empty', { text: '?' })
    const label = el('span')
    const sum = el('div.som', {}, label, box)
    pad?.dispose()
    pad = new Numpad({
      onDigit: (d) => {
        if (busy || typed.length >= 3) return
        typed += String(d)
        render()
        if (typed.length >= String(order[i].a * order[i].b).length) {
          busy = true
          window.setTimeout(submit, 160)
        }
      },
      onBack: () => {
        typed = typed.slice(0, -1)
        render()
      },
      onOk: () => {
        if (busy || typed === '') return
        busy = true
        submit()
      },
    })
    const skip = el('button.btn.small.ghost', { style: { marginTop: '10px', width: '100%' }, onclick: () => {
        if (busy) return
        busy = true
        submit(true)
      } }, 'Weet ik niet, volgende')
    inner.replaceChildren(el('div.card.panel.toets-som', {}, counter, sum, pad.root, skip))

    function render(): void {
      box.textContent = typed || '?'
      box.classList.toggle('empty', typed === '')
    }

    function show(): void {
      const f = order[i]
      counter.textContent = `Som ${i + 1} van ${order.length}`
      label.textContent = `${sumLabel(f.a, f.b)} =`
      typed = ''
      render()
      shownAt = performance.now()
      busy = false
    }

    function submit(skipped = false): void {
      const f = order[i]
      const value = skipped || typed === '' ? null : Number(typed)
      const ok = value === f.a * f.b
      answers.push({ fact: f, answer: value, ok })
      engine.record(f, value ?? -1, (performance.now() - shownAt) / 1000)
      app.saveTafelEngine(engine)
      app.audio.play('tap')
      i++
      if (i >= order.length) finish(answers, (performance.now() - startedAt) / 1000)
      else show()
    }
    show()
  }

  function finish(answers: { fact: Fact; answer: number | null; ok: boolean }[], seconds: number): void {
    pad?.dispose()
    pad = null
    const correct = answers.filter((a) => a.ok).length
    const rng = makeRng(Date.now() & 0x7fffffff)
    const items = answers.filter((a) => a.ok).flatMap(() => rewardFor('recognize', 'correct', 0, rng))
    const result: TafelTestResult = {
      at: Date.now(),
      total: answers.length,
      correct,
      seconds: Math.round(seconds),
      wrong: answers.filter((a) => !a.ok).map((a) => ({ sum: `${a.fact.a}x${a.fact.b}`, answer: a.answer, right: a.fact.a * a.fact.b })),
    }
    const time = correct * secondsFor('correct')
    const before = app.store.profile.tafels.tests.at(-1)
    app.store.update((p) => {
      p.inventory = addItems(p.inventory, items)
      p.tafels.tests = [...p.tafels.tests, result].slice(-10)
      p.buildTime = addTime(p.buildTime, time)
      p.extensionUsed = false
    })
    app.audio.play('roundEnd')
    const presents = app.tafelPresents()
    const wrong = answers.filter((a) => !a.ok)
    const perSum = seconds / Math.max(1, answers.length)
    const prevPerSum = before && before.total > 0 ? before.seconds / before.total : null
    inner.replaceChildren(
      el(
        'div.card.panel',
        {},
        el('h2', { text: correct === answers.length ? 'Alles goed!' : 'Klaar!' }),
        el('div.grade', { text: `${correct}/${answers.length}` }),
        el('p.note', {
          html:
            `Je deed er <strong>${clock(seconds)}</strong> over, dat is <strong>${secondsText(perSum)}</strong> per som.` +
            (prevPerSum !== null && prevPerSum - perSum > 0.2 ? ` Sneller dan de vorige keer (${secondsText(prevPerSum)})!` : ''),
        }),
        el('p.note', { text: `Je verdient ${items.length} ${items.length === 1 ? 'blok' : 'blokken'} en ${clock(time)} bouwtijd.` }),
        presents.tables.length > 0 ? el('p.note', { html: `<strong>De tafel van ${presents.tables.join(' en ')} zit erin! Er ligt een cadeautje klaar.</strong>` }) : null,
        wrong.length > 0
          ? el(
              'div',
              {},
              el('div.section-label', { text: 'Deze waren het' }),
              el(
                'ul.mistakes',
                {},
                ...wrong.map((a) =>
                  el('li', {}, el('span', { text: `${sumLabel(a.fact.a, a.fact.b)} =` }), el('span.given', { text: a.answer === null ? '-' : String(a.answer) }), el('span.good', { text: String(a.fact.a * a.fact.b) })),
                ),
              ),
            )
          : el('p.note', { html: '<strong>Knap hoor, geen enkele fout!</strong>' }),
        el('div.row', {}, el('button.btn.primary', { onclick: () => app.go('menu') }, 'Klaar'), el('button.btn', { onclick: () => intro() }, 'Nog een keer')),
      ),
    )
    body.scrollTop = 0
  }

  return {
    root,
    dispose: () => {
      pad?.dispose()
      app.holdScene(false)
    },
  }
}
