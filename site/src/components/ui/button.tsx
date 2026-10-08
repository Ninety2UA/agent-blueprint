import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Restyled to 2A's .btn and .icon-btn: square corners, no shadow, the red-orange only on
// the primary action, hairline borders on the quiet ones. Focus uses the site's outline.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2.5 rounded-none border border-transparent font-semibold whitespace-nowrap transition-colors select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--accent-press)]",
        outline: "border-input bg-transparent text-foreground hover:border-foreground aria-expanded:border-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:border-input aria-expanded:border-input",
        ghost: "bg-transparent text-foreground hover:border-input aria-expanded:border-input",
        destructive: "bg-destructive text-primary-foreground hover:bg-[var(--accent-strong)]",
        link: "text-foreground underline decoration-[var(--hair-strong)] underline-offset-4 hover:decoration-current",
      },
      size: {
        default: "h-11 px-[18px] text-[0.9375rem]",
        xs: "h-7 gap-1.5 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-2 px-3.5 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 px-5 text-base",
        icon: "size-10 [&_svg:not([class*='size-'])]:size-5",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-11 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
