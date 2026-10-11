import { useEffect, useState, type ReactNode } from 'react';
import { useSyncEngine } from '../../data/useSync';
import type { CatchStatus } from './catchRows';
import './catches.css';

const STATUS: Record<CatchStatus, string> = {
  waiting: 'Waiting to send',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Not accepted',
};

export function StatusBadge({ status }: { readonly status: CatchStatus }) {
  return <span className={`status status--${status}`}>{STATUS[status]}</span>;
}

/** 21.5″ */
export function lengthText(inches: number): string {
  return `${String(inches)}″`;
}

/**
 * A catch photo: from the server once it is there (a short-lived address, kept
 * by the offline cache once seen), or from the phone while it is still in the
 * outbox. With neither, a plain box that says so.
 */
export function PhotoThumb({
  path,
  itemId,
  alt,
}: {
  readonly path: string | null;
  readonly itemId: string | null;
  readonly alt: string;
}) {
  const sync = useSyncEngine();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let local: string | null = null;
    if (itemId) {
      void sync.readFile(itemId, 'photo').then((file) => {
        if (!alive || !file) return;
        local = URL.createObjectURL(new Blob([file.bytes], { type: file.type }));
        setUrl(local);
      });
    } else if (path) {
      sync.photoUrl(path).then(
        (signed) => {
          if (alive) setUrl(signed);
        },
        () => undefined,
      );
    }
    return () => {
      alive = false;
      if (local) URL.revokeObjectURL(local);
    };
  }, [sync, path, itemId]);
  return url ? (
    <img className="catch-card__photo" src={url} alt={alt} />
  ) : (
    <span className="catch-card__photo catch-card__photo--none">No signal for the photo</span>
  );
}

interface CatchCardProps {
  readonly photo: ReactNode;
  readonly lengthInches: number;
  readonly status: CatchStatus;
  readonly title: string;
  readonly best?: boolean;
  readonly children?: ReactNode;
}

export function CatchCard({ photo, lengthInches, status, title, best, children }: CatchCardProps) {
  return (
    <li className={best ? 'catch-card catch-card--best' : 'catch-card'}>
      {photo}
      <div className="catch-card__info">
        <p className="catch-card__top">
          <span className="catch-card__length">{lengthText(lengthInches)}</span>
          <StatusBadge status={status} />
        </p>
        <p className="catch-card__title">{title}</p>
        {children}
      </div>
    </li>
  );
}
