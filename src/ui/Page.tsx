import type { ReactNode } from 'react';
import './Page.css';

interface PageProps {
  readonly title: string;
  /** A short line above the title: the event name, a day, a division. */
  readonly kicker?: string;
  readonly children: ReactNode;
}

/**
 * Every screen is a Page: one h1, then its content. The h1 is what the router
 * moves focus to on navigation, so a screen reader announces where you landed.
 */
export function Page({ title, kicker, children }: PageProps) {
  return (
    <article className="page">
      <header className="page__header">
        {kicker ? <p className="page__kicker">{kicker}</p> : null}
        <h1 className="page__title" tabIndex={-1} data-route-heading>
          {title}
        </h1>
      </header>
      <div className="page__body">{children}</div>
    </article>
  );
}
