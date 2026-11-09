"use client";

import { useRef, useState } from "react";

/** A big, simple player for a partner's voice message, with its words written out below. */
export function VoiceMessagePlayer({
  partnerName,
  text,
  audioSrc,
}: {
  partnerName: string;
  text: string;
  audioSrc: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  return (
    <div className="card flex flex-col gap-5">
      <h2 className="text-2xl font-bold">🎙️ Voice message from {partnerName}</h2>
      {audioSrc ? (
        <>
          <audio
            ref={audioRef}
            src={audioSrc}
            preload="auto"
            onPlay={() => {
              setPlaying(true);
              setFinished(false);
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setFinished(true);
            }}
          />
          <button type="button" onClick={toggle} className="btn-primary min-h-20 w-full text-2xl">
            {playing ? "⏸ Pause" : finished ? "▶ Play again" : "▶ Play message"}
          </button>
        </>
      ) : (
        <p className="text-lg text-muted">The recording isn&apos;t available, but here is what {partnerName} said:</p>
      )}
      <div>
        <p className="text-lg font-bold">What {partnerName} said:</p>
        <p className="text-2xl leading-snug">{text}</p>
      </div>
    </div>
  );
}
