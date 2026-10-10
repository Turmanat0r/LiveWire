import type { ReactNode } from 'react';
import './Card.css';

interface CardProps {
  readonly title?: string;
  readonly tone?: 'plain' | 'notice' | 'danger';
  readonly children: ReactNode;
}

export function Card({ title, tone = 'plain', children }: CardProps) {
  const className = tone === 'plain' ? 'card' : `card card--${tone}`;
  return (
    <section className={className}>
      {title ? <h2 className="card__title">{title}</h2> : null}
      {children}
    </section>
  );
}
