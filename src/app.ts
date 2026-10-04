import { Audio } from './audio/audio'
import { speak, stopSpeaking } from './audio/speak'
import { itemInfo, type ItemId } from './content/blocks'
import { activeToets, TOETSEN, type Toets } from './content'
import { ANIMAL_IDS, type AnimalId } from './scene/animals'
import { IslandScene, type BlockType } from './scene/scene'
import { WordEngine } from './engine/engine'
import { statusOf } from './engine/words'
import { islandSize } from './game/island'
import { Store } from './storage/store'
import { CatDresser, POSE_SPRITE } from './scene/dressup'
import { sanitiseLook, type LookProgress } from './content/looks'
import { clear, el } from './ui/dom'

export type ScreenId = 'menu' | 'round' | 'result' | 'toets' | 'kaart' | 'instellingen' | 'bouwen' | 'aankleden'

export interface Screen {
  root: HTMLElement
  dispose?: () => void
}

export type ScreenFactory = (app: App, payload?: unknown) => Screen

/** The scene API the screens use. A no-op stand-in keeps the game playable without WebGL. */
export type SceneApi = Pick<
  IslandScene,
  | 'setIslandSize'
  | 'setBlocks'
  | 'setProps'
  | 'setInsets'
  | 'rotate'
  | 'setZoom'
  | 'getZoom'
  | 'setMood'
  | 'catPose'
  | 'catJump'
  | 'catSurprised'
  | 'catWalkTo'
  | 'catPosition'
  | 'animalArrives'
  | 'animalState'
  | 'animalLeaves'
  | 'burst'
  | 'catScreenPos'
  | 'pick'
  | 'tiles'
  | 'pause'
  | 'resume'
>

function nullScene(): SceneApi {
  return new Proxy({} as SceneApi, {
    get(_t, key) {
      if (key === 'catScreenPos') return () => ({ x: window.innerWidth / 2, y: window.innerHeight / 3 })
      if (key === 'catPosition') return () => ({ x: 0, z: 0 })
      if (key === 'pick') return () => null
      if (key === 'getZoom') return () => 1
      if (key === 'tiles') return () => ({ w: 4, d: 4, minX: -2, minZ: -2 })
      return () => Promise.resolve()
    },
  })
}

/** Holds everything long-lived: storage, sound, the island scene, and the current screen. */
export class App {
  readonly store = new Store()
  readonly audio: Audio
  readonly base: string
  readonly scene: SceneApi
  readonly sceneKind: string
  readonly root: HTMLElement
  readonly stage: HTMLElement
  /** Composes Kit Nugget with his outfit, for the scene and the dress-up screen. */
  readonly dresser: CatDresser

  private screens = new Map<ScreenId, ScreenFactory>()
  private current: Screen | null = null
  private host: HTMLElement
  private lastAnimal: AnimalId | null = null

