"use client";

import { useEffect } from "react";

const RING_EVERY_MS = 3000;
const VIBRATE_PATTERN = [400, 200, 400];

/** One soft sine note with a gentle fade in and out. */
function chime(ctx: AudioContext, frequency: number, start: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.18, start + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.65);
}

/**
 * Plays a soft two-tone ringtone (generated, no audio file) and vibrates the
 * phone where supported, while `active` is true. If the browser blocks audio
 * until the user interacts, it stays silent and starts on the first tap.
 */
export function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext | null = null;
    try {
      ctx = AudioCtx ? new AudioCtx() : null;
    } catch {
      ctx = null;
    }

    let stopped = false;
    const ring = () => {
      if (stopped) return;
      if (ctx && ctx.state === "running") {
        const t = ctx.currentTime + 0.05;
        chime(ctx, 659.25, t); // E5
        chime(ctx, 523.25, t + 0.45); // C5
        chime(ctx, 659.25, t + 1.1);
        chime(ctx, 523.25, t + 1.55);
      }
      if ("vibrate" in navigator) navigator.vibrate(VIBRATE_PATTERN);
    };

    const unlock = () => {
      ctx?.resume().catch(() => {});
    };
    // Ring now (vibration at least). If audio is still locked, try to unlock it and
    // play the chime once that works, without playing it twice when it already runs.
    const wasRunning = ctx?.state === "running";
    ring();
    if (ctx && !wasRunning) ctx.resume().then(ring, () => {});
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const timer = window.setInterval(ring, RING_EVERY_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      if ("vibrate" in navigator) navigator.vibrate(0);
      ctx?.close().catch(() => {});
    };
  }, [active]);
}
