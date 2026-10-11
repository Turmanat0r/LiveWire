import type { ReactNode } from 'react';
import { Link } from 'react-router';
import './Card.css';
import './Page.css';

interface PageProps {
  readonly title: string;
  readonly children: ReactNode;
}

/**
 * Every screen but home, as the old app laid them out: a way back home, then
 * a card headed by the screen's title. The title is the page's one h1, which
 * the router moves focus to on navigation, so a screen reader announces
 * where you landed.
 */
export function Page({ title, children }: PageProps) {
  return (
    <article className="page">
      <Link className="backlink" to="/">
        <span aria-hidden="true">←</span> Home
      </Link>
      <div className="card">
        <h1 className="card__title page__title" tabIndex={-1} data-route-heading>
          {title}
        </h1>
        {children}
      </div>
    </article>
  );
}
