import { describe, expect, it } from 'vitest'
import { steunsom } from '../../content/steunsom'
import { TafelEngine, WEAK_SHARE, WORKING_SET } from './engine'
import { LOG_MAX, buildFacts, dayKey, emptyFactState, fishSeconds, makeFact, readLog, reviveFactState, statusOf, type FactState } from './facts'
import { mergeKlimt, statesFromKlimt } from './klimt'

const DAY = 24 * 3_600_000

function clock(start = new Date(2026, 9, 9, 15, 0).getTime()) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

/** Answers whatever is asked: right and fast unless told otherwise. */
function answer(e: TafelEngine, how: 'fast' | 'slow' | 'wrong' = 'fast') {
  const sel = e.next()
  const right = sel.fact.a * sel.fact.b
  return e.record(sel.fact, how === 'wrong' ? right + 1 : right, how === 'slow' ? 4 : 1.5)
}

describe('status', () => {
  it('starts at nieuw', () => {
    expect(statusOf(emptyFactState())).toBe('nieuw')
  })

  it('drops to oefenen after a wrong answer or help, whatever came before', () => {
    const s: FactState = { ...emptyFactState(), seen: 9, correct: 9, rtEma: 1.5, streakFast: 5, fastDays: ['2026-10-01', '2026-10-02'], last: 'fast', recent: [true, true, true] }
    expect(statusOf(s)).toBe('geautomatiseerd')
    expect(statusOf({ ...s, last: 'wrong' })).toBe('oefenen')
    expect(statusOf({ ...s, last: 'hint' })).toBe('oefenen')
  })

  it('is oefenen while the average stays above 5 s, snel below with the last two right', () => {
    const s: FactState = { ...emptyFactState(), seen: 3, correct: 3, rtEma: 5.4, last: 'slow', recent: [true, true, true] }
    expect(statusOf(s)).toBe('oefenen')
    expect(statusOf({ ...s, rtEma: 4.2 })).toBe('snel')
    expect(statusOf({ ...s, rtEma: 4.2, recent: [true, false, true] })).toBe('oefenen')
  })

  it('needs 3 fast in a row on 2 different days for geautomatiseerd', () => {
    const c = clock()
    const e = new TafelEngine({ tables: [7], seed: 3, now: c.now })
    const f = makeFact(7, 8)
    for (let i = 0; i < 4; i++) e.record(f, 56, 1.2)
    expect(e.status('7x8')).toBe('snel')
    c.advance(DAY)
    e.record(f, 56, 1.2)
    expect(e.status('7x8')).toBe('geautomatiseerd')
    // One slow answer breaks the streak, but stays right.
    e.record(f, 56, 6)
    expect(e.status('7x8')).not.toBe('geautomatiseerd')
  })
})