  constructor(mount: HTMLElement) {
    this.base = new URL('./', location.href).href
    this.audio = new Audio(this.base)
    this.audio.effects = this.store.profile.settings.sound
    this.root = mount
    this.stage = el('div', { id: 'stage' })
    this.host = el('div', { id: 'screens' })
    mount.append(this.stage, this.host)

    let scene: SceneApi
    let kind = 'geen 3D'
    try {
      const real = new IslandScene(this.stage, { base: this.base, models: __MODELS__ })
      scene = real
      kind = 'laden'
      // The avatar loads asynchronously; read the kind once it settled.
      void real.ready.then(() => {
        ;(this as { sceneKind: string }).sceneKind = real.catKind
        this.pushLook()
      })
    } catch (err) {
      console.warn('Geen WebGL, het spel draait zonder eiland', err)
      scene = nullScene()
    }
    this.scene = scene
    this.sceneKind = kind
    this.dresser = new CatDresser(this.base)
    this.dresser.subscribe(() => this.pushLook())
    this.applyLook()
    this.syncIsland(false)

    // iOS needs a real gesture before any sound.
    const gestures = ['pointerdown', 'touchend', 'click', 'keydown'] as const
    const kick = () => {
      this.audio.unlock()
      if (!this.audio.ready) return
      for (const type of gestures) document.removeEventListener(type, kick)
    }
    for (const type of gestures) document.addEventListener(type, kick)

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.scene.pause()
      else this.scene.resume()
    })
  }

  register(id: ScreenId, factory: ScreenFactory): void {
    this.screens.set(id, factory)
  }

  go(id: ScreenId, payload?: unknown): void {
    const factory = this.screens.get(id)
    if (!factory) return
    stopSpeaking()
    this.current?.dispose?.()
    clear(this.host)
    this.current = factory(this, payload)
    this.host.appendChild(this.current.root)
  }

  // ---------- words ----------

  get toets(): Toets {
    return activeToets(this.store.profile.settings.toets)
  }

  makeEngine(toets = this.toets): WordEngine {
    return new WordEngine({ toets, states: this.store.profile.words[toets.id] })
  }

  saveEngine(engine: WordEngine): void {
    this.store.update((p) => {
      p.words[engine.toets.id] = engine.snapshot()
    })
  }

  /** Learned words over every test, for the island size. */
  learnedTotal(): number {
    let n = 0
    for (const t of TOETSEN) {
      const words = this.store.profile.words[t.id] ?? {}
      for (const q of t.questions) if (words[q.word] && statusOf(words[q.word]) === 'geleerd') n++
    }
    return n
  }

  learnedIn(toets = this.toets): number {
    const words = this.store.profile.words[toets.id] ?? {}
    return toets.questions.filter((q) => words[q.word] && statusOf(words[q.word]) === 'geleerd').length
  }

  // ---------- island ----------

  /** Pushes island size and placed items to the scene. Returns true when it grew since last seen. */
  syncIsland(animate: boolean): boolean {
    const size = islandSize(this.learnedTotal())
    const p = this.store.profile
    const grew = size.step > p.island.seenStep
    void this.scene.setIslandSize(size.w, size.d, animate && grew)
    if (grew && animate) {
      this.store.update((pp) => {
        pp.island.seenStep = size.step
      })
    } else if (!animate && size.step < p.island.seenStep) {
      this.store.update((pp) => {
        pp.island.seenStep = size.step
      })
    }
    this.pushPlaced()
    return grew && animate
  }

  pushPlaced(): void {
    const placed = this.store.profile.island.blocks
    const blocks = placed.filter((b) => itemInfo(b.type)?.kind === 'block').map((b) => ({ x: b.x, z: b.z, y: b.y, type: b.type as BlockType }))
    const props = placed.filter((b) => itemInfo(b.type)?.kind === 'furniture').map((b) => ({ x: b.x, z: b.z, y: b.y, type: b.type }))
    this.scene.setBlocks(blocks)
    this.scene.setProps(props)
  }

  // ---------- dressing up ----------

  lookProgress(): LookProgress {
    const p = this.store.profile
    return { learned: this.learnedTotal(), rounds: p.stats.rounds, days: p.days.played, fed: p.stats.fed }
  }

  /** Applies the stored outfit (minus anything not unlocked) to the scene. */
  applyLook(): void {
    const look = sanitiseLook(this.store.profile.look, this.lookProgress())
    this.dresser.setLook(look)
    this.pushLook()
  }

  private pushLook(): void {
    const set = (this.scene as unknown as { setCatImage?: (pose: string, c: HTMLCanvasElement | null, inset?: { x: number; y: number; w: number; h: number }) => void }).setCatImage
    if (!set) return
    for (const [pose, sprite] of Object.entries(POSE_SPRITE)) {
      if (this.dresser.isPlain) {
        set.call(this.scene, pose, null)
        continue
      }
      const d = this.dresser.dressed(sprite)
      if (d) set.call(this.scene, pose, d.canvas, d.inset)
    }
  }

  nextAnimal(): AnimalId {
    const options = ANIMAL_IDS.filter((a) => a !== this.lastAnimal)
    const pick = options[Math.floor(Math.random() * options.length)]
    this.lastAnimal = pick
    return pick
  }

  // ---------- small shared effects ----------

  say(text: string): void {
    if (!this.store.profile.settings.speak) return
    speak(text)
  }

  /** Reward icons fly from Kit Nugget to a target element. */
  flyRewards(items: ItemId[], target: HTMLElement | null): Promise<void> {
    if (items.length === 0) return Promise.resolve()
    const stageRect = this.stage.getBoundingClientRect()
    const from = this.scene.catScreenPos()
    const sx = stageRect.left + from.x
    const sy = stageRect.top + from.y
    const t = target?.getBoundingClientRect()
    const tx = t ? t.left + t.width / 2 : window.innerWidth - 40
    const ty = t ? t.top + t.height / 2 : 40
    const flights = items.map(
      (id, i) =>
        new Promise<void>((resolve) => {
          const icon = el('div.flyer', { text: itemInfo(id)?.icon ?? '⭐' })
          icon.style.left = `${sx - 18}px`
          icon.style.top = `${sy - 18}px`
          document.body.appendChild(icon)
          const dx = tx - sx
          const dy = ty - sy
          const lift = -60 - Math.random() * 50
          const spread = (i - (items.length - 1) / 2) * 34
          const anim = icon.animate(
            [
              { transform: 'translate(0,0) scale(0.4)', opacity: 0 },
              { transform: `translate(${spread}px, ${lift}px) scale(1.15)`, opacity: 1, offset: 0.35 },
              { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.9 },
            ],
            { duration: 900 + i * 90, delay: i * 110, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' },
          )
          anim.onfinish = () => {
            icon.remove()
            target?.classList.remove('bump')
            void target?.offsetWidth
            target?.classList.add('bump')
            resolve()
          }
        }),
    )
    return Promise.all(flights).then(() => undefined)
  }

  toast(text: string, parent: HTMLElement = this.host): void {
    const t = el('div.toast.bubble', { text })
    parent.appendChild(t)
    window.setTimeout(() => t.remove(), 2700)
  }
}
