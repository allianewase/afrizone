import type { ReactNode } from 'react'

interface Props {
  crumb?: string
  title: string
  sub?: ReactNode
  actions?: ReactNode
}

export default function PageHeader({ crumb, title, sub, actions }: Props) {
  return (
    <div className="phead rv in">
      <div>
        {crumb && <div className="crumb">{crumb}</div>}
        <h1 style={{ marginTop: crumb ? 6 : 0 }}>{title}</h1>
        {sub && <div className="crumb">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}