describe('recording', () => {
  it('counts time only in the background: slow is still right', () => {
    const e = new TafelEngine({ tables: [6], seed: 1 })
    const out = e.record(makeFact(6, 7), 42, 9)
    expect(out.correct).toBe(true)
    expect(out.result).toBe('slow')
  })

  it('a right answer with help counts as right but not for speed, and comes back', () => {
    const e = new TafelEngine({ tables: [6], seed: 1 })
    const f = makeFact(6, 7)
    const out = e.record(f, 42, 1, { hint: true })
    expect(out.result).toBe('hint')
    const s = e.state('6x7')
    expect(s.correct).toBe(1)
    expect(s.hints).toBe(1)
    expect(s.rtEma).toBeNull()
    expect(s.streakFast).toBe(0)
    expect(e.status('6x7')).toBe('oefenen')
    let back = false
    for (let i = 0; i < 3 && !back; i++) {
      const sel = e.next()
      back = sel.fact.key === '6x7'
      e.record(sel.fact, sel.fact.a * sel.fact.b, 2)
    }
    expect(back).toBe(true)
  })

  it('caps reaction times, so a break does not ruin the average', () => {
    const e = new TafelEngine({ tables: [6], seed: 1 })
    e.record(makeFact(6, 3), 18, 300)
    expect(e.state('6x3').rtEma).toBe(15)
  })

  it('keeps a log of the last answers with time and result', () => {
    const c = clock()
    const e = new TafelEngine({ tables: [9], seed: 1, now: c.now })
    const f = makeFact(9, 6)
    e.record(f, 54, 2.34)
    e.record(f, 55, 4)
    const log = e.state('9x6').log.map(readLog)
    expect(log).toEqual([
      { at: c.now(), rt: 2.3, result: 'fast' },
      { at: c.now(), rt: 4, result: 'wrong' },
    ])
    for (let i = 0; i < LOG_MAX + 10; i++) e.record(f, 54, 2)
    expect(e.state('9x6').log.length).toBe(LOG_MAX)
  })

  it('tallies each day: answers, right, fast, average time and status counts', () => {
    const c = clock()
    const e = new TafelEngine({ tables: [3], seed: 1, now: c.now })
    e.record(makeFact(3, 4), 12, 2)
    e.record(makeFact(3, 5), 15, 4)
    e.record(makeFact(3, 6), 17, 3)
    const d = e.dailyStats()[dayKey(c.now())]
    expect(d.n).toBe(3)
    expect(d.right).toBe(2)
    expect(d.fast).toBe(1)
    expect(d.rtSum / d.rtN).toBe(3)
    expect(d.counts.reduce((a, b) => a + b)).toBe(10)
    expect(d.counts[0]).toBe(7)
  })

  it('omkeerregel: a right 7x8 gives 8x7 a time estimate, a miss resets its streak', () => {
    const e = new TafelEngine({ seed: 1 })
    e.record(makeFact(7, 8), 56, 2)
    expect(e.state('8x7').rtEma).toBeCloseTo(2.3)
    for (let i = 0; i < 3; i++) e.record(makeFact(8, 7), 56, 1)
    expect(e.state('8x7').streakFast).toBe(3)
    e.record(makeFact(7, 8), 54, 2)
    expect(e.state('8x7').streakFast).toBe(0)
  })

  it('survives a save and load', () => {
    const e = new TafelEngine({ tables: [4], seed: 1 })
    for (let i = 0; i < 6; i++) answer(e, i % 3 === 0 ? 'wrong' : 'fast')
    const json = JSON.parse(JSON.stringify(e.snapshot()))
    const back = new TafelEngine({ tables: [4], seed: 1, snapshot: json })
    expect(back.snapshot()).toEqual(e.snapshot())
  })

  it('revives broken saves without throwing', () => {
    expect(reviveFactState(null)).toEqual(emptyFactState())
    expect(reviveFactState({ seen: 'x', log: [[1, 2], 'a', [1, 2, 3]] }).log).toEqual([[1, 2, 3]])
  })
})

