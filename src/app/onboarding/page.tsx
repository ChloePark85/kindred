import type { Metadata } from "next";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = {
  title: "Welcome — SeniorChat",
};

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 text-lg">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">Welcome to SeniorChat 👋</h1>
        <p className="text-xl">
          A friendly AI companion to chat with any time of day. Tell us a little about yourself so your companion
          can get to know you.
        </p>
      </header>
      <OnboardingForm />
    </main>
  );
}
