import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/** Animate a number from 0 -> target on mount (respecting reduced-motion). */
export function useCountUp(target: number, decimals = 0, durationMs = 900): number {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0)
  const raf = useRef<number>()

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const factor = Math.pow(10, decimals)
      setValue(Math.round(target * eased * factor) / factor)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [target, decimals, durationMs])

  return value
}
