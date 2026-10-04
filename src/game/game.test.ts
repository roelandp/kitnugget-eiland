import { describe, expect, it } from 'vitest'
import { makeRng } from '../engine/rng'
import { emptyState } from '../engine/words'
import { emptySave, migrate } from '../storage/schema'
import { dayKey, emptyDays, finishRound, goalDone, isAsleep, roundsToday } from './day'
import { earnsLighthouse, islandSize, wordsToNextStep } from './island'
import { addItems, blocksFor, nextStreak, rewardFor, takeItem } from './rewards'

describe('island growth', () => {
  it('starts at 4x4 and grows a strip per 5 learned words', () => {
    expect(islandSize(0)).toEqual({ w: 4, d: 4, step: 0 })
    expect(islandSize(4)).toEqual({ w: 4, d: 4, step: 0 })
    expect(islandSize(5)).toEqual({ w: 5, d: 4, step: 1 })
    expect(islandSize(10)).toEqual({ w: 5, d: 5, step: 2 })
    expect(islandSize(40)).toEqual({ w: 8, d: 8, step: 8 })
    expect(islandSize(1000).w).toBe(12)
    expect(wordsToNextStep(7)).toBe(3)
    expect(earnsLighthouse(40, 40)).toBe(true)
    expect(earnsLighthouse(39, 40)).toBe(false)
  })
})

describe('rewards', () => {
  it('pays per answer kind', () => {
    expect(blocksFor('type', 'correct')).toBe(2)
    expect(blocksFor('recognize', 'correct')).toBe(1)
    expect(blocksFor('type', 'hint')).toBe(1)
    expect(blocksFor('type', 'almost')).toBe(1)
    expect(blocksFor('type', 'wrong')).toBe(0)
  })

  it('adds a fish at a streak of 3 and furniture at 5', () => {
    const rng = makeRng(1)
    expect(rewardFor('recognize', 'correct', 3, rng)).toContain('vis')
    const five = rewardFor('recognize', 'correct', 5, rng)
    expect(five).toHaveLength(2)
    expect(five).not.toContain('vis')
    expect(rewardFor('recognize', 'wrong', 0, rng)).toEqual([])
    expect(nextStreak(2, 'correct')).toBe(3)
    expect(nextStreak(2, 'almost')).toBe(2)
    expect(nextStreak(2, 'wrong')).toBe(0)
  })

  it('keeps an inventory', () => {
    let inv = addItems({}, ['gras', 'gras', 'vis'])
    expect(inv.gras).toBe(2)
    inv = takeItem(inv, 'gras')!
    expect(inv.gras).toBe(1)
    expect(takeItem({}, 'gras')).toBeNull()
  })
})

describe('day goal', () => {
  const t = new Date('2026-10-04T16:00:00').getTime()
  it('counts rounds and days, never losing a day', () => {
    let d = emptyDays()
    d = finishRound(d, t)
    expect(roundsToday(d, t)).toBe(1)
    expect(goalDone(d, t)).toBe(false)
    d = finishRound(d, t + 60_000)
    expect(goalDone(d, t)).toBe(true)
    d = finishRound(d, t + 3 * 86_400_000)
    expect(d.played).toBe(2)
    expect(roundsToday(d, t + 3 * 86_400_000)).toBe(1)
    expect(dayKey(t)).toBe('2026-10-04')
  })
  it('sleeps after 20 hours', () => {
    const d = finishRound(emptyDays(), t)
    expect(isAsleep(d, t + 19 * 3_600_000)).toBe(false)
    expect(isAsleep(d, t + 21 * 3_600_000)).toBe(true)
    expect(isAsleep(emptyDays(), t)).toBe(false)
  })
})

describe('storage', () => {
  it('migrates garbage to an empty save', () => {
    expect(migrate(null)).toEqual(emptySave())
    expect(migrate({ profiles: 'x' }).profiles.viggo).toBeTruthy()
  })
  it('keeps words, inventory and blocks, dropping unknown items', () => {
    const save = emptySave()
    save.profiles.viggo.words.toets_8_oktober = { 'de dialoog': { ...emptyState(), seen: 3, box: 2 } }
    save.profiles.viggo.inventory = { gras: 3 }
    save.profiles.viggo.island.blocks = [{ x: 1, z: 0, y: 0, type: 'gras' }]
    const raw = JSON.parse(JSON.stringify(save))
    raw.profiles.viggo.inventory.raket = 9
    raw.profiles.viggo.island.blocks.push({ x: 0, z: 0, y: 0, type: 'raket' })
    const back = migrate(raw)
    expect(back.profiles.viggo.words.toets_8_oktober['de dialoog'].box).toBe(2)
    expect(back.profiles.viggo.inventory).toEqual({ gras: 3 })
    expect(back.profiles.viggo.island.blocks).toHaveLength(1)
  })
})
