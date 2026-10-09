import type { App, Screen } from '../app'
import { animalById } from '../content/animals'
import type { ItemId } from '../content/blocks'
import { steunsom } from '../content/steunsom'
import type { Selection, TafelOutcome } from '../engine/tafels/engine'
import { fishSeconds } from '../engine/tafels/facts'
import { makeRng } from '../engine/rng'
import type { Outcome } from '../engine/words'
import { finishRound } from '../game/day'
import { addItems, nextStreak, rewardFor } from '../game/rewards'
import { EXTENSION_SECONDS, LEARNED_BONUS, UNLOCK_RIGHT, addTime, clock, nextRun, secondsFor } from '../game/buildtime'
import { inventoryChip, sleep, updateInventoryChip, watchInsets } from './common'
import { el } from './dom'
import { Numpad } from './numpad'
import { doublePoints, type RoundOptions, type RoundResult } from './round'

/** Sums go quicker than words, so a round has a few more. */
export const SOM_ROUND_LENGTH = 15
/** Chance that a bonus fish jumps for a sum that is not new. */
const FISH_CHANCE = 0.4
/** Two misses in a row this fast look like guessing: take a calm look first. */
const GUESS_SECONDS = 1.2

/** "7 x 8" as shown to Viggo. */
export function sumLabel(a: number, b: number): string {
  return `${a} × ${b}`
}

function pick(lines: string[], som?: string): string {
  const line = lines[Math.floor(Math.random() * lines.length)] ?? ''
  return line.replace('{som}', som ?? 'deze som')
}

/** Animal lines about words do not fit a sum. */
const noWords = (lines: string[]) => {
  const ok = lines.filter((l) => !/woord/i.test(l))
  return ok.length > 0 ? ok : lines
}

/** The steunsom as a row of steps: 9 × 7 = 10 × 7 - 7 = 70 - 7 = 63. Without the answer when used as help. */
export function steunsomBox(a: number, b: number, withAnswer: boolean, animate = true): HTMLElement {
  const s = steunsom(a, b)
  const steps = (withAnswer ? s.steps : s.steps.slice(0, -1)).map((t) => t.replace(/ x /g, ' × '))
  const row = el('div.steps')
  steps.forEach((t, i) => {
    if (i > 0) row.appendChild(el('span.eq', { text: '=' }))
    const last = withAnswer && i === steps.length - 1
    const step = el(`span.step${last ? '.final' : ''}`, { text: t })
    step.style.animationDelay = `${i * 0.45}s`
    row.appendChild(step)
  })
  if (!withAnswer) row.append(el('span.eq', { text: '=' }), el('span.step.ask', { text: '?' }))
  return el(`div.steunsom${animate ? '' : '.static'}`, {}, el('div.label', { text: s.tip }), row, s.extra ? el('div.extra', { text: s.extra }) : null)
}

/**
 * A round of times-table sums. Calm: no clock on screen. The time to answer is
 * measured in the background and decides when a sum counts as automated.
 * Answers are typed on a numpad, never chosen, so guessing does not help.
 */
