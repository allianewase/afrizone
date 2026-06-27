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

/** Status is never communicated by colour alone — always icon + word. */
export default function StatusPill({ variant, label, className = '' }: Props) {
  return (
    <span className={`pill ${variant} ${className}`}>
      <Icon name={ICONS[variant]} strokeWidth={2.2} />
      {label}
    </span>
  )
}
