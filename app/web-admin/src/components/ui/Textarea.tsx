import { forwardRef, type ComponentProps } from 'react'
import { Textarea as ShadcnTextarea } from '@/components/shadcn/textarea'
import { cn } from '@/lib/utils'

/** shadcn Textarea at Afrizone's sizing. See Input.tsx for why the adapter exists. */
const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <ShadcnTextarea
      ref={ref}
      className={cn(
        'min-h-[88px] rounded-[var(--r-sm)] bg-[var(--surface)] px-[14px] py-[11px] text-[14px] shadow-none',
        'focus-visible:border-[var(--clay-deep)]',
        className,
      )}
      {...props}
    />
  )
})

export default Textarea
