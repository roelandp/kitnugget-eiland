import { makeRng, weightedPick, type Rng } from '../rng'
import {
  ALL_TABLES,
  B_MAX,
  FACT_STATUSES,
  FAST_SECONDS,
  LOG_MAX,
  RECENT_WINDOW,
  RT_CAP,
  buildFacts,
  dayKey,
  difficulty,
  ema,
  emptyFactState,
  isWeak,
  logEntry,
  reviveFactState,
  statusOf,
  type Fact,
  type FactResult,
  type FactState,
  type FactStatus,
} from './facts'

/** Chance of drawing from the weak pool (nieuw and oefenen). */
export const WEAK_SHARE = 0.7
/** Facts with 1 or 10 stay in the mix but are drawn far less often. */
export const EDGE_WEIGHT = 0.25
/**
 * New facts are let in a few at a time, so a fact comes by often enough to stick.
 * The weak pool holds the facts being practised plus new ones up to this size,
 * and always at least MIN_NEW new ones while there are any.
 */
export const WORKING_SET = 8
export const MIN_NEW = 2

export interface QueueEntry {
  key: string
  /** Turn from which the fact is due again. */
  dueTurn: number
}

/** Answers on one day, for the charts. */
export interface DayStat {
  /** Answers given. */
  n: number
  /** Right answers (with or without help). */
  right: number
  /** Right within FAST_SECONDS, without help. */
  fast: number
  /** Sum and count of reaction times (s) of right answers without help, capped at RT_CAP. */
  rtSum: number
  rtN: number
  /** Facts per status after the last answer of the day: nieuw, oefenen, snel, geautomatiseerd. */
  counts: [number, number, number, number]
}

export interface TafelSnapshot {
  states: Record<string, FactState>
  queue: QueueEntry[]
  turn: number
  lastKey: string | null
  lastPairKey: string | null
  daily: Record<string, DayStat>
}

export type Pool = 'weak' | 'strong' | 'queue'

export interface Selection {
  fact: Fact
  state: FactState
  status: FactStatus
  pool: Pool
}

export interface TafelOutcome {
  fact: Fact
  answer: number
  correct: boolean
  result: FactResult
  rt: number
  statusBefore: FactStatus
  statusAfter: FactStatus
}

export interface TafelEngineOptions {
  tables?: number[]
  seed?: number
  snapshot?: Partial<TafelSnapshot>
  /** Injectable clock, for tests. */
  now?: () => number
}

export function emptyTafelSnapshot(): TafelSnapshot {
  return { states: {}, queue: [], turn: 0, lastKey: null, lastPairKey: null, daily: {} }
}

/**
 * Picks the next sum and keeps the learning state of every fact. States of
 * facts outside the chosen tables are kept, so switching tables loses nothing.
 */
export class TafelEngine {
  readonly facts: Fact[]
  readonly tables: number[]
  private byKey = new Map<string, Fact>()
  private states = new Map<string, FactState>()
  private queue: QueueEntry[] = []
  private turn = 0
  private lastKey: string | null = null
  private lastPairKey: string | null = null
  private daily: Record<string, DayStat> = {}
  private rng: Rng
  private now: () => number

  constructor(opts: TafelEngineOptions = {}) {
    const tables = (opts.tables ?? ALL_TABLES).filter((t) => t >= 1 && t <= B_MAX)
    this.tables = tables.length > 0 ? tables : ALL_TABLES
    this.facts = buildFacts(this.tables)
    for (const f of this.facts) this.byKey.set(f.key, f)
    this.rng = makeRng(opts.seed ?? (Date.now() & 0x7fffffff))
    this.now = opts.now ?? (() => Date.now())

    const snap = opts.snapshot
    for (const [k, v] of Object.entries(snap?.states ?? {})) this.states.set(k, reviveFactState(v))
    if (snap?.queue) this.queue = snap.queue.filter((q) => this.byKey.has(q.key)).map((q) => ({ ...q }))
    this.turn = snap?.turn ?? 0
    this.lastKey = snap?.lastKey ?? null
    this.lastPairKey = snap?.lastPairKey ?? null
    for (const [d, s] of Object.entries(snap?.daily ?? {})) this.daily[d] = { ...s, counts: [...s.counts] as DayStat['counts'] }
  }

  snapshot(): TafelSnapshot {
    const states: Record<string, FactState> = {}
    for (const [k, v] of this.states) {
      if (v.seen > 0 || v.rtEma !== null) states[k] = { ...v, fastDays: [...v.fastDays], recent: [...v.recent], log: v.log.map((e) => [...e] as typeof e) }
    }
    const daily: Record<string, DayStat> = {}
    for (const [d, s] of Object.entries(this.daily)) daily[d] = { ...s, counts: [...s.counts] as DayStat['counts'] }
    return { states, queue: this.queue.map((q) => ({ ...q })), turn: this.turn, lastKey: this.lastKey, lastPairKey: this.lastPairKey, daily }
  }

