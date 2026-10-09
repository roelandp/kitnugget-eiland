import { el } from './dom'

export interface NumpadHandlers {
  onDigit: (digit: number) => void
  onBack: () => void
  onOk: () => void
}

/** Big on-screen keypad, as in Kit Nugget Klimt. A physical keyboard works alongside it. */
export class Numpad {
  readonly root: HTMLElement
  private keyListener: (e: KeyboardEvent) => void
  private locked = false

  constructor(private handlers: NumpadHandlers) {
    const keys: HTMLElement[] = []
    const press = (fn: () => void) => () => {
      if (!this.locked) fn()
    }
    for (let n = 1; n <= 9; n++) keys.push(el('button.key', { type: 'button', onclick: press(() => this.handlers.onDigit(n)) }, String(n)))
    keys.push(el('button.key.util', { type: 'button', 'aria-label': 'Wissen', onclick: press(() => this.handlers.onBack()) }, '⌫'))
    keys.push(el('button.key', { type: 'button', onclick: press(() => this.handlers.onDigit(0)) }, '0'))
    keys.push(el('button.key.ok', { type: 'button', onclick: press(() => this.handlers.onOk()) }, 'OK'))
    this.root = el('div.numpad', {}, ...keys)

    this.keyListener = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || this.locked) return
      if (e.key >= '0' && e.key <= '9') {
        this.handlers.onDigit(Number(e.key))
        e.preventDefault()
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        this.handlers.onBack()
        e.preventDefault()
      } else if (e.key === 'Enter') {
        this.handlers.onOk()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', this.keyListener)
  }

  /** Briefly ignores taps, e.g. to take a calm look first. */
  lock(ms: number): void {
    this.locked = true
    this.root.classList.add('resting')
    window.setTimeout(() => {
      this.locked = false
      this.root.classList.remove('resting')
    }, ms)
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyListener)
  }
}
