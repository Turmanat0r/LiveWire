import { useEffect, useRef } from 'react';

/**
 * After a navigation, move focus to the new page's heading and name the page
 * in the tab title. Without it a screen reader stays on the link that was
 * pressed and never hears that the page changed. The first render is left
 * alone, so opening the app does not jump focus anywhere.
 */
export function useRouteFocus(pathname: string): void {
  const first = useRef(true);
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('[data-route-heading]');
    const name = heading?.textContent ?? '';
    document.title = name && name !== 'LiveWire' ? `${name} · LiveWire` : 'LiveWire';
    if (first.current) {
      first.current = false;
      return;
    }
    heading?.focus();
  }, [pathname]);
}
