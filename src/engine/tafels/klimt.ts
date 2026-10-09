import { emptyFactState, reviveFactState, type FactState } from './facts'

/** Where Kit Nugget Klimt keeps its save; on the same site the island can read it. */
export const KLIMT_KEY = 'kitnugget.v1'

/**
 * Turns the fact states from a Kit Nugget Klimt save into island states.
 * Klimt kept no answer log, so the log starts empty. Pure and forgiving:
 * anything unexpected gives an empty result.
 */
export function statesFromKlimt(raw: unknown): Record<string, FactState> {
  const out: Record<string, FactState> = {}
  if (!raw || typeof raw !== 'object') return out
  const save = raw as { activeProfile?: unknown; profiles?: Record<string, unknown> }
  const id = typeof save.activeProfile === 'string' ? save.activeProfile : 'viggo'
  const profile = save.profiles?.[id] as { engine?: { states?: Record<string, unknown> } } | undefined
  const states = profile?.engine?.states
  if (!states || typeof states !== 'object') return out
  for (const [key, value] of Object.entries(states)) {
    if (!/^\d+x\d+$/.test(key) || !value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const s = reviveFactState(v)
    if (s.seen === 0) continue
    // Klimt only kept whether the last answer was right.
    if (v.lastCorrect === false) s.last = 'wrong'
    else if (v.lastCorrect === true) s.last = s.streakFast > 0 ? 'fast' : 'slow'
    out[key] = s
  }
  return out
}

/** Adds imported states for facts the island has not asked yet. Returns how many were taken over. */
export function mergeKlimt(own: Record<string, FactState>, imported: Record<string, FactState>): { states: Record<string, FactState>; taken: number } {
  const states: Record<string, FactState> = { ...own }
  let taken = 0
  for (const [key, s] of Object.entries(imported)) {
    const mine = states[key] ?? emptyFactState()
    if (mine.seen > 0) continue
    states[key] = s
    taken++
  }
  return { states, taken }
}