  state(key: string): FactState {
    let s = this.states.get(key)
    if (!s) {
      s = emptyFactState()
      this.states.set(key, s)
    }
    return s
  }

  status(key: string): FactStatus {
    return statusOf(this.state(key))
  }

  fact(key: string): Fact | undefined {
    return this.byKey.get(key)
  }

  /** Facts per status within the chosen tables. */
  counts(): Record<FactStatus, number> {
    const out: Record<FactStatus, number> = { nieuw: 0, oefenen: 0, snel: 0, geautomatiseerd: 0 }
    for (const f of this.facts) out[this.status(f.key)]++
    return out
  }

  dailyStats(): Record<string, DayStat> {
    return this.daily
  }

  /** Facts that may be drawn this turn: never the same fact or pair twice in a row. */
  private allowed(pool: Fact[]): Fact[] {
    // Keep a queued fact's partner out of the way, so the repeat lands on time.
    const reserved = new Set<string>()
    for (const q of this.queue) {
      const f = this.byKey.get(q.key)
      if (f) reserved.add(f.pairKey)
    }
    const fresh = (f: Fact) => f.key !== this.lastKey && f.pairKey !== this.lastPairKey
    const first = pool.filter((f) => fresh(f) && !reserved.has(f.pairKey))
    if (first.length > 0) return first
    const second = pool.filter(fresh)
    if (second.length > 0) return second
    // Rather step outside the pool than ask the same pair twice in a row.
    const third = this.facts.filter(fresh)
    if (third.length > 0) return third
    const fourth = this.facts.filter((f) => f.key !== this.lastKey)
    return fourth.length > 0 ? fourth : this.facts
  }

  private edgeFactor(f: Fact): number {
    return f.a === 1 || f.b === 1 || f.a === B_MAX || f.b === B_MAX ? EDGE_WEIGHT : 1
  }

  /** Weak facts: hardest and slowest first. */
  private weakWeight(f: Fact): number {
    const s = this.state(f.key)
    const slow = s.rtEma === null ? 5 : Math.min(s.rtEma, 12)
    const missed = Math.min(s.wrong, 5) * 3
    const fresh = s.seen === 0 ? 4 : 0
    return (1 + slow + missed + fresh) * this.edgeFactor(f)
  }

  /** Strong facts: longest unseen first, and "snel" before "geautomatiseerd" (they still need a second day). */
  private strongWeight(f: Fact): number {
    const s = this.state(f.key)
    const age = s.lastSeen === 0 ? 3_600_000 : this.now() - s.lastSeen
    const push = this.status(f.key) === 'snel' ? 3 : 1
    return (1 + age / 60_000) * push * this.edgeFactor(f)
  }

  /**
   * New facts that may join the weak pool now. A partner of a fact already seen
   * goes first (7x8 known, then 8x7), then the easiest by anchor.
   */
  private admittedNew(practising: number, fresh: Fact[]): Fact[] {
    const room = Math.max(MIN_NEW, WORKING_SET - practising)
    const seenPair = new Set<string>()
    for (const f of this.facts) if (this.state(f.key).seen > 0) seenPair.add(f.pairKey)
    return [...fresh]
      .sort((x, y) => Number(seenPair.has(y.pairKey)) - Number(seenPair.has(x.pairKey)) || difficulty(x) - difficulty(y))
      .slice(0, room)
  }

  /** Picks the next sum. Does not advance the turn; `record` does that. */
  next(): Selection {
    // 1. A fact that was missed (or needed help) and is due again.
    const dueIndex = this.queue.findIndex(
      (q) => q.dueTurn <= this.turn && q.key !== this.lastKey && this.byKey.get(q.key)?.pairKey !== this.lastPairKey,
    )
    if (dueIndex >= 0) {
      const entry = this.queue[dueIndex]
      this.queue.splice(dueIndex, 1)
      const fact = this.byKey.get(entry.key)
      if (fact) return this.select(fact, 'queue')
    }

    const practising: Fact[] = []
    const fresh: Fact[] = []
    const strong: Fact[] = []
    for (const f of this.facts) {
      const st = this.status(f.key)
      if (st === 'nieuw') fresh.push(f)
      else if (isWeak(st)) practising.push(f)
      else strong.push(f)
    }
    const weak = [...practising, ...this.admittedNew(practising.length, fresh)]

    let pool: 'weak' | 'strong' = this.rng.next() < WEAK_SHARE ? 'weak' : 'strong'
    let candidates = pool === 'weak' ? weak : strong
    if (candidates.length === 0) {
      pool = pool === 'weak' ? 'strong' : 'weak'
      candidates = pool === 'weak' ? weak : strong
    }
    const allowed = this.allowed(candidates)
    const weight = pool === 'weak' ? (f: Fact) => this.weakWeight(f) : (f: Fact) => this.strongWeight(f)
    return this.select(weightedPick(this.rng, allowed, weight), pool)
  }

