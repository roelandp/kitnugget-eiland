import type { App, Screen } from '../app'
import { TOETSEN, daysUntil, formatDate } from '../content'
import { goalDone, isAsleep, roundsToday } from '../game/day'
import { wordsToNextStep } from '../game/island'
import { inventoryChip, paws, testCountdown, watchInsets } from './common'
import { el } from './dom'
import { startRoaming } from './roam'

export function menuScreen(app: App): Screen {
  const p = app.store.profile
  const toets = app.toets
  const now = Date.now()
  const learned = app.learnedIn(toets)
  const total = toets.questions.length
  const countdown = testCountdown(toets.date)
  const asleep = isAsleep(p.days, now)
  const tired = goalDone(p.days, now)

  app.applyLook()
  app.scene.setMood(tired ? 'sunset' : 'day')
  app.scene.catPose(asleep ? 'sleep' : 'idle')
  void app.scene.animalLeaves()
  app.syncIsland(true)

  const top = el(
    'div.menu-top',
    {},
    el('h1.title', { html: 'Kit Nugget<small>EILAND</small>' }),
    el(
      'div.menu-stats',
      {},
      el('span.chip', {}, paws(app), p.days.played > 0 ? ` dag ${p.days.played + (roundsToday(p.days, now) > 0 ? 0 : 1)}` : ''),
      el('span.chip', { text: `⭐ ${learned} van ${total} geleerd` }),
      inventoryChip(p.inventory),
    ),
  )

  const lines: HTMLElement[] = []
  if (asleep) {
    lines.push(el('p.note', { html: '<strong>Kit Nugget slaapt.</strong> Tik op het eiland om hem wakker te maken.' }))
  } else if (tired) {
    lines.push(el('p.note', { html: '<strong>Kit Nugget is moe en tevreden. Morgen weer!</strong> Nog een rondje mag ook.' }))
  }
  const toNext = wordsToNextStep(app.learnedTotal())
  const info = [toets.title.replace(/^Toets \d+ \w+: /, ''), formatDate(toets.date) && `toets ${formatDate(toets.date)}`].filter(Boolean).join(' · ')
  lines.push(el('p.note', { html: `<strong>${countdown ?? info}</strong><br>${countdown ? info + '<br>' : ''}Nog ${toNext} ${toNext === 1 ? 'woord' : 'woorden'} leren en het eiland groeit.` }))
  const left = daysUntil(toets.date)
  if (left !== null && left >= 0 && left <= 3 && learned < total) {
    lines.push(el('p.note', { text: 'Tip: doe ook eens de proeftoets, dan komen alle woorden langs.' }))
  }
  const older = TOETSEN.filter((t) => t.id !== toets.id)
  if (older.length > 0) {
    lines.push(el('p.note.older', { text: `Andere toetsen: ${older.map((t) => t.title.replace(/:.*/, '')).join(', ')} (kies in Instellingen)` }))
  }

  const panel = el(
    'div.menu-panel',
    {},
    el('button.btn.primary', { onclick: () => start() }, '▶  Spelen'),
    el('button.btn', { onclick: () => app.go('bouwen') }, '🧱 Bouwen'),
    el('button.btn', { onclick: () => app.go('toets') }, '📝 Proeftoets'),
    el('button.btn', { onclick: () => app.go('kaart') }, '🗺️ Woordenkaart'),
    el('button.btn', { onclick: () => app.go('aankleden') }, '👒 Aankleden'),
    el('button.btn.settings-btn', { onclick: () => app.go('instellingen') }, '⚙️ Instellingen'),
  )
  const sheet = el('div.card.sheet', {}, el('div.sheet-scroll', {}, ...lines, panel))

  let awake = !asleep
  const catcher = el('div.tap-catcher', {
    onclick: () => {
      if (awake) return
      awake = true
      app.audio.play('meow')
      app.scene.catPose('happy')
      app.scene.burst('hearts', 'cat')
      catcher.remove()
      window.setTimeout(() => app.scene.catPose('idle'), 1400)
      lines[0]?.remove()
    },
  })

  const root = el('div.screen', {}, top, el('div.spacer'), sheet)
  if (asleep) root.prepend(catcher)

  function start(): void {
    app.audio.play('start')
    app.go('round')
  }

  const unwatch = watchInsets(app, top, sheet)
  let stopRoam: (() => void) | null = asleep ? null : startRoaming(app, { tiredSleep: true })
  catcher.addEventListener('click', () => {
    if (!stopRoam) window.setTimeout(() => (stopRoam = startRoaming(app, { tiredSleep: false })), 1600)
  })
  return {
    root,
    dispose: () => {
      unwatch()
      stopRoam?.()
    },
  }
}
