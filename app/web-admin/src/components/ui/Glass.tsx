import type { CSSProperties, ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** reveal-on-mount animation; pass a delay class like "d1".."d5" */
  reveal?: boolean
  delay?: '' | 'd1' | 'd2' | 'd3' | 'd4' | 'd5'
}

/** Frosted-glass surface used everywhere (cards, tables, panels). */
export default function Glass({ children, className = '', style, reveal, delay = '' }: Props) {
  return (
    <div className={`glass ${reveal ? `rv in ${delay}` : ''} ${className}`} style={style}>
      {children}
    </div>
  )
}
