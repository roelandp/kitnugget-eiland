import type { ItemId } from '../content/blocks'
import { ITEMS } from '../content/blocks'
import { emptyDays, type Days } from '../game/day'
import { CAP_SECONDS, START_SECONDS } from '../game/buildtime'
import type { Inventory } from '../game/rewards'
import { reviveState, type WordState } from '../engine/words'
import { emptyTafelSnapshot, type DayStat, type TafelSnapshot } from '../engine/tafels/engine'
import { ALL_TABLES, reviveFactState } from '../engine/tafels/facts'

export const STORAGE_KEY = 'kitnugget-eiland.v1'
/** 2: tafels (multiplication facts) next to the words. */
export const SCHEMA_VERSION = 2

/** What the game practises: words for the school test, or the times tables. */
export type Vak = 'woorden' | 'tafels'

export interface Settings {
  /** Chosen test id, or null for the newest. */
  toets: string | null
  sound: boolean
  speak: boolean
  vak: Vak
}

export interface TestResult {
  at: number
  toets: string
  total: number
  correct: number
  /** 1 to 10, one decimal. */
  grade: number
  wrong: { word: string; answer: string }[]
}

export interface TafelTestResult {
  at: number
  total: number
  correct: number
  /** Time for the whole test, in seconds. */
  seconds: number
  wrong: { sum: string; answer: number | null; right: number }[]
}

/** Everything about the times tables. */
export interface Tafels {
  engine: TafelSnapshot
  /** Tables being practised. */
  tables: number[]
  tests: TafelTestResult[]
  /** Progress from Kit Nugget Klimt was looked for once. */
  klimtChecked: boolean
  /** Tables that were fully automated once (and gave a present). */
  tablesDone: number[]
}

export function emptyTafels(): Tafels {
  return { engine: emptyTafelSnapshot(), tables: [...ALL_TABLES], tests: [], klimtChecked: false, tablesDone: [] }
}

export interface PlacedBlock {
  x: number
  z: number
  y: number
  type: ItemId
  /** Quarter turns, for furniture. */
  rot?: number
}

export interface Island {
  /** User-built blocks and furniture. */
  blocks: PlacedBlock[]
  /** Size the player has already seen, so growth can be animated once. */
  seenStep: number
  /** Whether the lighthouse was already handed out, per test id. */
  lighthouses: string[]
}

export interface Look {
  hats: string[]
  pattern: string | null
  cape: string | null
  /** A friend riding on Kit Nugget's back, e.g. 'uil' for Uilie. */
  rider?: string | null
}

export interface Profile {
  naam: string
  /** Learning state per test id and word. */
  words: Record<string, Record<string, WordState>>
  tafels: Tafels
  island: Island
  inventory: Inventory
  look: Look
  days: Days
  tests: TestResult[]
  settings: Settings
  stats: { rounds: number; fed: number; answers: number }
  /** Seconds of building left, earned by answering. */
  buildTime: number
  /** The one-off extension (5 right in a row) was used; a full round frees it again. */
  extensionUsed: boolean
  /** The starter set of furniture was handed out. */
  starterGiven: boolean
  /** Furniture already handed out as a gift, so new kinds can be given once later on. */
  gifts: string[]
}

export interface SaveFile {
  schemaVersion: number
  activeProfile: string
  profiles: Record<string, Profile>
}

export function emptyProfile(naam = 'Viggo'): Profile {
  return {
    naam,
    words: {},
    tafels: emptyTafels(),
    island: { blocks: [], seenStep: 0, lighthouses: [] },
    inventory: {},
    look: { hats: [], pattern: null, cape: null },
    days: emptyDays(),
    tests: [],
    settings: { toets: null, sound: true, speak: true, vak: 'woorden' },
    stats: { rounds: 0, fed: 0, answers: 0 },
    buildTime: START_SECONDS,
    extensionUsed: false,
    starterGiven: false,
    gifts: [],
  }
}

export function emptySave(): SaveFile {
  return { schemaVersion: SCHEMA_VERSION, activeProfile: 'viggo', profiles: { viggo: emptyProfile() } }
}

const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d)
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const ITEM_IDS = new Set<string>(ITEMS.map((i) => i.id))

