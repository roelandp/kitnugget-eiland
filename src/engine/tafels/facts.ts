/**
 * Multiplication facts and their learning state. Pure, no DOM.
 * Taken from Kit Nugget Klimt and extended with a short answer log per fact,
 * so progress and speed can be shown in charts.
 *
 * Time only counts in the background: the game never shows a clock. A fact is
 * "geautomatiseerd" when it was answered right within FAST_SECONDS three times
 * in a row, on at least two different days.
 */

export type FactStatus = 'nieuw' | 'oefenen' | 'snel' | 'geautomatiseerd'
export const FACT_STATUSES: FactStatus[] = ['nieuw', 'oefenen', 'snel', 'geautomatiseerd']

/** How one answer went. fast/slow are both right; hint is right with the help shown. */
export type FactResult = 'fast' | 'slow' | 'hint' | 'wrong'

/** One logged answer: [timestamp ms, reaction time in tenths of a second, result code]. */
export type LogEntry = [number, number, number]
const RESULT_CODE: Record<FactResult, number> = { wrong: 0, slow: 1, fast: 2, hint: 3 }
const CODE_RESULT: FactResult[] = ['wrong', 'slow', 'fast', 'hint']

/** A single fact `a x b`. `7x8` and `8x7` are distinct facts sharing a pairKey (omkeerregel). */
export interface Fact {
  key: string
  a: number
  b: number
  pairKey: string
}

export interface FactState {
  seen: number
  correct: number
  wrong: number
  hints: number
  /** Exponential moving average of reaction time (s) on right answers without help. */
  rtEma: number | null
  /** Right answers within FAST_SECONDS in a row. */
  streakFast: number
  /** Distinct yyyy-mm-dd dates on which the fact was answered fast and right. */
  fastDays: string[]
  lastSeen: number
  last: FactResult | null
  /** Right (true) or not, newest last, capped at RECENT_WINDOW. */
  recent: boolean[]
  /** The last LOG_MAX answers, oldest first. */
  log: LogEntry[]
}

export const ALL_TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
export const B_MIN = 1
export const B_MAX = 10

/** A right answer within this many seconds counts as automated. Never shown as a clock. */
export const FAST_SECONDS = 3
/** Above this average a fact is still being practised. */
export const SLOW_SECONDS = 5
export const RT_ALPHA = 0.4
export const RECENT_WINDOW = 5
export const LOG_MAX = 40
/** Reaction times are capped, so a break mid-question does not skew the average. */
export const RT_CAP = 15

export function factKey(a: number, b: number): string {
  return `${a}x${b}`
}

export function pairKey(a: number, b: number): string {
  return a <= b ? `${a}x${b}` : `${b}x${a}`
}

export function makeFact(a: number, b: number): Fact {
  return { key: factKey(a, b), a, b, pairKey: pairKey(a, b) }
}

export function parseKey(key: string): Fact | null {
  const m = /^(\d+)x(\d+)$/.exec(key)
  if (!m) return null
  return makeFact(Number(m[1]), Number(m[2]))
}

/** All facts for the chosen tables: a from `tables`, b from 1 to 10. */
export function buildFacts(tables: number[]): Fact[] {
  const out: Fact[] = []
  for (const a of tables) {
    for (let b = B_MIN; b <= B_MAX; b++) out.push(makeFact(a, b))
  }
  return out
}

export function emptyFactState(): FactState {
  return {
    seen: 0,
    correct: 0,
    wrong: 0,
    hints: 0,
    rtEma: null,
    streakFast: 0,
    fastDays: [],
    lastSeen: 0,
    last: null,
    recent: [],
    log: [],
  }
}

const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d)

/** Brings a stored (or partial) state back to the current shape. Never throws. */
export function reviveFactState(raw: unknown): FactState {
  const s = emptyFactState()
  if (!raw || typeof raw !== 'object') return s
  const v = raw as Record<string, unknown>
  s.seen = Math.max(0, num(v.seen, 0))
  s.correct = Math.max(0, num(v.correct, 0))
  s.wrong = Math.max(0, num(v.wrong, 0))
  s.hints = Math.max(0, num(v.hints, 0))
  s.rtEma = typeof v.rtEma === 'number' && Number.isFinite(v.rtEma) ? v.rtEma : null
  s.streakFast = Math.max(0, num(v.streakFast, 0))
  s.fastDays = Array.isArray(v.fastDays) ? v.fastDays.filter((d): d is string => typeof d === 'string') : []
  s.lastSeen = num(v.lastSeen, 0)
  s.last = typeof v.last === 'string' && (CODE_RESULT as string[]).includes(v.last) ? (v.last as FactResult) : null
  s.recent = Array.isArray(v.recent) ? v.recent.filter((x): x is boolean => typeof x === 'boolean').slice(-RECENT_WINDOW) : []
  s.log = Array.isArray(v.log)
    ? v.log
        .filter((e): e is LogEntry => Array.isArray(e) && e.length === 3 && e.every((x) => typeof x === 'number'))
        .slice(-LOG_MAX)
    : []
  return s
}

function lastNCorrect(state: FactState, n: number): boolean {
  if (state.recent.length < n) return false
  return state.recent.slice(-n).every(Boolean)
}

export function statusOf(state: FactState): FactStatus {
  if (state.seen === 0) return 'nieuw'
  // A miss, or needing the help, always means practising.
  if (state.last === 'wrong' || state.last === 'hint') return 'oefenen'
  if (state.streakFast >= 3 && state.fastDays.length >= 2) return 'geautomatiseerd'
  if (state.rtEma === null || state.rtEma > SLOW_SECONDS) return 'oefenen'
  return lastNCorrect(state, 2) ? 'snel' : 'oefenen'
}

/** Seconds the bonus fish stays in the air: generous, a bit shorter once a fact gets quick. */
export function fishSeconds(state: FactState): number {
  if (state.rtEma === null) return 6
  return Math.min(7, Math.max(4, state.rtEma * 1.5))
}

export function ema(prev: number | null, value: number, alpha = RT_ALPHA): number {
  return prev === null ? value : prev * (1 - alpha) + value * alpha
}

export function isWeak(status: FactStatus): boolean {
  return status === 'nieuw' || status === 'oefenen'
}

/** Local calendar date. */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function logEntry(ts: number, rt: number, result: FactResult): LogEntry {
  return [ts, Math.round(Math.min(rt, 60) * 10), RESULT_CODE[result]]
}

export function readLog(e: LogEntry): { at: number; rt: number; result: FactResult } {
  return { at: e[0], rt: e[1] / 10, result: CODE_RESULT[e[2]] ?? 'wrong' }
}

/**
 * How hard a fact is to learn, lower is easier. Ankers (x10, x1, x2, x5) first,
 * x7 and x6 last. Used for the order in which new facts are introduced.
 */
const RANK: Record<number, number> = { 10: 0, 1: 1, 2: 2, 5: 3, 9: 4, 4: 5, 3: 6, 8: 7, 6: 8, 7: 9 }
export function difficulty(f: Fact): number {
  return (RANK[f.a] ?? 9) + (RANK[f.b] ?? 9) + (f.a * f.b) / 1000
}
