/**
 * Small hand-drawn SVG charts for the Tafelkaart. No chart library: a few
 * shapes, a hairline grid, a tooltip on hover or tap. Colours come from the
 * --chart-* tokens in style.css (validated for colour-blind separation).
 */
import { el } from './dom'

const NS = 'http://www.w3.org/2000/svg'

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

export interface Series {
  label: string
  /** A CSS colour, normally var(--chart-...). */
  color: string
  /** Drawn as an open ring: a second channel next to colour. */
  hollow?: boolean
}

interface Frame {
  root: HTMLElement
}

/**
 * A chart that draws itself at the width of its box and redraws when the box
 * changes size. `draw` gets the width and a tooltip helper.
 */
function frame(height: number, label: string, draw: (svg: SVGSVGElement, w: number, tip: Tip) => void): Frame {
  const tipEl = el('div.chart-tip.hidden')
  const holder = el('div.chart', { role: 'img', 'aria-label': label })
  holder.style.height = `${height}px`
  const tip: Tip = {
    show(x, y, html) {
      tipEl.innerHTML = html
      tipEl.classList.remove('hidden')
      const w = holder.clientWidth
      const tw = tipEl.offsetWidth
      tipEl.style.left = `${Math.max(0, Math.min(w - tw, x - tw / 2))}px`
      tipEl.style.top = `${Math.max(0, y - tipEl.offsetHeight - 12)}px`
    },
    hide() {
      tipEl.classList.add('hidden')
    },
  }
  let lastW = 0
  const render = () => {
    const w = Math.floor(holder.clientWidth)
    if (w <= 0 || w === lastW) return
    lastW = w
    holder.querySelector('svg')?.remove()
    const svg = svgEl('svg', { width: w, height, viewBox: `0 0 ${w} ${height}` })
    holder.prepend(svg)
    draw(svg, w, tip)
  }
  holder.appendChild(tipEl)
  const ro = new ResizeObserver(render)
  ro.observe(holder)
  return { root: holder }
}

interface Tip {
  show(x: number, y: number, html: string): void
  hide(): void
}

/** Legend row: a swatch beside plain text, so identity never rests on colour alone. */
export function legend(series: Series[], line = false): HTMLElement {
  return el(
    'div.chart-legend',
    {},
    ...series.map((s) =>
      el('span', {}, el(`i${line ? '.line' : ''}${s.hollow ? '.ring' : ''}`, { style: s.hollow ? { borderColor: s.color } : { background: s.color } }), s.label),
    ),
  )
}

const PAD = { top: 12, right: 14, bottom: 24, left: 34 }

function niceMax(v: number): number {
  if (v <= 5) return 5
  if (v <= 10) return 10
  const step = v <= 50 ? 10 : 20
  return Math.ceil(v / step) * step
}

function gridY(svg: SVGSVGElement, w: number, h: number, max: number, ticks: number, fmt: (v: number) => string): (v: number) => number {
  const y = (v: number) => PAD.top + (h - PAD.top - PAD.bottom) * (1 - v / max)
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i
    svg.appendChild(svgEl('line', { x1: PAD.left, x2: w - PAD.right, y1: y(v), y2: y(v), class: 'grid' }))
    const t = svgEl('text', { x: PAD.left - 6, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' })
    t.textContent = fmt(v)
    svg.appendChild(t)
  }
  return y
}

function xLabels(svg: SVGSVGElement, h: number, xs: number[], labels: string[]): void {
  const n = labels.length
  const pick = n <= 1 ? [0] : [0, n - 1]
  for (const i of pick) {
    const t = svgEl('text', { x: xs[i], y: h - 6, class: 'tick', 'text-anchor': n > 1 ? (i === 0 ? 'start' : 'end') : 'middle' })
    t.textContent = labels[i]
    svg.appendChild(t)
  }
}

/** Crosshair + tooltip over a chart with one value per x position. */
function crosshair(svg: SVGSVGElement, w: number, h: number, xs: number[], html: (i: number) => string, tip: Tip, yAt: (i: number) => number): void {
  const line = svgEl('line', { y1: PAD.top, y2: h - PAD.bottom, class: 'cross hidden' })
  svg.appendChild(line)
  const hit = svgEl('rect', { x: 0, y: 0, width: w, height: h, fill: 'transparent' })
  const move = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect()
    const px = e.clientX - r.left
    let best = 0
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i
    line.setAttribute('x1', String(xs[best]))
    line.setAttribute('x2', String(xs[best]))
    line.classList.remove('hidden')
    tip.show(xs[best], yAt(best), html(best))
  }
  hit.addEventListener('pointermove', move)
  hit.addEventListener('pointerdown', move)
  hit.addEventListener('pointerleave', () => {
    line.classList.add('hidden')
    tip.hide()
  })
  svg.appendChild(hit)
}

