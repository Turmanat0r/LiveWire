import { useCallback, useState } from 'react';
import type { PhotoSource, StampInput } from '../../domain/capture';
import { useAutoCapture, useCamera } from '../../photo/camera';
import { preparePhoto, type CapturedPhoto } from '../../photo/capture';
import { BoardGuide, PoseRules } from './BoardGuide';

interface ViewfinderProps {
  readonly species: string;
  /** "Team TQ7M", "ID 7K4M": checked against the board while the fish is still on it. */
  readonly codes: readonly { readonly label: string; readonly code: string }[];
  readonly stampFor: (source: PhotoSource) => StampInput;
  readonly photo: CapturedPhoto | null;
  readonly onPhoto: (photo: CapturedPhoto | null) => void;
}

/**
 * The in-app camera: the pose guide over the live picture, auto-capture once
 * the shot is steady, sharp and lit, and the photo stamped the moment the
 * shutter fires. The camera roll is the fallback, below it on the screen.
 */
export function Viewfinder({ species, codes, stampFor, photo, onPhoto }: ViewfinderProps) {
  const { videoRef, state, start, stop } = useCamera();
  const [auto, setAuto] = useState(true);
  const [shooting, setShooting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const live = state === 'live';

  const shoot = useCallback(async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || shooting) return;
    setShooting(true);
    try {
      onPhoto(await preparePhoto(video, stampFor('camera')));
      stop();
    } catch {
      setProblem('The photo could not be saved. Try again, or choose one you already took.');
    } finally {
      setShooting(false);
    }
  }, [videoRef, shooting, onPhoto, stampFor, stop]);

  const status = useAutoCapture(videoRef, live && !shooting, auto, () => void shoot());

  function open() {
    setProblem(null);
    void start();
  }

  return (
    <div className="field viewfinder">
      <p className="field__label">Photo on bump board</p>
      {live ? (
        <div className="vf">
          <video ref={videoRef} className="vf__video" autoPlay playsInline muted />
          <BoardGuide species={species} />
          <p className={`vf__auto vf__auto--${status.ready ? 'ready' : 'hold'}`}>
            <span className="vf__dot" aria-hidden="true" />
            {status.text}
          </p>
          {status.count ? (
            <p className="vf__count" aria-live="assertive">
              <span>{status.count}</span>
            </p>
          ) : null}
          {codes.length > 0 ? (
            <p className="vf__codes">
              {codes.map(({ label, code }) => (
                <span key={label}>
                  {label} <b>{code}</b>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : photo ? (
        <div className="vf-preview">
          <img src={photo.url} alt="Your catch photo, with its stamp" />
          <button className="vf-preview__retake" type="button" onClick={open}>
            Retake
          </button>
        </div>
      ) : (
        // Before the camera opens: how the fish should look in the photo.
        <div className="vf vf--idle">
          <BoardGuide species={species} />
        </div>
      )}
      {live ? (
        <>
          <div className="actions vf-controls">
            <button className="button button--secondary" type="button" onClick={stop}>
              Cancel
            </button>
            <button
              className="button"
              type="button"
              disabled={shooting}
              onClick={() => void shoot()}
            >
              {shooting ? 'Saving…' : 'Capture'}
            </button>
          </div>
          <label className="tick vf-auto-toggle">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked);
              }}
            />
            Auto-capture when the shot is steady, sharp and well lit
          </label>
        </>
      ) : (
        <button
          className="button button--secondary"
          type="button"
          disabled={state === 'starting'}
          onClick={open}
        >
          {state === 'starting' ? 'Opening camera…' : photo ? 'Take another photo' : 'Open camera'}
        </button>
      )}
      {photo && !live ? null : <PoseRules />}
      {state === 'unavailable' ? (
        <p className="err" role="alert">
          The camera is unavailable or permission was refused. Choose a photo you already took,
          below.
        </p>
      ) : null}
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
