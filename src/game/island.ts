/** How big the island is, from the number of learned words over all tests. */

export const START_SIZE = 4
export const WORDS_PER_STEP = 5
/** 40 learned words: 8 steps, from 4x4 to 8x8. Words from more tests keep it growing a bit. */
export const MAX_SIZE = 12

export interface IslandSize {
  w: number
  d: number
  /** Number of growth steps taken. */
  step: number
}

/** Every 5 learned words add a strip, alternating width and depth: 4x4, 5x4, 5x5, 6x5 ... */
export function islandSize(learned: number): IslandSize {
  const maxSteps = (MAX_SIZE - START_SIZE) * 2
  const step = Math.max(0, Math.min(maxSteps, Math.floor(learned / WORDS_PER_STEP)))
  return { w: START_SIZE + Math.ceil(step / 2), d: START_SIZE + Math.floor(step / 2), step }
}

/** Words to go until the next growth step. */
export function wordsToNextStep(learned: number): number {
  return WORDS_PER_STEP - (learned % WORDS_PER_STEP)
}

/** The lighthouse is the prize for learning every word of a test. */
export function earnsLighthouse(learnedInToets: number, toetsSize: number): boolean {
  return toetsSize > 0 && learnedInToets >= toetsSize
}
