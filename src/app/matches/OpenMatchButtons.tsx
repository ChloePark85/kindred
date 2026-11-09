"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Chat / Call buttons for one match: opens that partner, then goes to the screen. */
export function OpenMatchButtons({ partnerId, partnerName }: { partnerId: string; partnerName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(href: "/chat" | "/call") {
    setPending(href);
    setError(null);
    try {
      const res = await fetch("/api/matches/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Sorry, something went wrong. Please try again.");
        setPending(null);
        return;
      }
      router.push(href);
    } catch {
      setError("Sorry, something went wrong. Please try again.");
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => open("/chat")}
          disabled={pending !== null}
          aria-label={`Chat with ${partnerName}`}
          className="btn-primary"
        >
          {pending === "/chat" ? "Opening…" : "💬 Chat"}
        </button>
        <button
          type="button"
          onClick={() => open("/call")}
          disabled={pending !== null}
          aria-label={`Call ${partnerName}`}
          className="btn-secondary"
        >
          {pending === "/call" ? "Opening…" : "📞 Call"}
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-2xl bg-accent-soft px-4 py-3 text-lg font-bold">
          {error}
        </p>
      )}
    </div>
  );
}