/** Stacked areas over time, e.g. how many facts are in each status per day. Bottom series first. */
export function stackedArea(opts: { values: number[][]; series: Series[]; labels: string[]; tipTitle: (i: number) => string; height?: number; ariaLabel: string }): HTMLElement {
  const h = opts.height ?? 200
  return frame(h, opts.ariaLabel, (svg, w, tip) => {
    const totals = opts.values.map((v) => v.reduce((a, b) => a + b, 0))
    const max = niceMax(Math.max(1, ...totals))
    const y = gridY(svg, w, h, max, 4, (v) => String(Math.round(v)))
    const n = opts.values.length
    const xs = opts.values.map((_, i) => (n === 1 ? (PAD.left + w - PAD.right) / 2 : PAD.left + ((w - PAD.left - PAD.right) * i) / (n - 1)))
    const base = new Array(n).fill(0)
    opts.series.forEach((s, k) => {
      const lower = [...base]
      const upper = base.map((b, i) => b + opts.values[i][k])
      if (n === 1) {
        // One day: a single column instead of an area.
        svg.appendChild(svgEl('rect', { x: xs[0] - 12, width: 24, y: y(upper[0]), height: Math.max(0, y(lower[0]) - y(upper[0]) - (k > 0 ? 2 : 0)), fill: s.color }))
      } else {
        const top = xs.map((x, i) => `${x},${y(upper[i])}`)
        const bottom = xs.map((x, i) => `${x},${y(lower[i])}`).reverse()
        svg.appendChild(svgEl('polygon', { points: [...top, ...bottom].join(' '), fill: s.color, class: 'area' }))
      }
      upper.forEach((v, i) => (base[i] = v))
    })
    xLabels(svg, h, xs, opts.labels)
    crosshair(
      svg,
      w,
      h,
      xs,
      (i) =>
        `<b>${opts.tipTitle(i)}</b>` +
        [...opts.series]
          .map((s, k) => ({ s, v: opts.values[i][k] }))
          .reverse()
          .map(({ s, v }) => `<div><i style="background:${s.color}"></i>${s.label}<span>${v}</span></div>`)
          .join(''),
      tip,
      (i) => y(totals[i]),
    )
  }).root
}