describe('picking', () => {
  it('brings a missed fact back within 3 turns', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const e = new TafelEngine({ seed })
      const first = e.next()
      e.record(first.fact, -1, 2)
      let turns = 0
      let found = false
      while (turns < 3 && !found) {
        const sel = e.next()
        turns++
        if (sel.fact.key === first.fact.key) found = true
        e.record(sel.fact, sel.fact.a * sel.fact.b, 2)
      }
      expect(found, `seed ${seed}`).toBe(true)
    }
  })

  it('never asks the same fact or its pair twice in a row', () => {
    const e = new TafelEngine({ seed: 7 })
    let last: string | null = null
    for (let i = 0; i < 400; i++) {
      const sel = e.next()
      expect(sel.fact.pairKey).not.toBe(last)
      last = sel.fact.pairKey
      e.record(sel.fact, i % 5 === 0 ? 0 : sel.fact.a * sel.fact.b, 2)
    }
  })

  it('draws about 70% weak and 30% strong when both exist', () => {
    const states: Record<string, FactState> = {}
    const facts = buildFacts([2, 3, 4, 5, 6, 7, 8, 9])
    facts.forEach((f, i) => {
      states[f.key] = i % 2 === 0
        ? { ...emptyFactState(), seen: 5, correct: 5, rtEma: 1.5, streakFast: 4, fastDays: ['2026-10-01', '2026-10-02'], last: 'fast', recent: [true, true] }
        : { ...emptyFactState(), seen: 2, correct: 1, wrong: 1, rtEma: 6, last: 'wrong', recent: [true, false] }
    })
    let weak = 0
    const N = 2000
    for (let i = 0; i < N; i++) {
      const e = new TafelEngine({ tables: [2, 3, 4, 5, 6, 7, 8, 9], seed: i + 1, snapshot: { states } })
      if (e.next().pool === 'weak') weak++
    }
    expect(weak / N).toBeGreaterThan(WEAK_SHARE - 0.04)
    expect(weak / N).toBeLessThan(WEAK_SHARE + 0.04)
  })

  it('lets new facts in a few at a time, easiest first', () => {
    const e = new TafelEngine({ seed: 5 })
    const asked = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const sel = e.next()
      asked.add(sel.fact.key)
      e.record(sel.fact, sel.fact.a * sel.fact.b, 6)
    }
    // Slow answers keep facts in "oefenen", so the set stays small.
    expect(asked.size).toBeLessThanOrEqual(WORKING_SET + 1)
    // Nothing like 7x6 before the anchors.
    expect([...asked].some((k) => k === '7x6' || k === '6x7')).toBe(false)
  })

  it('learns everything eventually when answers are fast', () => {
    const c = clock()
    const e = new TafelEngine({ tables: [2, 3], seed: 11, now: c.now })
    for (let day = 0; day < 12; day++) {
      for (let i = 0; i < 40; i++) answer(e)
      c.advance(DAY)
    }
    expect(e.counts().geautomatiseerd).toBe(20)
    expect(e.tableDone(2)).toBe(true)
  })
})

describe('fish', () => {
  it('stays in the air 4 to 7 seconds', () => {
    expect(fishSeconds(emptyFactState())).toBe(6)
    expect(fishSeconds({ ...emptyFactState(), rtEma: 1 })).toBe(4)
    expect(fishSeconds({ ...emptyFactState(), rtEma: 10 })).toBe(7)
  })
})

describe('steunsommen', () => {
  it('end on the right answer and open with the sum as asked, for every fact', () => {
    for (const f of buildFacts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])) {
      const s = steunsom(f.a, f.b)
      expect(s.steps[0]).toBe(`${f.a} x ${f.b}`)
      expect(s.steps[s.steps.length - 1]).toBe(String(f.a * f.b))
      expect(s.steps.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('import from Kit Nugget Klimt', () => {
  const klimt = {
    schemaVersion: 1,
    activeProfile: 'viggo',
    profiles: {
      viggo: {
        engine: {
          states: {
            '7x8': { key: '7x8', seen: 6, correct: 5, wrong: 1, rtEma: 2.1, streakFast: 3, fastDays: ['2026-09-20', '2026-09-21'], lastSeen: 5, lastCorrect: true, recent: [true, true] },
            '6x7': { key: '6x7', seen: 2, correct: 1, wrong: 1, rtEma: 4, streakFast: 0, fastDays: [], lastSeen: 5, lastCorrect: false, recent: [true, false] },
            '5x5': { key: '5x5', seen: 0 },
            junk: { seen: 3 },
          },
        },
      },
    },
  }

  it('takes over seen facts with their status', () => {
    const states = statesFromKlimt(klimt)
    expect(Object.keys(states).sort()).toEqual(['6x7', '7x8'])
    expect(statusOf(states['7x8'])).toBe('geautomatiseerd')
    expect(statusOf(states['6x7'])).toBe('oefenen')
  })

  it('never overwrites what the island already knows', () => {
    const own = { '7x8': { ...emptyFactState(), seen: 1, wrong: 1, last: 'wrong' as const } }
    const { states, taken } = mergeKlimt(own, statesFromKlimt(klimt))
    expect(taken).toBe(1)
    expect(states['7x8'].wrong).toBe(1)
    expect(states['6x7'].seen).toBe(2)
  })

  it('ignores anything that is not a Klimt save', () => {
    expect(statesFromKlimt(null)).toEqual({})
    expect(statesFromKlimt({ profiles: 3 })).toEqual({})
  })
})
