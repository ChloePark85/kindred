import Link from "next/link";
import type { Persona } from "@/lib/personas";
import { AiBadge } from "@/components/AiBadge";

const NAV = [
  { href: "/chat", label: "💬 Chat" },
  { href: "/call", label: "📞 Call" },
  { href: "/us", label: "📖 Us" },
];

/** Header shown on every screen after onboarding. `active` is the current nav href. */
export function AppHeader({ persona, active }: { persona: Persona; active: string }) {
  return (
    <header className="sticky top-0 z-10 border-b-2 border-[#e8ddd0] bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-4xl" aria-hidden>
              {persona.emoji}
            </span>
            <div>
              <p className="text-xl font-bold">{persona.name}</p>
              <AiBadge name={persona.name} />
            </div>
          </div>
        </div>
        <nav aria-label="Main" className="grid grid-cols-3 gap-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
              className={`btn text-base ${active === n.href ? "bg-accent text-white" : "border-2 border-[#cfc3b5] bg-white"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
