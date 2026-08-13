import type { CSSProperties, ReactNode } from 'react'
import { Card } from '@/components/shadcn/card'

interface Props {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** reveal-on-mount animation; pass a delay class like "d1".."d5" */
  reveal?: boolean
  delay?: '' | 'd1' | 'd2' | 'd3' | 'd4' | 'd5'
}

/**
 * The standard raised surface: cards, tables, panels.
 *
 * Named Glass for historical reasons. It has been an opaque white card since the
 * light move; renaming it would touch 50 call sites for no behavioural gain.
 *
 * Built on shadcn's Card, which is why this wrapper is worth having: one edit
 * here reaches every one of those call sites. The `.glass` rules are unlayered
 * so they still win on background, border, radius and shadow; Card contributes
 * the element and its slot attributes.
 */
export default function Glass({ children, className = '', style, reveal, delay = '' }: Props) {
  return (
    <Card className={`glass ${reveal ? `rv in ${delay}` : ''} ${className}`} style={style}>
      {children}
    </Card>
  )
}
