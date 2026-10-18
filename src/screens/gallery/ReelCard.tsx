import { useEffect, useState } from 'react';
import type { GalleryRow } from '../../data/gallery';
import { useMyEntry } from '../../data/myEntry';
import { useEventDates } from '../../data/selectors';
import { useSync, useSyncEngine } from '../../data/useSync';
import { reelFileExt, reelFileName, reelOrder, reelPlan } from '../../domain/reel';
import { dateRangeText } from '../../domain/time';
import { Card } from '../../ui/Card';
import { buildReel, reelSupported } from './reel';

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working'; readonly message: string }
  | {
      readonly kind: 'done';
      readonly href: string;
      readonly file: string;
      readonly kb: number;
      readonly seconds: number;
    }
  | { readonly kind: 'failed'; readonly message: string };

function download(href: string, file: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = file;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}

/**
 * The old app's highlight reel: your own approved fish, biggest first, made
 * into a short vertical video on this phone. Nobody else's fish ever go in.
 */
export function ReelCard({ rows }: { readonly rows: readonly GalleryRow[] }) {
  const sync = useSyncEngine();
  const event = useSync((s) => s.event);
  const dates = useEventDates(event);
  const myEntry = useMyEntry();
  const [supported] = useState(reelSupported);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  // A finished reel holds the whole video in memory; let it go when replaced.
  useEffect(() => {
    if (phase.kind !== 'done') return;
    const { href } = phase;
    return () => {
      URL.revokeObjectURL(href);
    };
  }, [phase]);

  const shots = reelOrder(rows);
  // Nothing of your own on the board yet: no card, rather than a button that cannot work.
  if (shots.length === 0) return null;
  const plan = reelPlan(shots);
  const seconds = Math.round(plan.totalMs / 1000);
  // "an 8-second video", "a 12-second video"
  const article = String(seconds).startsWith('8') || seconds === 11 || seconds === 18 ? 'an' : 'a';
  const handle = myEntry?.me.angler.handle ?? shots[0]?.handle ?? '';

  async function make() {
    setPhase({ kind: 'working', message: 'Starting…' });
    try {
      const reel = await buildReel(
        shots,
        { eventName: event?.name ?? '', dateText: dateRangeText(dates), handle },
        (path) => sync.photoUrl(path),
        (message) => {
          setPhase({ kind: 'working', message });
        },
      );
      setPhase({
        kind: 'done',
        href: URL.createObjectURL(reel.blob),
        file: reelFileName(event?.entry_prefix ?? '', dates, handle, reelFileExt(reel.mime)),
        kb: Math.round(reel.blob.size / 1024),
        seconds: Math.round(reel.plan.totalMs / 1000),
      });
    } catch (error) {
      setPhase({
        kind: 'failed',
        message:
          error instanceof Error && error.message
            ? error.message
            : 'That did not work. Try again with signal.',
      });
    }
  }

  const working = phase.kind === 'working';
  return (
    <Card title="Highlight reel">
      <p className="hint">
        {supported
          ? `Your ${plan.shots === 1 ? 'fish' : `${String(plan.shots)} best fish`}, biggest first, as ${article} ${String(seconds)}-second vertical video to post. ${plan.dropped > 0 ? `Your other ${String(plan.dropped)} stay off it so it does not run long. ` : ''}Yours only: nobody else’s fish go into a file you are about to put online.`
          : 'This browser cannot record video. Safari on iPhone and Chrome on Android both can: open the app there and the button works.'}
      </p>
      <button
        className="button button--secondary"
        type="button"
        disabled={!supported || working}
        onClick={() => {
          void make();
        }}
      >
        {working ? 'Working…' : 'Make my highlight reel'}
      </button>
      {phase.kind === 'working' ? (
        <p className="hint" role="status">
          {phase.message}
        </p>
      ) : null}
      {phase.kind === 'failed' ? (
        <p className="err" role="alert">
          {phase.message}
        </p>
      ) : null}
      {phase.kind === 'done' ? (
        <>
          <p className="ok" role="status">
            Done: {phase.kb} KB, {phase.seconds} seconds.
          </p>
          {/* No sound, so nothing to caption. */}
          <video
            className="reel__video"
            src={phase.href}
            controls
            muted
            playsInline
            aria-label="Your highlight reel"
          />
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              download(phase.href, phase.file);
            }}
          >
            Download
          </button>
          <p className="hint">
            On an iPhone, press and hold the video and choose Save to Photos if Download opens it
            instead of saving it.
          </p>
        </>
      ) : null}
    </Card>
  );
}
