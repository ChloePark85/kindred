"use client";

import { useState } from "react";
import { photoUrl, type Persona } from "@/lib/personas";

/**
 * The partner's profile photo (public/partners/{id}.jpg) on top of their
 * gradient. If the photo is missing, the gradient shows their initial instead.
 * The parent controls size and rounding via className; the fallback initial
 * scales with the box (container query units) so it fits small avatars too.
 */
export function PartnerPhoto({
  persona,
  className = "",
  priority = false,
  small = false,
  decorative = false,
}: {
  persona: Persona;
  className?: string;
  priority?: boolean;
  /** Use the 400px copy; for avatars up to about 200px. */
  small?: boolean;
  /** Skip the alt text when the name is already shown right next to the photo. */
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`@container relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(160deg, ${persona.colors[0]}, ${persona.colors[1]})` }}
    >
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white" aria-hidden>
          <span className="text-[min(4.5rem,45cqmin)] leading-none font-bold">{persona.name[0]}</span>
          <span className="text-[min(2.25rem,22cqmin)]">{persona.emoji}</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- plain img so a missing file can fall back gracefully
        <img
          src={photoUrl(persona, small)}
          alt={decorative ? "" : `Photo of ${persona.name}, an AI companion`}
          className="absolute inset-0 h-full w-full object-cover"
          loading={priority ? "eager" : "lazy"}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
