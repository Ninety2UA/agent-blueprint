import { useEffect, useRef, useState } from 'react';

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Icon } from './Icon';
import type { NavItem } from './nav';
import { requestSearch } from './search-event';

interface Props {
  items: NavItem[];
  getStarted: string;
  repoUrl: string;
}

// The header's menu below 960 px: the same nav list, Get started, GitHub and Search,
// in a modal sheet that drops from under the header. Rendered with client:interaction,
// so React loads only when someone reaches for the menu button. Base UI traps focus,
// closes on Escape or a press outside, and returns focus to the button.
export default function MobileMenu({ items, getStarted, repoUrl }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchAfterClose = useRef(false);

  // the menu belongs to the narrow header; close it when the window widens past it
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia('(min-width: 961px)');
    const onChange = () => wide.matches && setOpen(false);
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, [open]);

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        // open the palette only once the sheet has let go of focus
        if (!isOpen && searchAfterClose.current) {
          searchAfterClose.current = false;
          requestSearch(trigger.current);
        }
      }}
    >
      <SheetTrigger ref={trigger} className="icon-btn menu-btn" aria-label={open ? 'Close menu' : 'Open menu'}>
        <Icon name={open ? 'x' : 'menu'} />
      </SheetTrigger>
      <SheetContent side="top" showCloseButton={false} className="mobile-menu" overlayClassName="mm-scrim">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <nav aria-label="Main">
          <ul>
            {items.map((item) => (
              <li key={item.href}>
                <a href={item.href} aria-current={item.current} onClick={() => setOpen(false)}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mm-actions">
          <a className="btn btn-primary" href={getStarted}>Get started</a>
          <a className="btn btn-ghost" href={repoUrl}>
            <Icon name="github" />
            GitHub
          </a>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              searchAfterClose.current = true;
              setOpen(false);
            }}
          >
            <Icon name="search" />
            Search
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
