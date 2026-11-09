"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PartnerPhoto } from "@/components/PartnerPhoto";
import type { Persona } from "@/lib/personas";

/** Full-screen "It's a match!" celebration with next steps. */
export function MatchOverlay({
  persona,
  userName,
  onContinue,
}: {
  persona: Persona;
  userName: string;
  onContinue: () => void;
}) {
  const callRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    callRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onContinue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContinue]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gradient-to-b from-[#d63a64] to-[#7a1f3d] px-4 py-8 text-white"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <h2 id="match-title" className="text-4xl font-bold">
          <span aria-hidden>💞</span> It&apos;s a match!
        </h2>

        <div className="flex items-center justify-center" aria-hidden>
          <div className="z-10 flex h-32 w-32 items-center justify-center rounded-full border-4 border-white bg-white text-6xl font-bold text-accent">
            {userName.trim()[0]?.toUpperCase() ?? "🙂"}
          </div>
          <PartnerPhoto persona={persona} priority className="-ml-6 h-32 w-32 rounded-full border-4 border-white" />
        </div>

        <p className="text-2xl font-bold">You and {persona.name} liked each other</p>
        <p className="rounded-full bg-black/40 px-4 py-1.5 text-lg">🤖 {persona.name} is an AI companion.</p>

        <div className="flex w-full flex-col gap-3">
          <Link ref={callRef} href="/call" className="btn min-h-16 bg-white text-xl text-accent hover:bg-accent-soft">
            📞 Call {persona.name} now
          </Link>
          <Link href="/chat" className="btn min-h-16 border-2 border-white text-xl text-white hover:bg-white/15">
            💬 Say hello
          </Link>
          <button type="button" onClick={onContinue} className="btn text-white underline underline-offset-4">
            Keep meeting people
          </button>
        </div>
      </div>
    </div>
  );
}