/** One line over time with an optional reference line, e.g. average seconds per answer. */
export function lineChart(opts: {
  values: (number | null)[]
  labels: string[]
  color: string
  reference?: { value: number; label: string }
  fmt: (v: number) => string
  tip: (i: number) => string
  height?: number
  ariaLabel: string
}): HTMLElement {
  const h = opts.height ?? 180
  return frame(h, opts.ariaLabel, (svg, w, tip) => {
    const vals = opts.values.filter((v): v is number => v !== null)
    const max = Math.ceil(Math.max(opts.reference ? opts.reference.value * 2 : 1, Math.max(1, ...vals) + 0.5) / 4) * 4
    const y = gridY(svg, w, h, max, 4, opts.fmt)
    const n = opts.values.length
    const xs = opts.values.map((_, i) => (n === 1 ? (PAD.left + w - PAD.right) / 2 : PAD.left + ((w - PAD.left - PAD.right) * i) / (n - 1)))
    if (opts.reference) {
      const ry = y(opts.reference.value)
      svg.appendChild(svgEl('line', { x1: PAD.left, x2: w - PAD.right, y1: ry, y2: ry, class: 'ref' }))
      const t = svgEl('text', { x: PAD.left + 4, y: ry - 5, class: 'ref-label' })
      t.textContent = opts.reference.label
      svg.appendChild(t)
    }
    // Days without a time break the line rather than bridging it.
    let d = ''
    let pen = false
    opts.values.forEach((v, i) => {
      if (v === null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${xs[i]},${y(v)}`
      pen = true
    })
    svg.appendChild(svgEl('path', { d, stroke: opts.color, class: 'line' }))
    // End dot plus value label on the last point.
    for (let i = n - 1; i >= 0; i--) {
      const v = opts.values[i]
      if (v === null) continue
      svg.appendChild(svgEl('circle', { cx: xs[i], cy: y(v), r: 5, fill: opts.color, class: 'dot' }))
      const t = svgEl('text', { x: xs[i] - 8, y: y(v) - 10, class: 'value', 'text-anchor': 'end' })
      t.textContent = opts.fmt(v)
      svg.appendChild(t)
      break
    }
    xLabels(svg, h, xs, opts.labels)
    crosshair(svg, w, h, xs, opts.tip, tip, (i) => y(opts.values[i] ?? 0))
  }).root
}

/** Horizontal stacked bars, one per row, e.g. the ten facts of each table by status. */
export function stackedBars(opts: { rows: { label: string; values: number[] }[]; series: Series[]; max: number; ariaLabel: string }): HTMLElement {
  const rowH = 26
  const h = opts.rows.length * rowH + 8
  return frame(h, opts.ariaLabel, (svg, w, tip) => {
    const left = 64
    const right = 30
    const bw = w - left - right
    opts.rows.forEach((row, r) => {
      const cy = 4 + r * rowH + rowH / 2
      const t = svgEl('text', { x: left - 10, y: cy + 5, class: 'row-label', 'text-anchor': 'end' })
      t.textContent = row.label
      svg.appendChild(t)
      let x = left
      const total = row.values.reduce((a, b) => a + b, 0)
      row.values.forEach((v, k) => {
        if (v <= 0) return
        const segW = (bw * v) / opts.max
        const last = row.values.slice(k + 1).every((x2) => x2 <= 0)
        const rect = svgEl('rect', {
          x,
          y: cy - 9,
          width: Math.max(1, segW - (last ? 0 : 2)),
          height: 18,
          rx: last ? 4 : 0,
          fill: opts.series[k].color,
          class: 'seg',
        })
        const show = () => {
          tip.show(x + segW / 2, cy - 9, `<b>${row.label}</b><div><i style="background:${opts.series[k].color}"></i>${opts.series[k].label}<span>${v} van ${total}</span></div>`)
        }
        rect.addEventListener('pointerenter', show)
        rect.addEventListener('pointerdown', show)
        rect.addEventListener('pointerleave', () => tip.hide())
        svg.appendChild(rect)
        x += segW
      })
    })
  }).root
}

/** Dots per attempt (seconds up, attempt along), coloured by how it went, with a reference line. */
export function attemptPlot(opts: {
  points: { rt: number; series: number; tip: string }[]
  series: Series[]
  reference: { value: number; label: string }
  fmt: (v: number) => string
  ariaLabel: string
}): HTMLElement {
  const h = 170
  return frame(h, opts.ariaLabel, (svg, w, tip) => {
    const max = Math.ceil(Math.max(opts.reference.value * 2, Math.max(1, ...opts.points.map((p) => Math.min(p.rt, 15))) + 0.5) / 4) * 4
    const y = gridY(svg, w, h, max, 4, opts.fmt)
    const ry = y(opts.reference.value)
    svg.appendChild(svgEl('line', { x1: PAD.left, x2: w - PAD.right, y1: ry, y2: ry, class: 'ref' }))
    const label = svgEl('text', { x: PAD.left + 4, y: ry - 5, class: 'ref-label' })
    label.textContent = opts.reference.label
    svg.appendChild(label)
    const n = opts.points.length
    const xs = opts.points.map((_, i) => (n === 1 ? (PAD.left + w - PAD.right) / 2 : PAD.left + 8 + ((w - PAD.left - PAD.right - 16) * i) / (n - 1)))
    opts.points.forEach((p, i) => {
      const cy = y(Math.min(p.rt, max))
      const ser = opts.series[p.series]
      const dot = ser.hollow
        ? svgEl('circle', { cx: xs[i], cy, r: 4.5, fill: 'var(--card)', stroke: ser.color, 'stroke-width': 2.5 })
        : svgEl('circle', { cx: xs[i], cy, r: 5, fill: ser.color, class: 'dot' })
      const hit = svgEl('circle', { cx: xs[i], cy, r: 14, fill: 'transparent' })
      const show = () => tip.show(xs[i], cy, p.tip)
      hit.addEventListener('pointerenter', show)
      hit.addEventListener('pointerdown', show)
      hit.addEventListener('pointerleave', () => tip.hide())
      svg.append(dot, hit)
    })
    const first = svgEl('text', { x: PAD.left, y: h - 6, class: 'tick' })
    first.textContent = 'eerste keer'
    const last = svgEl('text', { x: w - PAD.right, y: h - 6, class: 'tick', 'text-anchor': 'end' })
    last.textContent = 'laatste keer'
    svg.append(first, last)
  }).root
}
