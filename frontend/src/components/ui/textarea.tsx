import { cn } from '../../lib/utils'
import { type TextareaHTMLAttributes, forwardRef } from 'react'

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[60px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_2px_oklch(0.2_0.03_264/0.07)] transition-colors placeholder:text-muted-foreground/70 focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-[inset_0_1px_2px_oklch(0.1_0.02_262/0.45)]',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'
export { Textarea }
