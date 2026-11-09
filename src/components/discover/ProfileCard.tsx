"use client";

import { PartnerPhoto } from "@/components/PartnerPhoto";
import type { Persona } from "@/lib/personas";

/** The photo side of a Discover card: full-bleed photo with name, job, city and headline over a dark gradient. */
export function ProfileCard({ persona, priority = false }: { persona: Persona; priority?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[2rem] shadow-xl">
      <PartnerPhoto persona={persona} priority={priority} className="absolute inset-0 h-full w-full" />
      <span className="absolute top-4 left-4 rounded-full bg-black/75 px-4 py-1.5 text-base font-bold text-white">
        🤖 AI companion
      </span>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-6 pt-24 pb-6 text-white">
        <p className="text-3xl font-bold">
          {persona.name}, {persona.age}
        </p>
        <p className="text-lg">{persona.occupation}</p>
        <p className="text-lg">
          <span aria-hidden>📍</span> {persona.city}
        </p>
        <p className="mt-2 text-2xl leading-snug font-bold">&ldquo;{persona.headline}&rdquo;</p>
      </div>
    </div>
  );
}

/** The "More about" section: bio, hobbies, what they're looking for, habits. */
export function ProfileDetails({ persona, id }: { persona: Persona; id: string }) {
  return (
    <section id={id} aria-label={`More about ${persona.name}`} className="card flex flex-col gap-4">
      <p className="text-xl">{persona.bio}</p>
      <ul aria-label="Hobbies" className="flex flex-wrap gap-2">
        {persona.hobbies.map((h) => (
          <li key={h} className="rounded-full bg-accent-soft px-4 py-1.5 text-lg font-bold">
            {h}
          </li>
        ))}
      </ul>
      <dl className="grid gap-2 text-lg">
        <div>
          <dt className="inline font-bold">💞 Looking for: </dt>
          <dd className="inline">{persona.lookingFor}</dd>
        </div>
        <div>
          <dt className="inline font-bold">🚭 Smoking: </dt>
          <dd className="inline">{persona.smoking}</dd>
        </div>
        <div>
          <dt className="inline font-bold">🍷 Drinking: </dt>
          <dd className="inline">{persona.drinking}</dd>
        </div>
      </dl>
    </section>
  );
}
