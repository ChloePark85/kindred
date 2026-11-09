"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Simulates the next morning: the partner writes first, then the chat refreshes. */
export function ReachOutButton({ partnerName }: { partnerName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reachOut() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/reach-out", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? `${partnerName} couldn't write right now. Please try again.`);
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the internet. Please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={reachOut} disabled={pending} aria-busy={pending} className="btn-secondary w-full">
        {pending ? `${partnerName} is writing to you…` : `☀️ Next day: let ${partnerName} reach out first`}
      </button>
      <p className="text-base text-muted">This skips ahead to tomorrow morning so {partnerName} can send you the first message.</p>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? `${partnerName} is writing to you` : ""}
      </p>
      {error && (
        <p role="alert" className="rounded-2xl bg-accent-soft px-4 py-3 text-lg font-bold text-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
