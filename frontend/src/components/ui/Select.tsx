import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export type SelectOption = { value: string; label: string }

export type ThemedSelectProps = {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
}: ThemedSelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border/70 bg-card/90 px-3 py-2 text-left text-sm text-foreground shadow-sm backdrop-blur-md',
          'ring-offset-background transition-[color,background-color,border-color,box-shadow]',
          'hover:border-primary/35 hover:bg-card',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[placeholder]:text-muted-foreground',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-[100] max-h-[min(22rem,var(--radix-select-content-available-height))] overflow-hidden rounded-xl border border-border/80 bg-card/95 text-foreground shadow-xl backdrop-blur-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1',
          )}
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className={cn(
                  'relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-2 text-sm outline-none',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                  'data-[highlighted]:bg-primary/12 data-[highlighted]:text-foreground',
                )}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4 text-primary" strokeWidth={2.5} aria-hidden />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
