// A catch photo, and the full-screen viewer it opens in. Two screens use the
// viewer and they are not allowed to show the same things: the director's
// review puts the rulings under the photo, the gallery only the angler's
// handle and, on their own fish, a way to save it. What goes under the photo
// is passed in, so neither screen can leak into the other.
import { useEffect, useRef, useState } from 'react';
import { useSyncEngine } from '../data/useSync';
import './viewer.css';

/** A catch photo from the server, by a short-lived address. */
export function CatchPhoto({
  path,
  alt,
  large = false,
  className,
}: {
  readonly path: string;
  readonly alt: string;
  readonly large?: boolean;
  /** In place of the card's or the viewer's own look. */
  readonly className?: string;
}) {
  const sync = useSyncEngine();
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    // A new photo is a new component (see its key), so this starts empty.
    let alive = true;
    sync.photoUrl(path).then(
      (signed) => {
        if (alive) setUrl(signed);
      },
      () => {
        if (alive) setMissing(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [sync, path]);
  if (url) {
    return (
      <img
        className={className ?? (large ? 'viewer__img' : 'catch-card__photo')}
        src={url}
        alt={alt}
        onError={() => {
          setUrl(null);
          setMissing(true);
        }}
      />
    );
  }
  return (
    <span className={large ? 'viewer__empty' : 'catch-card__photo catch-card__photo--none'}>
      {missing
        ? large
          ? 'No photo reached the server for this catch. It may still be waiting on the angler’s phone.'
          : 'No photo'
        : 'Loading…'}
    </span>
  );
}

export interface ViewerItem {
  readonly id: string;
  readonly title: string;
  readonly path: string;
}

/** A button under the photo. */
export interface ViewerAction {
  readonly label: string;
  readonly className: string;
  readonly disabled?: boolean;
  /** Move on to the next photo afterwards, closing after the last: the director's rulings. */
  readonly advance?: boolean;
  readonly onClick: () => void;
}

/**
 * The photo, big, filling the screen. Tapping it switches between fitting the
 * screen and full size, and the arrows walk the list it was opened from.
 */
export function PhotoViewer<T extends ViewerItem>({
  items,
  id,
  onMove,
  onClose,
  actions,
}: {
  readonly items: readonly T[];
  readonly id: string;
  readonly onMove: (id: string) => void;
  readonly onClose: () => void;
  /** The buttons under the photo, if any. */
  readonly actions?: (item: T) => readonly ViewerAction[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const index = items.findIndex((i) => i.id === id);
  const item = items[index];

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  if (!item) return null;
  const prev = items[index - 1];
  const next = items[index + 1];
  const close = () => {
    dialog.current?.close();
  };

  return (
    <dialog
      ref={dialog}
      className={zoomed ? 'viewer viewer--zoomed' : 'viewer'}
      aria-label={item.title}
      onClose={onClose}
    >
      <div className="viewer__bar">
        <p className="viewer__title">{item.title}</p>
        {items.length > 1 ? (
          <p className="viewer__nav">
            <button
              className="button button--small"
              type="button"
              disabled={!prev}
              aria-label="Previous fish"
              onClick={() => {
                if (prev) onMove(prev.id);
              }}
            >
              ←
            </button>
            <span className="viewer__count">
              {index + 1} of {items.length}
            </span>
            <button
              className="button button--small"
              type="button"
              disabled={!next}
              aria-label="Next fish"
              onClick={() => {
                if (next) onMove(next.id);
              }}
            >
              →
            </button>
          </p>
        ) : null}
        <button className="button button--small" type="button" onClick={close}>
          Close
        </button>
      </div>
      <button
        className="viewer__stage"
        type="button"
        aria-label={zoomed ? 'Fit the photo to the screen' : 'Show the photo at full size'}
        onClick={() => {
          setZoomed((z) => !z);
        }}
      >
        <CatchPhoto key={item.id} path={item.path} alt={item.title} large />
      </button>
      <Actions
        list={actions ? actions(item) : []}
        onAdvance={() => {
          if (next) onMove(next.id);
          else close();
        }}
      />
    </dialog>
  );
}

function Actions({
  list,
  onAdvance,
}: {
  readonly list: readonly ViewerAction[];
  readonly onAdvance: () => void;
}) {
  if (list.length === 0) return null;
  return (
    <div className="viewer__actions">
      {list.map((a) => (
        <button
          key={a.label}
          className={a.className}
          type="button"
          disabled={a.disabled}
          onClick={() => {
            a.onClick();
            if (a.advance) onAdvance();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
