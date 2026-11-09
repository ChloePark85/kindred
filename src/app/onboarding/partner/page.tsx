import type { Metadata } from "next";
import { AiBadge } from "@/components/AiBadge";
import { PERSONAS } from "@/lib/personas";
import { ChoosePartnerButton } from "./ChoosePartnerButton";

export const metadata: Metadata = {
  title: "Choose your companion — SeniorChat",
};

export default function ChoosePartnerPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 text-lg">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">Who would you like to talk with?</h1>
        <p className="text-xl">Pick the companion who feels right for you. You can chat with them every day.</p>
        <p className="rounded-2xl bg-[#1f1b16] px-4 py-3 text-lg font-bold text-white">
          🤖 All partners are AI companions, not real people.
        </p>
      </header>

      <ul className="flex flex-col gap-6">
        {PERSONAS.map((p) => (
          <li key={p.id} className="card flex flex-col gap-4">
            <div className="flex items-start gap-4">
              <span className="text-6xl leading-none" aria-hidden>
                {p.emoji}
              </span>
              <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold">
                  {p.name}, {p.age}
                </h2>
                <AiBadge />
              </div>
            </div>
            <p className="text-xl font-bold">{p.tagline}</p>
            <p>{p.bio}</p>
            <ChoosePartnerButton partnerId={p.id} partnerName={p.name} />
          </li>
        ))}
      </ul>
    </main>
  );
}
