import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { screen } from '../../app/screens';
import { photoFileName, useGallery, type GalleryRow } from '../../data/gallery';
import { useSync, useSyncEngine } from '../../data/useSync';
import { Page } from '../../ui/Page';
import { CatchPhoto, PhotoViewer } from '../../ui/PhotoViewer';
import { inchesText } from '../board/StandingsScreen';
import './gallery.css';

/**
 * A tile's photo, asked for only once the tile is near the screen: a wall of
 * forty fish should not ask the server for forty addresses before anyone
 * scrolls.
 */
function TilePhoto({ path }: { readonly path: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    const watch = new IntersectionObserver(
      (seen) => {
        if (seen.some((e) => e.isIntersecting)) {
          setNear(true);
          watch.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    watch.observe(el);
    return () => {
      watch.disconnect();
    };
  }, [near]);
  return (
    <span ref={box} className="gallery-tile__photo">
      {near ? <CatchPhoto path={path} alt="" className="gallery-tile__img" /> : null}
    </span>
  );
}

type Saving = { readonly id: string; readonly state: 'saving' | 'saved' | 'failed' } | null;

/**
 * The old app's fish gallery: every approved fish, yours first. Tapping one
 * opens it full screen, and the phone's Back button closes it again. Your own
 * fish can be saved to the phone; nobody else's can.
 */
export function GalleryScreen() {
  const sync = useSyncEngine();
  const event = useSync((s) => s.event);
  const rows = useGallery();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [saving, setSaving] = useState<Saving>(null);
  const open = params.get('photo');
  const mineCount = rows.filter((r) => r.mine).length;
  const items = rows.map((r) => ({
    id: r.id,
    title: `${r.handle} · ${inchesText(r.inches)} ${r.species}`,
    path: r.path,
    row: r,
  }));
  // Opened from a tile, the photo has a history entry of its own to go back past.
  const pushed = (location.state as { photo?: boolean } | null)?.photo === true;

  async function save(row: GalleryRow) {
    // Checked again here, not trusted from the button: only your own fish.
    if (!rows.some((r) => r.id === row.id && r.mine)) return;
    setSaving({ id: row.id, state: 'saving' });
    try {
      const res = await fetch(await sync.photoUrl(row.path));
      if (!res.ok) throw new Error(String(res.status));
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = href;
      a.download = photoFileName(event?.entry_prefix ?? '', row.species, row.inches);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => {
        URL.revokeObjectURL(href);
      }, 30_000);
      setSaving({ id: row.id, state: 'saved' });
    } catch {
      setSaving({ id: row.id, state: 'failed' });
    }
  }

  return (
    <Page title={screen('gallery').title}>
      <p className="hint">
        {rows.length === 0
          ? 'Nothing approved yet. Every fish the director approves shows up here.'
          : `${String(rows.length)} approved ${rows.length === 1 ? 'fish' : 'fish'}${mineCount > 0 ? ', yours first' : ''}. Tap one to see it full size.`}
      </p>
      {rows.length > 0 ? (
        <ul className="gallery-grid" aria-label="Approved fish">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                className={r.mine ? 'gallery-tile gallery-tile--mine' : 'gallery-tile'}
                type="button"
                aria-label={`${r.handle}, ${inchesText(r.inches)} ${r.species}${r.mine ? ', yours' : ''}`}
                onClick={() => {
                  setSaving(null);
                  setParams({ photo: r.id }, { state: { photo: true } });
                }}
              >
                <TilePhoto path={r.path} />
                {r.mine ? (
                  <span className="gallery-tile__mine" aria-hidden="true">
                    Yours
                  </span>
                ) : null}
                <span className="gallery-tile__cap" aria-hidden="true">
                  <span className="gallery-tile__who">{r.handle}</span>
                  <span className="gallery-tile__len">{inchesText(r.inches)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && items.some((i) => i.id === open) ? (
        <PhotoViewer
          items={items}
          id={open}
          onMove={(id) => {
            setSaving(null);
            setParams({ photo: id }, { replace: true, state: { photo: pushed } });
          }}
          onClose={() => {
            if (pushed) void navigate(-1);
            else setParams({}, { replace: true });
          }}
          actions={(item) => {
            if (!item.row.mine) return [];
            const here = saving?.id === item.id ? saving.state : null;
            return [
              {
                label:
                  here === 'saving'
                    ? 'Saving…'
                    : here === 'saved'
                      ? 'Saved'
                      : here === 'failed'
                        ? 'No signal for the photo'
                        : 'Save photo',
                className: 'button viewer__save',
                disabled: here === 'saving',
                onClick: () => {
                  void save(item.row);
                },
              },
            ];
          }}
        />
      ) : null}
    </Page>
  );
}
