import { describe, expect, it } from 'vitest'
import { TafelEngine } from '../engine/tafels/engine'
import { buildFacts, makeFact } from '../engine/tafels/facts'
import { makeRng } from '../engine/rng'
import { migrate } from '../storage/schema'
import { pickTestFacts } from '../ui/tafeltoets'
import { daySeries, secondsText, speedChange, tableCounts } from './tafelstats'

const DAY = 24 * 3_600_000

describe('tafel charts', () => {
  it('turns daily tallies into points, oldest first, with the average time', () => {
    let t = new Date(2026, 9, 1, 16).getTime()
    const e = new TafelEngine({ tables: [6], seed: 1, now: () => t })
    e.record(makeFact(6, 7), 42, 6)
    e.record(makeFact(6, 8), 48, 4)
    t += DAY
    e.record(makeFact(6, 7), 42, 2)
    e.record(makeFact(6, 8), 40, 2)
    const days = daySeries(e.dailyStats())
    expect(days.map((d) => d.day)).toEqual(['2026-10-01', '2026-10-02'])
    expect(days[0].avgRt).toBe(5)
    expect(days[1].avgRt).toBe(2)
    expect(days[1].fastShare).toBe(0.5)
    expect(speedChange(days)).toEqual({ first: 5, last: 2 })
  })

  it('has no speed change with fewer than two timed days', () => {
    expect(speedChange([])).toBeNull()
  })

  it('counts the ten facts of a table by status', () => {
    const e = new TafelEngine({ tables: [3], seed: 1 })
    e.record(makeFact(3, 4), 11, 2)
    expect(tableCounts(e.snapshot().states, 3)).toEqual({ nieuw: 9, oefenen: 1, snel: 0, geautomatiseerd: 0 })
  })

  it('writes seconds the Dutch way', () => {
    expect(secondsText(3.26)).toBe('3,3 s')
    expect(secondsText(null)).toBe('-')
  })
})

describe('tafel practice test', () => {
  it('never asks a fact twice and stops when the facts run out', () => {
    const facts = buildFacts([7, 8])
    const picked = pickTestFacts(facts, 40, makeRng(3))
    expect(picked.length).toBe(20)
    expect(new Set(picked.map((f) => f.key)).size).toBe(20)
    expect(pickTestFacts(facts, 5, makeRng(3)).length).toBe(5)
  })
})

describe('storage', () => {
  it('gives a version 1 save empty tafels with every table', () => {
    const save = migrate({ schemaVersion: 1, activeProfile: 'viggo', profiles: { viggo: { words: {} } } })
    const p = save.profiles.viggo
    expect(save.schemaVersion).toBe(2)
    expect(p.tafels.tables).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(p.tafels.engine.states).toEqual({})
    expect(p.settings.vak).toBe('woorden')
  })

  it('keeps tafel progress through a save and load', () => {
    const e = new TafelEngine({ seed: 2 })
    e.record(makeFact(7, 8), 56, 2.5)
    const raw = { profiles: { viggo: { settings: { vak: 'tafels' }, tafels: { engine: e.snapshot(), tables: [7, 8, 99], tests: [{ at: 1, total: 20, correct: 18, seconds: 70, wrong: [{ sum: '7x8', answer: 54, right: 56 }] }] } } } }
    const p = migrate(JSON.parse(JSON.stringify(raw))).profiles.viggo
    expect(p.settings.vak).toBe('tafels')
    expect(p.tafels.tables).toEqual([7, 8])
    expect(p.tafels.engine.states['7x8'].correct).toBe(1)
    expect(p.tafels.tests[0].wrong[0]).toEqual({ sum: '7x8', answer: 54, right: 56 })
    expect(Object.keys(p.tafels.engine.daily).length).toBe(1)
  })
})
