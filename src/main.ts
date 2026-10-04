import './style.css'
import { App } from './app'
import { aankledenScreen } from './ui/aankleden'
import { bouwenScreen } from './ui/bouwen'
import { kaartScreen } from './ui/kaart'
import { instellingenScreen } from './ui/instellingen'
import { menuScreen } from './ui/menu'
import { resultScreen } from './ui/result'
import { roundScreen } from './ui/round'
import { toetsScreen } from './ui/toets'

/**
 * Fresh code always wins. The service worker is registered with autoUpdate and
 * skipWaiting, so a new build takes over as soon as it is found; we also check
 * again whenever the app comes back to the foreground, which is how an installed
 * web app on an iPad usually returns.
 */
async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  // On a first install the worker claims the page straight away; only a *later*
  // takeover means new code arrived, and only then is a reload worth doing.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    const note = document.createElement('div')
    note.className = 'update-note bubble'
    note.textContent = 'Nieuwe versie, even opnieuw laden'
    document.body.appendChild(note)
    window.setTimeout(() => location.reload(), 700)
  })
  try {
    const { registerSW } = await import('virtual:pwa-register')
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        void updateSW(true)
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return
        const check = () => {
          if (document.visibilityState === 'visible') void registration.update()
        }
        // An installed app usually comes back by being reopened, not reloaded.
        document.addEventListener('visibilitychange', check)
        window.addEventListener('focus', check)
        window.addEventListener('online', check)
        window.setInterval(check, 30 * 60 * 1000)
      },
    })
  } catch {
    // No service worker in dev, or blocked: the game runs fine without one.
  }
}

/**
 * Keeps #app exactly as tall as the visible area. When the on-screen keyboard
 * opens, the visual viewport shrinks: the whole app (scene and card) then fits
 * above the keyboard, so nothing is covered.
 */
function syncAppHeight(): void {
  const mount = document.getElementById('app')
  if (!mount) return
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isStandalone = Boolean((window.navigator as unknown as { standalone?: boolean }).standalone) || window.matchMedia('(display-mode: standalone)').matches
  const vv = window.visualViewport

  const update = () => {
    const keyboard = vv ? window.innerHeight - vv.height > 120 : false
    let h: number
    if (keyboard && vv) {
      h = vv.height
    } else if (isIOS && isStandalone) {
      // In an iOS home-screen app WebKit subtracts the status bar from innerHeight.
      h = window.innerWidth > window.innerHeight ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height)
    } else {
      h = window.innerHeight
    }
    mount.style.height = `${Math.round(h)}px`
    mount.style.transform = keyboard && vv ? `translateY(${Math.round(vv.offsetTop)}px)` : ''
    document.body.classList.toggle('kb-open', keyboard)
  }

  update()
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', () => window.setTimeout(update, 250))
  vv?.addEventListener('resize', update)
  vv?.addEventListener('scroll', update)
}

function boot(): void {
  const mount = document.getElementById('app')
  if (!mount) return
  syncAppHeight()
  const app = new App(mount)
  app.register('menu', menuScreen)
  app.register('round', roundScreen)
  app.register('result', resultScreen)
  app.register('toets', toetsScreen)
  app.register('kaart', kaartScreen)
  app.register('instellingen', instellingenScreen)
  app.register('bouwen', bouwenScreen)
  app.register('aankleden', aankledenScreen)
  app.go('menu')
  ;(window as unknown as { __app: App }).__app = app

  const splash = document.getElementById('splash')
  if (splash) {
    splash.classList.add('gone')
    window.setTimeout(() => splash.remove(), 400)
  }

  // No pinch zoom, no double tap zoom, no rubber banding.
  document.addEventListener('gesturestart', (e) => e.preventDefault())
  document.addEventListener('dblclick', (e) => e.preventDefault())

  void registerServiceWorker()
}

boot()