  /** A selection for a given fact, e.g. for the practice test. */
  select(fact: Fact, pool: Pool = 'weak'): Selection {
    const state = this.state(fact.key)
    return { fact, state, status: statusOf(state), pool }
  }

  /**
   * Records an answer. `rt` is seconds from showing the sum to the last typed
   * digit. With `hint` the help was shown first: a right answer then counts as
   * right, but not towards speed.
   */
  record(fact: Fact, answer: number, rt: number, opts: { hint?: boolean } = {}): TafelOutcome {
    const state = this.state(fact.key)
    const statusBefore = statusOf(state)
    const correct = answer === fact.a * fact.b
    const ts = this.now()
    const time = Math.max(0, Math.min(rt, RT_CAP))
    const result: FactResult = !correct ? 'wrong' : opts.hint ? 'hint' : rt <= FAST_SECONDS ? 'fast' : 'slow'

    state.seen++
    state.lastSeen = ts
    state.last = result
    state.recent.push(correct)
    if (state.recent.length > RECENT_WINDOW) state.recent.shift()
    state.log.push(logEntry(ts, rt, result))
    if (state.log.length > LOG_MAX) state.log.shift()

    if (result === 'fast' || result === 'slow') {
      state.correct++
      state.rtEma = ema(state.rtEma, time)
      if (result === 'fast') {
        state.streakFast++
        const day = dayKey(ts)
        if (!state.fastDays.includes(day)) state.fastDays.push(day)
      } else {
        state.streakFast = 0
      }
    } else {
      if (result === 'hint') {
        state.correct++
        state.hints++
      } else {
        state.wrong++
      }
      state.streakFast = 0
      // Comes back within 3 turns, to answer it without help.
      this.queue = this.queue.filter((q) => q.key !== fact.key)
      this.queue.push({ key: fact.key, dueTurn: this.turn + 1 + this.rng.int(1, 2) })
    }

    this.mirror(fact, result, time)

    this.turn++
    this.lastKey = fact.key
    this.lastPairKey = fact.pairKey
    this.tally(ts, result, time)

    return { fact, answer, correct, result, rt, statusBefore, statusAfter: statusOf(state) }
  }

  /** Omkeerregel: 7x8 and 8x7 inform each other, with a damped effect. */
  private mirror(fact: Fact, result: FactResult, rt: number): void {
    if (fact.a === fact.b) return
    const partnerKey = `${fact.b}x${fact.a}`
    const partner = this.state(partnerKey)
    if (result === 'fast' || result === 'slow') {
      partner.rtEma = partner.rtEma === null ? rt * 1.15 : ema(partner.rtEma, rt, 0.2)
    } else if (result === 'wrong' && partner.seen > 0) {
      // Missing 7x8 means 8x7 needs another look too.
      partner.streakFast = 0
    }
  }

  private tally(ts: number, result: FactResult, rt: number): void {
    const day = dayKey(ts)
    const d = (this.daily[day] ??= { n: 0, right: 0, fast: 0, rtSum: 0, rtN: 0, counts: [0, 0, 0, 0] })
    d.n++
    if (result !== 'wrong') d.right++
    if (result === 'fast') d.fast++
    if (result === 'fast' || result === 'slow') {
      d.rtSum = Math.round((d.rtSum + rt) * 10) / 10
      d.rtN++
    }
    const c = this.counts()
    d.counts = FACT_STATUSES.map((s) => c[s]) as DayStat['counts']
  }

  /** Facts that need the most attention, hardest first. Optionally only among the given keys. */
  weakest(n: number, among?: string[]): Fact[] {
    const list = among ? this.facts.filter((f) => among.includes(f.key)) : this.facts
    return list
      .filter((f) => this.state(f.key).seen > 0 && this.status(f.key) !== 'geautomatiseerd')
      .sort((x, y) => this.attention(y) - this.attention(x))
      .slice(0, n)
  }

  private attention(f: Fact): number {
    const s = this.state(f.key)
    return s.wrong * 4 + s.hints * 2 + (s.rtEma ?? 8) + (this.status(f.key) === 'oefenen' ? 3 : 0)
  }

  /** Every fact of a table (a x 1 to a x 10) is geautomatiseerd. */
  tableDone(table: number): boolean {
    for (let b = 1; b <= B_MAX; b++) if (this.status(`${table}x${b}`) !== 'geautomatiseerd') return false
    return true
  }
}
