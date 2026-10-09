/**
 * How big the island is. Learned words (over all tests) and automated times-table
 * facts both count: 5 words or 10 facts make one strip of land.
 */

export const START_SIZE = 4
export const WORDS_PER_STEP = 5
export const FACTS_PER_STEP = 10
/** Points per strip: a word is worth 2, a fact 1. */
const POINTS_PER_STEP = 10
const WORD_POINTS = POINTS_PER_STEP / WORDS_PER_STEP
/** 40 learned words: 8 steps, from 4x4 to 8x8. All 100 facts add 10 more steps: 13x13. */
export const MAX_SIZE = 13

export interface IslandSize {
  w: number
  d: number
  /** Number of growth steps taken. */
  step: number
}

function points(words: number, facts: number): number {
  return words * WORD_POINTS + facts
}

/** Every 5 learned words (or 10 automated facts) add a strip, alternating width and depth: 4x4, 5x4, 5x5, 6x5 ... */
export function islandSize(learned: number, facts = 0): IslandSize {
  return sizeForStep(Math.floor(points(learned, facts) / POINTS_PER_STEP))
}

export function sizeForStep(step: number): IslandSize {
  const maxSteps = (MAX_SIZE - START_SIZE) * 2
  const s = Math.max(0, Math.min(maxSteps, step))
  return { w: START_SIZE + Math.ceil(s / 2), d: START_SIZE + Math.floor(s / 2), step: s }
}

/**
 * How full the bar towards the next strip of land is. Learned words fill a
 * fifth each, automated facts a tenth; words that are almost learned and facts
 * that are already quick fill half of that, so progress shows from the first
 * rounds. The bar only reaches the end when the strip is really earned.
 * `toGo` is in words, `factsToGo` in facts (either one finishes the strip).
 */
export function growthProgress(learned: number, almost: number, facts = 0, quick = 0): { fill: number; toGo: number; factsToGo: number } {
  const inStep = points(learned, facts) % POINTS_PER_STEP
  const left = POINTS_PER_STEP - inStep
  const half = 0.5 * Math.min(points(almost, quick), left)
  const fill = Math.min(0.95, (inStep + half) / POINTS_PER_STEP)
  return { fill, toGo: Math.ceil(left / WORD_POINTS), factsToGo: left }
}

/** Words to go until the next growth step. */
export function wordsToNextStep(learned: number): number {
  return WORDS_PER_STEP - (learned % WORDS_PER_STEP)
}

/** The lighthouse is the prize for learning every word of a test. */
export function earnsLighthouse(learnedInToets: number, toetsSize: number): boolean {
  return toetsSize > 0 && learnedInToets >= toetsSize
}