export function sommenScreen(app: App, payload?: unknown): Screen {
  const unlock = Boolean((payload as RoundOptions | undefined)?.unlock)
  const length = unlock ? UNLOCK_RIGHT : SOM_ROUND_LENGTH
  const engine = app.makeTafelEngine()
  const rng = makeRng(Date.now() & 0x7fffffff)
  const earned: ItemId[] = []
  const learned: string[] = []
  const asked = new Set<string>()
  let index = 0
  let right = 0
  let seconds = 0
  let run = 0
  let streak = 0
  let quickMisses = 0
  let fishTold = false
  let disposed = false
  let leaving: Promise<void> = Promise.resolve()

  app.scene.setMood('day')
  app.scene.catPose('idle')

  const dots = el(`div.progress${length > 12 ? '.many' : ''}`)
  for (let i = 0; i < length; i++) dots.appendChild(el('i'))
  const streakChip = el('div.chip.hidden')
  const invChip = inventoryChip(app.store.profile.inventory)
  const top = el('div.topbar', {}, el('button.btn.small.ghost', { onclick: () => app.go('menu') }, '✕ Stoppen'), dots, el('div.spacer'), streakChip, invChip)
  const card = el('div.card.sheet.som-sheet')
  const root = el('div.screen', {}, top, el('div.spacer'), card)
  const unwatch = watchInsets(app, top, card)

  // Time spent with the app in the background does not count as thinking time.
  let hiddenAt = 0
  let hiddenMs = 0
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') hiddenAt = performance.now()
    else if (hiddenAt) {
      hiddenMs += performance.now() - hiddenAt
      hiddenAt = 0
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  let pad: Numpad | null = null
  let fish: Fish | null = null

  function updateTop(): void {
    ;[...dots.children].forEach((d, i) => {
      const at = unlock ? run : index
      d.className = i < at ? 'done' : i === at ? 'now' : ''
    })
    streakChip.classList.toggle('hidden', streak < 2)
    streakChip.textContent = `⭐ ${streak} op een rij`
    updateInventoryChip(invChip, app.store.profile.inventory)
  }

  let currentAnimal = animalById(app.nextAnimal())
  const papaAt = !unlock && Math.random() < 0.85 ? 2 + Math.floor(Math.random() * Math.max(1, length - 3)) : -1
  let seq = 0
  let answered = false
  let arrival: Promise<void> = Promise.resolve()

  function record(out: TafelOutcome, caught: boolean): ItemId[] {
    answered = true
    const outcome: Outcome = out.result === 'wrong' ? 'wrong' : out.result === 'hint' ? 'hint' : 'correct'
    asked.add(out.fact.key)
    const label = sumLabel(out.fact.a, out.fact.b)
    const nowLearned = out.statusAfter === 'geautomatiseerd' && out.statusBefore !== 'geautomatiseerd' && !learned.includes(label)
    if (nowLearned) learned.push(label)
    if (outcome !== 'wrong') right++
    if (unlock) {
      const before = run
      run = nextRun(run, outcome)
      if (before > 0 && run === 0) app.toast('Oeps, nog een keer! 5 goed op een rij en je mag weer bouwen.')
    }
    streak = nextStreak(streak, outcome)
    const papaBonus = currentAnimal.id === 'papa' && outcome !== 'wrong'
    const items = rewardFor('recognize', outcome, streak, rng)
    if (papaBonus) items.push(...rewardFor('recognize', outcome, 0, rng))
    if (caught) items.push('vis')
    earned.push(...items)
    const time = (unlock ? 0 : secondsFor(outcome) + (nowLearned ? LEARNED_BONUS : 0)) * (papaBonus ? 2 : 1)
    seconds += time
    app.saveTafelEngine(engine)
    app.store.update((p) => {
      p.inventory = addItems(p.inventory, items)
      p.stats.answers++
      p.buildTime = addTime(p.buildTime, time)
    })
    return items
  }

  async function celebrate(items: ItemId[], caught: boolean): Promise<void> {
    app.audio.play('right')
    const papa = currentAnimal.id === 'papa'
    if (papa) doublePoints(app, root)
    const toast = (text: string) => (papa ? window.setTimeout(() => app.toast(text), 2300) : app.toast(text))
    app.scene.catJump()
    app.scene.animalState('happy')
    app.scene.burst('sparkle', 'cat')
    if (caught) {
      app.audio.play('purr')
      toast('Kit Nugget vangt het visje!')
    } else if (streak > 0 && streak % 5 === 0) {
      app.audio.play('streak', streak)
      toast(`${streak} op een rij! Een meubelstuk voor het eiland!`)
      app.scene.burst('stars', 'cat')
    } else if (streak > 0 && streak % 3 === 0) {
      app.audio.play('streak', streak)
      toast(`${streak} op een rij! Een vissnoepje voor Kit Nugget!`)
    }
    window.setTimeout(() => app.audio.play('reward'), 350)
    await app.flyRewards(items, invChip)
    updateTop()
  }

  function finish(): void {
    if (unlock) {
      app.store.update((p) => {
        p.buildTime = Math.max(p.buildTime, EXTENSION_SECONDS)
        p.extensionUsed = true
      })
      app.toast(`Goed zo! Je mag nog ${clock(EXTENSION_SECONDS)} bouwen.`)
      app.go('bouwen')
      return
    }
    app.store.update((p) => {
      p.extensionUsed = false
      p.days = finishRound(p.days, Date.now())
      p.stats.rounds++
    })
    const result: RoundResult = {
      vak: 'tafels',
      earned,
      seconds,
      learned,
      weak: engine.weakest(3, [...asked]).map((f) => sumLabel(f.a, f.b)),
      right,
      total: length,
    }
    app.go('result', result)
  }

  async function next(): Promise<void> {
    if (disposed) return
    if (unlock ? run >= length : index >= length) {
      finish()
      return
    }
    updateTop()
    const sel = engine.next()
    const animal = animalById(index === papaAt ? 'papa' : app.nextAnimal())
    currentAnimal = animal
    const line = pick(animal.askSom, sumLabel(sel.fact.a, sel.fact.b))
    const who = showQuestion(sel, `${animal.naam} komt eraan...`)
    const my = ++seq
    answered = false
    arrival = leaving.then(async () => {
      if (disposed || my !== seq) return
      app.scene.catPose('idle')
      await app.scene.animalArrives(animal.id)
      if (disposed || my !== seq) return
      if (!answered) app.scene.animalState('talk')
      if (who.isConnected) who.textContent = `${animal.naam}: "${line}"`
    })
  }

  async function done(): Promise<void> {
    answered = true
    await sleep(1300)
    if (disposed) return
    index++
    const arrived = arrival
    leaving = arrived.then(() => (disposed ? undefined : app.scene.animalLeaves()))
    void next()
  }

  function showQuestion(sel: Selection, intro: string): HTMLElement {
    const { fact } = sel
    const answer = fact.a * fact.b
    const digits = String(answer).length
    pad?.dispose()
    fish?.cancel()
    fish = null

    const who = el('div.q-who', { text: intro })
    const box = el('span.som-answer.empty', { text: '?' })
    const sum = el('div.som', {}, el('span', { text: `${sumLabel(fact.a, fact.b)} =` }), box)
    const learnBox = el('div.learn.hidden')
    const feedback = el('div.feedback')
    const helpBtn = el('button.btn.small.lila', { type: 'button' }, '💡 Hulp')
    const skip = el('button.btn.small.hidden', { type: 'button' }, 'Verder')
    const helpRow = el('div.hint-row.som-help', {}, helpBtn, skip)

    let typed = ''
    let state: 'ask' | 'learn' | 'done' = 'ask'
    let usedHelp = false
    let retries = 0
    const shownAt = performance.now()
    const hiddenBefore = hiddenMs

    const render = () => {
      box.textContent = typed || '?'
      box.classList.toggle('empty', typed === '')
    }

    const submit = () => {
      if (state === 'done' || typed === '') return
      const value = Number(typed)
      if (state === 'ask') {
        const rt = (performance.now() - shownAt - (hiddenMs - hiddenBefore)) / 1000
        const caught = Boolean(fish?.inAir()) && value === answer && !usedHelp
        const out = engine.record(fact, value, rt, { hint: usedHelp })
        if (out.correct) {
          state = 'done'
          if (caught) fish?.catch()
          else fish?.cancel()
          box.classList.add('good')
          helpRow.classList.add('hidden')
          feedback.textContent = pick(noWords(currentAnimal.happy))
          quickMisses = 0
          const items = record(out, caught)
          void celebrate(items, caught)
          void done()
          return
        }
        // Wrong: show the route to the answer, then type it once the right way.
        state = 'learn'
        fish?.cancel()
        record(out, false)
        quickMisses = rt < GUESS_SECONDS ? quickMisses + 1 : 0
        app.audio.play('wrong')
        app.scene.catSurprised()
        app.scene.animalState('idle')
        learnBox.replaceChildren(steunsomBox(fact.a, fact.b, true), el('p.note', { text: 'Typ nu het goede antwoord.' }))
        learnBox.classList.remove('hidden')
        helpBtn.classList.add('hidden')
        feedback.textContent = ''
        typed = ''
        render()
        box.classList.add('again')
        if (quickMisses >= 2) {
          quickMisses = 0
          feedback.textContent = 'Rustig aan. Kijk eerst goed naar de som, je hebt alle tijd.'
          feedback.classList.add('calm')
          pad?.lock(1500)
        }
        updateTop()
        return
      }
      // Learning: type it once the right way.
      if (value === answer) {
        state = 'done'
        box.classList.remove('again')
        box.classList.add('good')
        feedback.classList.remove('calm')
        feedback.textContent = pick(noWords(currentAnimal.learn))
        app.scene.catPose('idle')
        app.scene.animalState('happy')
        app.audio.play('reward')
        void done()
      } else {
        retries++
        typed = ''
        render()
        app.audio.play('tap')
        box.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 })
        if (retries >= 2) skip.classList.remove('hidden')
      }
    }

    pad = new Numpad({
      onDigit: (d) => {
        if (state === 'done' || typed.length >= 3) return
        if (typed === '0') typed = ''
        typed += String(d)
        app.audio.play('tap')
        render()
        // Confirms by itself once the answer has as many digits as the right one.
        if (typed.length >= digits) window.setTimeout(submit, 120)
      },
      onBack: () => {
        if (state === 'done') return
        typed = typed.slice(0, -1)
        render()
      },
      onOk: submit,
    })

    helpBtn.addEventListener('click', () => {
      if (state !== 'ask' || usedHelp) return
      usedHelp = true
      fish?.cancel()
      app.audio.play('tap')
      learnBox.replaceChildren(steunsomBox(fact.a, fact.b, false))
      learnBox.classList.remove('hidden')
      helpBtn.classList.add('hidden')
    })
    skip.addEventListener('click', () => {
      if (state === 'done') return
      state = 'done'
      app.scene.catPose('idle')
      void done()
    })

    card.replaceChildren(
      el('div.sheet-scroll.som-body', {}, el('div.som-left', {}, el('div.q-head', {}, who), sum, learnBox, feedback, helpRow), el('div.som-right', {}, pad.root)),
    )

    // Now and then a fish jumps out of the water: answer while it is in the air and Kit Nugget catches it.
    if (!unlock && sel.status !== 'nieuw' && rng.next() < FISH_CHANCE) {
      fish = jumpFish(app, fishSeconds(sel.state))
      if (!fishTold) {
        fishTold = true
        window.setTimeout(() => !disposed && state === 'ask' && app.toast('Een visje! Weet je het antwoord voor het in het water plonst?'), 500)
      }
    }
    return who
  }

  if (unlock) window.setTimeout(() => !disposed && app.toast(`Doe ${UNLOCK_RIGHT} sommen goed op een rij, dan mag je weer bouwen!`), 400)
  void next()

  return {
    root,
    dispose: () => {
      disposed = true
      pad?.dispose()
      fish?.cancel()
      document.removeEventListener('visibilitychange', onVisibility)
      unwatch()
    },
  }
}

