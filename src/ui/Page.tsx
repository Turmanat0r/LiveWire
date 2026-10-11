import type { ReactNode } from 'react';
import { Link } from 'react-router';
import './Card.css';
import './Page.css';

interface PageProps {
  readonly title: string;
  /**
   * The old register screen's header: a kicker and a line of detail around a
   * large title, with the screen's cards below it. Without one, the title
   * heads the screen's single card.
   */
  readonly hero?: { readonly kicker?: string | undefined; readonly meta?: string | undefined };
  readonly children: ReactNode;
}

/**
 * Every screen but home, as the old app laid them out: a way back home, then
 * the title. The title is the page's one h1, which the router moves focus to
 * on navigation, so a screen reader announces where you landed.
 */
export function Page({ title, hero, children }: PageProps) {
  const heading = (
    <h1 className="page__title" tabIndex={-1} data-route-heading>
      {title}
    </h1>
  );
  return (
    <article className="page">
      <Link className="backlink" to="/">
        <span aria-hidden="true">←</span> Home
      </Link>
      {hero ? (
        <>
          <header className="page-hero">
            {hero.kicker ? <p className="page-hero__kicker">{hero.kicker}</p> : null}
            {heading}
            {hero.meta ? <p className="page-hero__meta">{hero.meta}</p> : null}
          </header>
          {children}
        </>
      ) : (
        <div className="card">
          <div className="card__title">{heading}</div>
          {children}
        </div>
      )}
    </article>
  );
}
