import * as React from 'react'
import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  ParticleTextEffect: canvas decorativo donde partículas forman palabras.    */
/*  Adaptado a producción: contenido (sin min-h-screen), responsive, colores   */
/*  de marca, sin textos demo y respetando prefers-reduced-motion.             */
/* -------------------------------------------------------------------------- */

interface ParticleTextEffectProps {
  words?: string[]
  className?: string
  canvasClassName?: string
  /** Alto de respaldo en px CSS si el contenedor no define altura propia. */
  height?: number
  /** Tamaño máximo de fuente; se reduce solo según ancho y largo de palabra. */
  fontSize?: number
  particleColorMode?: 'brand' | 'random'
  /** Frames que se muestra cada palabra antes de pasar a la siguiente. */
  autoAdvanceFrames?: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  r: number
  maxR: number
  color: string
  alive: boolean
}

/** Paleta Sendwary: morado, fucsia/lila, violeta claro y blanco suave. */
const BRAND_COLORS = [
  { r: 168, g: 85, b: 247 },
  { r: 217, g: 70, b: 239 },
  { r: 196, g: 181, b: 253 },
  { r: 245, g: 243, b: 255 },
]

const MAX_PARTICLES = 1600
const MOUSE_RADIUS = 70

function pickColor(mode: 'brand' | 'random'): string {
  if (mode === 'random') {
    return `rgb(${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},${(Math.random() * 255) | 0})`
  }
  const c = BRAND_COLORS[(Math.random() * BRAND_COLORS.length) | 0]
  return `rgb(${c.r},${c.g},${c.b})`
}

/** Dibuja la palabra en un canvas offscreen y devuelve los puntos con tinta. */
function sampleWord(word: string, width: number, height: number, fontSize: number) {
  const off = document.createElement('canvas')
  off.width = Math.max(1, width)
  off.height = Math.max(1, height)
  const ctx = off.getContext('2d')
  if (!ctx) return []

  const calculatedFontSize = Math.min(fontSize, width / Math.max(word.length * 0.65, 6))
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${calculatedFontSize}px Inter, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(word, width / 2, height / 2)

  const data = ctx.getImageData(0, 0, off.width, off.height).data
  const gap = Math.max(3, Math.round(calculatedFontSize / 22))
  const points: { x: number; y: number }[] = []
  for (let y = 0; y < off.height; y += gap) {
    for (let x = 0; x < off.width; x += gap) {
      if (data[(y * off.width + x) * 4 + 3] > 128) points.push({ x, y })
    }
  }
  // Limita la cantidad de partículas para no penalizar el hero.
  if (points.length > MAX_PARTICLES) {
    const step = points.length / MAX_PARTICLES
    const reduced: { x: number; y: number }[] = []
    for (let i = 0; i < points.length; i += step) reduced.push(points[Math.floor(i)])
    return reduced
  }
  return points
}

export function ParticleTextEffect({
  words = ['SENDWARY'],
  className,
  canvasClassName,
  height = 220,
  fontSize = 100,
  particleColorMode = 'brand',
  autoAdvanceFrames = 240,
}: ParticleTextEffectProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const animationRef = React.useRef<number | null>(null)
  // Las palabras se tratan como estáticas: cambiarlas tras el montaje no
  // reinicia la animación (evita re-crear el sistema de partículas).
  const wordsRef = React.useRef(words)

  React.useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const finePointer = window.matchMedia('(pointer: fine)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const wordList = wordsRef.current.length > 0 ? wordsRef.current : ['SENDWARY']
    let particles: Particle[] = []
    let wordIndex = 0
    let frame = 0
    let cssW = 0
    let cssH = height
    const mouse = { x: -9999, y: -9999 }

    const setCanvasSize = () => {
      cssW = Math.max(1, container.clientWidth + 100)
      cssH = Math.max(1, container.clientHeight || height)
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const assignWord = (word: string) => {
      const targets = sampleWord(word, cssW, cssH, fontSize)
      const count = Math.max(targets.length, particles.length)
      for (let i = 0; i < count; i++) {
        const target = targets[i]
        let p = particles[i]
        if (!p) {
          p = {
            x: Math.random() * cssW,
            y: Math.random() * cssH,
            vx: 0,
            vy: 0,
            tx: 0,
            ty: 0,
            r: 0,
            maxR: 1 + Math.random() * 1.4,
            color: pickColor(particleColorMode),
            alive: true,
          }
          particles.push(p)
        }
        if (target) {
          p.tx = target.x
          p.ty = target.y
          p.alive = true
        } else {
          p.alive = false
        }
      }
    }

    const drawStatic = () => {
      ctx.clearRect(0, 0, cssW, cssH)
      const targets = sampleWord(wordList[0], cssW, cssH, fontSize)
      for (const t of targets) {
        ctx.fillStyle = pickColor(particleColorMode)
        ctx.beginPath()
        ctx.arc(t.x, t.y, 1.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const update = () => {
      ctx.clearRect(0, 0, cssW, cssH)

      for (const p of particles) {
        // Resorte hacia el objetivo con amortiguación.
        p.vx += (p.tx - p.x) * 0.045
        p.vy += (p.ty - p.y) * 0.045
        // Repulsión del cursor (solo escritorio con puntero fino).
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.hypot(dx, dy)
        if (dist < MOUSE_RADIUS && dist > 0.01) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS
          p.vx += (dx / dist) * force * 4
          p.vy += (dy / dist) * force * 4
        }
        p.vx *= 0.86
        p.vy *= 0.86
        p.x += p.vx
        p.y += p.vy
        p.r += ((p.alive ? p.maxR : 0) - p.r) * 0.1

        if (p.r > 0.05) {
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      particles = particles.filter((p) => p.alive || p.r > 0.05)

      frame++
      if (frame >= autoAdvanceFrames) {
        frame = 0
        wordIndex = (wordIndex + 1) % wordList.length
        assignWord(wordList[wordIndex])
      }
      animationRef.current = requestAnimationFrame(update)
    }

    setCanvasSize()
    if (reducedMotion) {
      drawStatic()
    } else {
      assignWord(wordList[wordIndex])
      animationRef.current = requestAnimationFrame(update)
    }

    const resizeObserver = new ResizeObserver(() => {
      const prevW = cssW
      setCanvasSize()
      if (reducedMotion) {
        drawStatic()
      } else if (Math.abs(prevW - cssW) > 1) {
        assignWord(wordList[wordIndex])
      }
    })
    resizeObserver.observe(container)

    // El canvas es pointer-events-none para no bloquear el hero; la
    // interacción se sigue desde window y se mapea al rect del canvas.
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
    }
    if (finePointer && !reducedMotion) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
    }

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, fontSize, particleColorMode, autoAdvanceFrames])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn('pointer-events-none relative w-full overflow-hidden', className)}
    >
      <canvas ref={canvasRef} className={cn('h-full w-full', canvasClassName)} />
    </div>
  )
}
