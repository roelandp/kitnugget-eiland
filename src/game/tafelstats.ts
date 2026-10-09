/** Numbers behind the times-table charts. Pure, so it can be tested. */
import type { DayStat } from '../engine/tafels/engine'
import { FAST_SECONDS, readLog, statusOf, type FactResult, type FactState, type FactStatus } from '../engine/tafels/facts'

export interface DayPoint {
  day: string
  /** Facts per status after that day: nieuw, oefenen, snel, geautomatiseerd. */
  counts: [number, number, number, number]
  /** Average seconds for a right answer without help, null without such answers. */
  avgRt: number | null
  n: number
  /** Share of answers that were right and quick (0 to 1). */
  fastShare: number
}

/** Played days, oldest first. */
export function daySeries(daily: Record<string, DayStat>): DayPoint[] {
  return Object.keys(daily)
    .sort()
    .map((day) => {
      const d = daily[day]
      return {
        day,
        counts: d.counts,
        avgRt: d.rtN > 0 ? d.rtSum / d.rtN : null,
        n: d.n,
        fastShare: d.n > 0 ? d.fast / d.n : 0,
      }
    })
}

/** Average answer time over the first and the last `span` days that have times. */
export function speedChange(points: DayPoint[], span = 3): { first: number; last: number } | null {
  const timed = points.filter((p) => p.avgRt !== null)
  if (timed.length < 2) return null
  const k = Math.max(1, Math.min(span, Math.floor(timed.length / 2)))
  const avg = (ps: DayPoint[]) => ps.reduce((s, p) => s + (p.avgRt ?? 0), 0) / ps.length
  return { first: avg(timed.slice(0, k)), last: avg(timed.slice(-k)) }
}

/** Status counts of the ten facts of one table (table x 1 to table x 10). */
export function tableCounts(states: Record<string, FactState>, table: number): Record<FactStatus, number> {
  const out: Record<FactStatus, number> = { nieuw: 0, oefenen: 0, snel: 0, geautomatiseerd: 0 }
  for (let b = 1; b <= 10; b++) {
    const s = states[`${table}x${b}`]
    out[s ? statusOf(s) : 'nieuw']++
  }
  return out
}

export interface Attempt {
  i: number
  at: number
  rt: number
  result: FactResult
}

export function attempts(state: FactState): Attempt[] {
  return state.log.map((e, i) => ({ i, ...readLog(e) }))
}

export { FAST_SECONDS }

/** "3,4 s" */
export function secondsText(s: number | null): string {
  if (s === null) return '-'
  return `${(Math.round(s * 10) / 10).toFixed(1).replace('.', ',')} s`
}

/** "9 okt" */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }).replace('.', '')
}