interface Fish {
  inAir(): boolean
  catch(): void
  cancel(): void
}

/** A fish that jumps in an arc over the island and plops back into the water. Purely a bonus. */
function jumpFish(app: App, seconds: number): Fish {
  const stage = app.stage.getBoundingClientRect()
  const cat = app.scene.catScreenPos()
  const cx = stage.left + cat.x
  const cy = stage.top + cat.y
  const span = Math.min(170, stage.width * 0.32)
  const dir = Math.random() < 0.5 ? 1 : -1
  const x0 = cx - span * dir
  const x1 = cx + span * dir
  const base = cy + 50
  const peak = Math.max(stage.top + 40, cy - 150)
  const fishEl = el('div.fish', { text: '🐟' })
  fishEl.style.left = `${x0 - 20}px`
  fishEl.style.top = `${base - 20}px`
  document.body.appendChild(fishEl)

  const frames: Keyframe[] = []
  const steps = 16
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = (x1 - x0) * t
    const y = (peak - base) * 4 * t * (1 - t)
    const angle = (t - 0.5) * 100 * dir
    frames.push({ transform: `translate(${x}px, ${y}px) rotate(${angle}deg) scaleX(${-dir})`, opacity: i === 0 || i === steps ? 0.2 : 1 })
  }
  const anim = fishEl.animate(frames, { duration: seconds * 1000, easing: 'linear', fill: 'forwards' })
  let air = true
  anim.onfinish = () => {
    if (!air) return
    air = false
    fishEl.remove()
    const splash = el('div.splash')
    splash.style.left = `${x1 - 22}px`
    splash.style.top = `${base - 6}px`
    document.body.appendChild(splash)
    window.setTimeout(() => splash.remove(), 700)
  }
  return {
    inAir: () => air,
    catch: () => {
      if (!air) return
      air = false
      anim.pause()
      fishEl.animate([{ transform: getComputedStyle(fishEl).transform, opacity: 1 }, { transform: `${getComputedStyle(fishEl).transform} scale(1.6)`, opacity: 0 }], { duration: 350, fill: 'forwards' }).onfinish = () =>
        fishEl.remove()
    },
    cancel: () => {
      if (!air) return
      air = false
      anim.cancel()
      fishEl.remove()
    },
  }
}
