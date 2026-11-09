"use client";

import { useState } from "react";
import { photoUrl, type Persona } from "@/lib/personas";

/**
 * The partner's profile photo (public/partners/{id}.jpg) on top of their
 * gradient. If the photo is missing, the gradient shows their initial instead.
 * The parent controls size and rounding via className.
 */
export function PartnerPhoto({
  persona,
  className = "",
  priority = false,
}: {
  persona: Persona;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(160deg, ${persona.colors[0]}, ${persona.colors[1]})` }}
    >
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white" aria-hidden>
          <span className="text-7xl leading-none font-bold">{persona.name[0]}</span>
          <span className="text-4xl">{persona.emoji}</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- plain img so a missing file can fall back gracefully
        <img
          src={photoUrl(persona)}
          alt={`Photo of ${persona.name}, an AI companion`}
          className="absolute inset-0 h-full w-full object-cover"
          loading={priority ? "eager" : "lazy"}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