function migrateProfile(raw: unknown): Profile {
  const p = emptyProfile()
  const v = obj(raw)
  if (typeof v.naam === 'string') p.naam = v.naam

  for (const [toets, words] of Object.entries(obj(v.words))) {
    p.words[toets] = {}
    for (const [word, state] of Object.entries(obj(words))) p.words[toets][word] = reviveState(state)
  }

  const island = obj(v.island)
  if (Array.isArray(island.blocks)) {
    p.island.blocks = island.blocks
      .map((b) => obj(b))
      .filter((b) => typeof b.type === 'string' && ITEM_IDS.has(b.type))
      .map((b) => {
        const out: PlacedBlock = { x: Math.round(num(b.x, 0)), z: Math.round(num(b.z, 0)), y: Math.max(0, Math.round(num(b.y, 0))), type: b.type as ItemId }
        const rot = Math.round(num(b.rot, 0)) % 4
        if (rot > 0) out.rot = rot
        return out
      })
  }
  p.island.seenStep = num(island.seenStep, 0)
  if (Array.isArray(island.lighthouses)) p.island.lighthouses = island.lighthouses.filter((x): x is string => typeof x === 'string')

  for (const [id, n] of Object.entries(obj(v.inventory))) {
    if (ITEM_IDS.has(id)) p.inventory[id as ItemId] = Math.max(0, Math.round(num(n, 0)))
  }

  const look = obj(v.look)
  p.look = {
    hats: Array.isArray(look.hats) ? look.hats.filter((x): x is string => typeof x === 'string') : [],
    pattern: typeof look.pattern === 'string' ? look.pattern : null,
    cape: typeof look.cape === 'string' ? look.cape : null,
    rider: typeof look.rider === 'string' ? look.rider : null,
  }

  const days = obj(v.days)
  p.days = {
    played: num(days.played, 0),
    lastDay: typeof days.lastDay === 'string' ? days.lastDay : null,
    lastAt: num(days.lastAt, 0),
    roundsToday: num(days.roundsToday, 0),
  }

  if (Array.isArray(v.tests)) {
    p.tests = v.tests
      .map((t) => obj(t))
      .filter((t) => typeof t.toets === 'string')
      .map((t) => ({
        at: num(t.at, 0),
        toets: t.toets as string,
        total: num(t.total, 0),
        correct: num(t.correct, 0),
        grade: num(t.grade, 1),
        wrong: Array.isArray(t.wrong) ? (t.wrong as { word: string; answer: string }[]).filter((w) => w && typeof w.word === 'string') : [],
      }))
      .slice(-10)
  }

  const s = obj(v.settings)
  p.settings = {
    toets: typeof s.toets === 'string' ? s.toets : null,
    sound: typeof s.sound === 'boolean' ? s.sound : true,
    speak: typeof s.speak === 'boolean' ? s.speak : true,
    vak: s.vak === 'tafels' ? 'tafels' : 'woorden',
  }
  p.tafels = migrateTafels(v.tafels)
  const stats = obj(v.stats)
  p.stats = { rounds: num(stats.rounds, 0), fed: num(stats.fed, 0), answers: num(stats.answers, 0) }
  p.buildTime = Math.max(0, Math.min(CAP_SECONDS, num(v.buildTime, START_SECONDS)))
  p.extensionUsed = v.extensionUsed === true
  p.starterGiven = v.starterGiven === true
  p.gifts = Array.isArray(v.gifts) ? v.gifts.filter((x): x is string => typeof x === 'string') : []
  // The first starter set held these; they count as handed out.
  if (p.starterGiven && p.gifts.length === 0) p.gifts = ['mand', 'bed', 'krabpaal', 'voerbak', 'lantaarn', 'bankje', 'boompje', 'hek', 'bloempot', 'parasol', 'tafeltje']
  return p
}

function migrateTafels(raw: unknown): Tafels {
  const t = emptyTafels()
  const v = obj(raw)
  const e = obj(v.engine)
  for (const [key, state] of Object.entries(obj(e.states))) {
    if (/^\d+x\d+$/.test(key)) t.engine.states[key] = reviveFactState(state)
  }
  if (Array.isArray(e.queue)) {
    t.engine.queue = e.queue
      .map((q) => obj(q))
      .filter((q) => typeof q.key === 'string')
      .map((q) => ({ key: q.key as string, dueTurn: num(q.dueTurn, 0) }))
  }
  t.engine.turn = num(e.turn, 0)
  t.engine.lastKey = typeof e.lastKey === 'string' ? e.lastKey : null
  t.engine.lastPairKey = typeof e.lastPairKey === 'string' ? e.lastPairKey : null
  for (const [day, d] of Object.entries(obj(e.daily))) {
    const x = obj(d)
    const counts = Array.isArray(x.counts) && x.counts.length === 4 ? (x.counts.map((c) => num(c, 0)) as DayStat['counts']) : ([0, 0, 0, 0] as DayStat['counts'])
    t.engine.daily[day] = { n: num(x.n, 0), right: num(x.right, 0), fast: num(x.fast, 0), rtSum: num(x.rtSum, 0), rtN: num(x.rtN, 0), counts }
  }
  if (Array.isArray(v.tables)) {
    const tables = [...new Set(v.tables.filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 10))].sort((a, b) => a - b)
    if (tables.length > 0) t.tables = tables
  }
  if (Array.isArray(v.tests)) {
    t.tests = v.tests
      .map((x) => obj(x))
      .map((x) => ({
        at: num(x.at, 0),
        total: num(x.total, 0),
        correct: num(x.correct, 0),
        seconds: num(x.seconds, 0),
        wrong: Array.isArray(x.wrong)
          ? x.wrong
              .map((w) => obj(w))
              .filter((w) => typeof w.sum === 'string')
              .map((w) => ({ sum: w.sum as string, answer: typeof w.answer === 'number' ? w.answer : null, right: num(w.right, 0) }))
          : [],
      }))
      .slice(-10)
  }
  t.klimtChecked = v.klimtChecked === true
  t.tablesDone = Array.isArray(v.tablesDone) ? v.tablesDone.filter((n): n is number => typeof n === 'number') : []
  return t
}

/** Brings older or partial saves up to the current shape. Never throws. */
export function migrate(raw: unknown): SaveFile {
  const data = obj(raw)
  const out: SaveFile = {
    schemaVersion: SCHEMA_VERSION,
    activeProfile: typeof data.activeProfile === 'string' ? data.activeProfile : 'viggo',
    profiles: {},
  }
  // Version 1 had no tafels yet; migrateProfile fills them in empty.
  for (const [key, value] of Object.entries(obj(data.profiles))) out.profiles[key] = migrateProfile(value)
  if (!out.profiles[out.activeProfile]) out.profiles[out.activeProfile] = emptyProfile()
  return out
}
