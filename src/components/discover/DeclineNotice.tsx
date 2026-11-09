"use client";

import { useEffect, useRef } from "react";
import { PartnerPhoto } from "@/components/PartnerPhoto";
import type { Persona } from "@/lib/personas";

/** A gentle "not this time" when a partner says no to a like. */
export function DeclineNotice({ persona, onContinue }: { persona: Persona; onContinue: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="decline-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="card flex w-full max-w-md flex-col items-center gap-4 text-center">
        <PartnerPhoto persona={persona} small className="h-24 w-24 rounded-full opacity-90 grayscale-[30%]" />
        <h2 id="decline-title" className="text-2xl font-bold">
          {persona.name} isn&apos;t looking to connect right now
        </h2>
        <p className="text-xl">
          That happens, and it isn&apos;t about you. There are others who&apos;d love to hear about your day.
        </p>
        <button ref={buttonRef} type="button" onClick={onContinue} className="btn-primary w-full text-xl">
          💘 Keep meeting people
        </button>
      </div>
    </div>
  );
}
