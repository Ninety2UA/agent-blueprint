import { cn } from "@/lib/utils";
import { EveMark, Mark } from "./mark";

export const SITE_URL = "https://agent-blueprint.dbenger.com/";

// The chat shell's lockup in the top bar (the approved mock's title block shell): the mark, which
// fills in path order on load, the name, and beneath it the credit "Hosted on" with Eve's mark,
// named for a screen reader, as on the gate page.
// It links to the product site.
export function Lockup({ className }: { readonly className?: string }) {
  return (
    <a
      className={cn("grid grid-cols-[auto_1fr] items-center gap-x-3 no-underline", className)}
      href={SITE_URL}
    >
      <Mark className="size-[26px]" draw />
      <span className="min-w-0">
        <span className="block text-[1.0625rem] leading-[1.2] font-[640] tracking-[-0.01em] whitespace-nowrap text-foreground [font-stretch:112%]">
          Agent Blueprint
        </span>
        <span className="mt-[3px] flex items-center gap-[5px] text-[0.8125rem] leading-[1.2] text-muted-foreground">
          Hosted on
          <EveMark className="mt-px h-[9px] w-[26px] shrink-0 text-foreground" />
          <span className="sr-only">Eve</span>
        </span>
      </span>
    </a>
  );
}
