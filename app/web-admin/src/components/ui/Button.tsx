import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Icon, { type IconName } from '../Icon'

type Variant = 'primary' | 'glass' | 'money' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  icon?: IconName
  loading?: boolean
  children?: ReactNode
}

export default function Button({
  variant = 'glass',
  size = 'md',
  icon,
  loading,
  children,
  className = '',
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span
          className="spinner"
          style={{ width: 16, height: 16, borderWidth: 2 }}
          aria-hidden="true"
        />
      ) : (
        icon && <Icon name={icon} />
      )}
      {children}
    </button>
  )
}
