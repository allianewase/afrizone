import { Badge } from '@/components/shadcn/badge'
import Icon, { type IconName } from '../Icon'
import type { PillVariant } from '../../lib/format'

const ICONS: Record<PillVariant, IconName> = {
  pending: 'clock',
  active: 'tasks',
  review: 'eye',
  ready: 'check',
  paid: 'card',
  danger: 'alert',
}

interface Props {
  variant: PillVariant
  label: string
  className?: string
}

/**
 * Status is never communicated by colour alone: always icon + word.
 *
 * On shadcn's Badge for vocabulary consistency. The `.pill` rules are unlayered
 * so they still win on colour, padding and radius; Badge contributes the element
 * and its focus/svg handling.
 */
export default function StatusPill({ variant, label, className = '' }: Props) {
  return (
    <Badge variant="outline" className={`pill ${variant} ${className}`}>
      <Icon name={ICONS[variant]} strokeWidth={2.2} />
      {label}
    </Badge>
  )
}
