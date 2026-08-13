import { Switch as ShadcnSwitch } from '@/components/shadcn/switch'
import { cn } from '@/lib/utils'

interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  /** Required: the switch carries no visible text of its own. */
  label: string
  className?: string
}

/**
 * shadcn Switch behind the prop signature the hand-rolled Toggle used, so the
 * Settings call sites are unchanged.
 *
 * Sized to the 44px hit target from DESIGN_SPEC 7 via a padded wrapper rather
 * than by inflating the track, which would look wrong. Stock shadcn is 18x32px.
 * `on` state uses --money rather than the brand orange: this reads as
 * "enabled/active", not as a call to action.
 */
export default function Switch({ checked, onChange, disabled, label, className = '' }: Props) {
  return (
    <span className="inline-grid min-h-11 min-w-11 flex-none place-items-center">
      <ShadcnSwitch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        className={cn(
          'h-[25px] w-11 data-[state=checked]:bg-[var(--money)] data-[state=unchecked]:bg-[rgba(28,25,23,0.16)]',
          'data-[state=unchecked]:border data-[state=unchecked]:border-[var(--line-2)]',
          '[&>span]:size-[19px] [&>span]:data-[state=checked]:translate-x-[19px]',
          className,
        )}
      />
    </span>
  )
}
