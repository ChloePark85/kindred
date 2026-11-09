"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChoosePartnerButton({ partnerId, partnerName }: { partnerId: string; partnerName: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; restart?: boolean } | null;
      if (body?.restart) {
        router.push("/onboarding");
        return;
      }
      if (!res.ok) {
        setError(body?.error ?? "Sorry, something went wrong. Please try again.");
        setSaving(false);
        return;
      }
      router.push("/chat");
    } catch {
      setError("Sorry, something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={choose} disabled={saving} aria-busy={saving} className="btn-primary min-h-16 w-full text-xl">
        {saving ? "One moment…" : `Talk with ${partnerName} ➤`}
      </button>
      {error && (
        <p role="alert" className="rounded-2xl bg-accent-soft px-4 py-3 text-lg font-bold">
          {error}
        </p>
      )}
    </div>
  );
}
