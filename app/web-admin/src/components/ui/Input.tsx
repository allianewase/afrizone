import { forwardRef, type ComponentProps } from 'react'
import { Input as ShadcnInput } from '@/components/shadcn/input'
import { cn } from '@/lib/utils'

/**
 * shadcn Input at Afrizone's sizing.
 *
 * The override is not cosmetic: stock shadcn is h-9 (36px), below the 44px
 * minimum touch target DESIGN_SPEC 7 requires. Keeping that in one adapter
 * rather than at 20 call sites means it cannot drift.
 */
const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <ShadcnInput
      ref={ref}
      className={cn(
        'h-11 rounded-[var(--r-sm)] bg-[var(--surface)] px-[14px] text-[14px] shadow-none',
        'focus-visible:border-[var(--clay-deep)]',
        className,
      )}
      {...props}
    />
  )
})

export default Input
