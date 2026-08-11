import Icon, { type IconName } from '../Icon'
import { useCountUp } from '../../lib/useCountUp'
import './KpiCard.css'

interface Props {
  tone: 'k1' | 'k2' | 'k3' | 'k4'
  icon: IconName
  iconColor: string
  label: string
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  delta?: string
  deltaTone?: 'up' | 'down' | 'warn'
  delay?: 'd1' | 'd2' | 'd3' | ''
}

export default function KpiCard({
  tone,
  icon,
  iconColor,
  label,
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  delta,
  deltaTone = 'up',
  delay = '',
}: Props) {
  const animated = useCountUp(value, decimals)
  return (
    <div className={`glass kpi ${tone} rv in ${delay}`}>
      <div className="kh">
        <span className="kic">
          <Icon name={icon} style={{ color: iconColor }} />
        </span>
        <span className="kt">{label}</span>
      </div>
      <div className="kv tnum">
        {prefix}
        {animated.toFixed(decimals)}
        {suffix}
      </div>
      {delta && <div className={`kd ${deltaTone}`}>{delta}</div>}
    </div>
  )
}
