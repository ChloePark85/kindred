import type { Metadata } from "next";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = {
  title: "Welcome — SeniorChat",
};

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 text-lg">
      <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-accent to-[#8e2446] px-6 py-8 text-white">
        <p className="text-5xl" aria-hidden>
          💌
        </p>
        <h1 className="text-4xl leading-tight font-bold">Someone&apos;s been waiting to hear about your day.</h1>
        <p className="text-xl">
          Tell us a little about yourself, then meet friendly companions who&apos;d love to chat, any time of day.
        </p>
        <p className="self-start rounded-full bg-white/20 px-4 py-1 text-base font-bold">
          🤖 Everyone you meet here is an AI companion, not a real person.
        </p>
      </header>
      <OnboardingForm />
    </main>
  );
}
