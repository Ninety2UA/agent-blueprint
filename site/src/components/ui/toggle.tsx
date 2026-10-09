import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Restyled to 2A's filter chip (.chip): a hairline box that fills with ink when pressed.
// A count inside it goes in <span class="n">, styled with the chips in global.css.
const toggleVariants = cva(
  "group/toggle inline-flex cursor-pointer items-center justify-center gap-2 rounded-none border text-sm font-[540] whitespace-nowrap text-[var(--ink-2)] transition-colors hover:border-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-input bg-transparent",
        outline: "border-input bg-transparent",
      },
      size: {
        default: "h-[34px] px-3",
        sm: "h-8 px-2.5",
        lg: "h-10 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
