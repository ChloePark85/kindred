"use client";

import { useEffect, useRef } from "react";

export type CaptionLine = { role: "user" | "partner"; text: string };

/** Large live captions of the call, for people who are hard of hearing. */
export function Captions({ lines, partnerName }: { lines: CaptionLine[]; partnerName: string }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines.length]);

  return (
    <section aria-labelledby="captions-heading" className="card flex flex-col gap-3">
      <h2 id="captions-heading" className="text-xl font-bold">
        Captions
      </h2>
      <div
        ref={boxRef}
        aria-live="polite"
        aria-relevant="additions"
        className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto"
        tabIndex={0}
      >
        {lines.length === 0 ? (
          <p className="text-lg text-muted">What you both say will appear here.</p>
        ) : (
          lines.map((line, i) => (
            <p key={i} className="text-2xl leading-snug">
              <span className={`font-bold ${line.role === "user" ? "text-foreground" : "text-accent"}`}>
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
