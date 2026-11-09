"use client";

import { useEffect, useRef } from "react";

export type CaptionLine = { role: "user" | "partner"; text: string };

/**
 * Large live captions of the call, for people who are hard of hearing. Styled
 * for the dark call screen: white text on a translucent panel.
 */
export function Captions({ lines, partnerName }: { lines: CaptionLine[]; partnerName: string }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines.length]);

  return (
    <section aria-labelledby="captions-heading" className="flex w-full flex-col gap-2 rounded-3xl bg-black/40 p-5">
      <h2 id="captions-heading" className="text-base font-bold tracking-wide text-white/80 uppercase">
        Captions
      </h2>
      <div
        ref={boxRef}
        aria-live="polite"
        aria-relevant="additions"
        className="flex max-h-[40dvh] min-h-24 flex-col gap-4 overflow-y-auto"
        tabIndex={0}
      >
        {lines.length === 0 ? (
          <p className="text-xl text-white/80">What you both say will appear here.</p>
        ) : (
          lines.map((line, i) => (
            <p key={i} className="text-2xl leading-snug text-white">
              <span className={`font-bold ${line.role === "user" ? "text-[#ffe08a]" : "text-white"}`}>
                {line.role === "user" ? "You" : partnerName}:
              </span>{" "}
              {line.text}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
