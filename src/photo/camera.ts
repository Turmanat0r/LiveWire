// The phone's back camera, live in the page, and auto-capture: it watches the
// frame and fires once the shot has been steady, sharp and well lit for long
// enough. Whether the fish is placed right is the guide's job, not this.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AUTO_CAPTURE, frameMotion, frameProblem, frameStats } from '../domain/capture';
import { greyscale } from './pixels';

export type CameraState = 'idle' | 'starting' | 'live' | 'unavailable';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('idle');

  const release = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    release();
    setState('starting');
    try {
      // Missing over plain http, and on a phone that refuses: the camera roll still works.
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      setState('live');
    } catch {
      setState('unavailable');
    }
  }, [release]);

  const stop = useCallback(() => {
    release();
    setState('idle');
  }, [release]);

  // The video element appears once the state is live; give it the stream then.
  useEffect(() => {
    const video = videoRef.current;
    if (state !== 'live' || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => undefined);
  }, [state]);

  useEffect(() => release, [release]);

  return { videoRef, state, start, stop };
}

export interface AutoCaptureStatus {
  readonly text: string;
  readonly ready: boolean;
  /** 3, 2, 1 before the shutter fires, or null. */
  readonly count: number | null;
}

const STARTING: AutoCaptureStatus = { text: 'Starting…', ready: false, count: null };

/** Watches the live frame while `active`; fires `onShoot` when armed and the shot is good. */
export function useAutoCapture(
  videoRef: RefObject<HTMLVideoElement | null>,
  active: boolean,
  armed: boolean,
  onShoot: () => void,
): AutoCaptureStatus {
  const [status, setStatus] = useState<AutoCaptureStatus>(STARTING);
  const shoot = useRef(onShoot);
  const isArmed = useRef(armed);
  useEffect(() => {
    shoot.current = onShoot;
    isArmed.current = armed;
  });

  useEffect(() => {
    if (!active) return;
    let previous: Float64Array | null = null;
    let streak = 0;
    let ticker: ReturnType<typeof setInterval> | null = null;
    const stopCountdown = () => {
      if (ticker) clearInterval(ticker);
      ticker = null;
    };
    const sampler = setInterval(() => {
      const video = videoRef.current;
      if (!video?.videoWidth) return;
      const grey = greyscale(video, 64, 64);
      const motion = previous ? frameMotion(grey, previous) : null;
      previous = grey;
      const problem = frameProblem(frameStats(grey, 64, 64), motion);
      if (problem) {
        streak = 0;
        stopCountdown();
        setStatus({ text: problem, ready: false, count: null });
        return;
      }
      streak += 1;
      if (!isArmed.current) {
        stopCountdown();
        setStatus({ text: 'Looks good: tap Capture', ready: true, count: null });
        return;
      }
      if (ticker || streak < AUTO_CAPTURE.stableSamples) {
        if (!ticker) setStatus({ text: 'Looks good', ready: true, count: null });
        return;
      }
      let count: number = AUTO_CAPTURE.countdown;
      setStatus({ text: 'Capturing…', ready: true, count });
      ticker = setInterval(() => {
        count -= 1;
        if (count <= 0) {
          stopCountdown();
          shoot.current();
        } else {
          setStatus({ text: 'Capturing…', ready: true, count });
        }
      }, 700);
    }, AUTO_CAPTURE.sampleMs);
    return () => {
      clearInterval(sampler);
      stopCountdown();
      setStatus(STARTING);
    };
  }, [active, videoRef]);

  return status;
}
