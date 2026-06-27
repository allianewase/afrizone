import type { ReactNode } from 'react'
import Icon, { type IconName } from '../Icon'
import Button from './Button'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="statebox" role="status" aria-live="polite">
      <div className="spinner" />
      <span className="sub">{label}</span>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="statebox" role="alert">
      <span className="ic" style={{ color: 'var(--danger)' }}>
        <Icon name="alert" />
      </span>
      <b>Something went wrong</b>
      <span className="sub">{message}</span>
      {onRetry && (
        <Button variant="glass" size="sm" icon="arrow-right" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  icon = 'inbox',
  title,
  sub,
  action,
}: {
  icon?: IconName
  title: string
  sub?: string
  action?: ReactNode
}) {
  return (
    <div className="statebox">
      <span className="ic" style={{ color: 'var(--gold)' }}>
        <Icon name={icon} />
      </span>
      <b>{title}</b>
      {sub && <span className="sub">{sub}</span>}
      {action}
    </div>
  )
}
