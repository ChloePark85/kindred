"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Seeking } from "@/lib/personas";
import { createClient } from "@/lib/supabase/client";

const AGE_RANGES = ["50–59", "60–69", "70–79", "80+"];
const SEEKING: { value: Seeking; label: string; emoji: string }[] = [
  { value: "men", label: "Men", emoji: "👨" },
  { value: "women", label: "Women", emoji: "👩" },
  { value: "anyone", label: "Anyone", emoji: "💞" },
];
const INTERESTS = [
  "🌱 Gardening",
  "🍳 Cooking",
  "🎵 Music",
  "⚾ Sports",
  "📚 Reading",
  "✈️ Travel",
  "👪 Family",
  "🙏 Faith",
  "🧶 Crafts",
  "📺 TV & Movies",
  "🚶 Walking",
  "🐾 Pets",
];

/** "🌱 Gardening" -> "Gardening" */
function interestName(chip: string) {
  return chip.slice(chip.indexOf(" ") + 1);
}

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [seeking, setSeeking] = useState<Seeking | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(interest: string) {
    setInterests((current) =>
      current.includes(interest) ? current.filter((i) => i !== interest) : [...current, interest],
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please tell us your first name.");
      return;
    }
    if (!ageRange) {
      setError("Please choose your age range.");
      return;
    }
    if (!seeking) {
      setError("Please choose who you would like to meet.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        const { error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) throw signInError;
      }

      const extra = other
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5);
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          age_range: ageRange,
          seeking,
          interests: [...interests, ...extra],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Sorry, something went wrong. Please try again.");
        setSaving(false);
        return;
      }
      router.push("/discover");
    } catch (err) {
      console.error(err);
      setError("Sorry, something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8" noValidate>
      <section className="card flex flex-col gap-3">
        <label htmlFor="first-name" className="text-2xl font-bold">
          What&apos;s your first name?
        </label>
        <input
          id="first-name"
          name="name"
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          className="input text-xl"
          placeholder="For example, Susan"
        />
      </section>

      <fieldset className="card flex flex-col gap-3">
        <legend className="float-left mb-3 text-2xl font-bold">How old are you?</legend>
        <div className="clear-both grid grid-cols-2 gap-3">
          {AGE_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={ageRange === range}
              onClick={() => setAgeRange(range)}
              className={`btn min-h-16 text-xl ${
                ageRange === range ? "bg-accent text-white" : "border-2 border-[#e2c4cc] bg-white"
              }`}
            >
              {ageRange === range && <span aria-hidden>✓</span>}
              {range}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="card flex flex-col gap-3">
        <legend className="float-left mb-3 text-2xl font-bold">Who would you like to meet?</legend>
        <div className="clear-both grid grid-cols-3 gap-3">
          {SEEKING.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={seeking === option.value}
              onClick={() => setSeeking(option.value)}
              className={`btn min-h-24 flex-col gap-1 px-2 text-xl ${
                seeking === option.value ? "bg-accent text-white" : "border-2 border-[#e2c4cc] bg-white"
              }`}
            >
              <span className="text-4xl leading-none" aria-hidden>
                {option.emoji}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="card flex flex-col gap-3">
        <legend className="float-left text-2xl font-bold">What do you enjoy?</legend>
        <p className="clear-both text-muted">Choose as many as you like.</p>
        <div className="flex flex-wrap gap-3">
          {INTERESTS.map((chip) => {
            const interest = interestName(chip);
            const on = interests.includes(interest);
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(interest)}
                className={`btn rounded-full px-5 ${on ? "bg-accent text-white" : "border-2 border-[#e2c4cc] bg-white"}`}
              >
                {on && <span aria-hidden>✓</span>}
                {chip}
              </button>
            );
          })}
        </div>
        <label htmlFor="other-interest" className="mt-2 font-bold">
          Something else? <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="other-interest"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          maxLength={120}
          className="input"
          placeholder="For example, birdwatching, chess"
        />
      </fieldset>

      {error && (
        <p role="alert" className="rounded-2xl bg-accent-soft px-4 py-3 text-lg font-bold">
          {error}
        </p>
      )}

      <button type="submit" disabled={saving} aria-busy={saving} className="btn-primary min-h-16 w-full text-xl">
        {saving ? "Saving…" : "💘 Start meeting people"}
      </button>
    </form>
  );
}
