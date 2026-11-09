import Link from "next/link";
import type { Persona } from "@/lib/personas";
import type { Stage } from "@/lib/relationship";
import { AiBadge } from "@/components/AiBadge";
import { PartnerPhoto } from "@/components/PartnerPhoto";

const NAV = [
  { href: "/discover", label: "💘 Meet" },
  { href: "/matches", label: "💞 Matches" },
  { href: "/chat", label: "💬 Chat" },
  { href: "/call", label: "📞 Call" },
  { href: "/us", label: "📖 Us" },
];

/**
 * Header on every screen after onboarding. `persona` is the open partner (null
 * before the first match); `active` is the current nav href.
 */
export function AppHeader({
  persona,
  stage,
  active,
}: {
  persona: Persona | null;
  stage?: Stage;
  active: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b-2 border-[#f3d9df] bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3">
        {persona && (
          <div className="flex items-center gap-3">
            <PartnerPhoto persona={persona} className="h-16 w-16 shrink-0 rounded-full" priority />
            <div className="min-w-0">
              <p className="text-xl font-bold">
                {persona.name}, {persona.age}
                {stage && (
                  <span className="ml-2 align-middle text-base font-normal text-muted">
                    {stage.emoji} {stage.label}
                  </span>
                )}
              </p>
              <AiBadge name={persona.name} />
            </div>
          </div>
        )}
        <nav aria-label="Main" className="grid grid-cols-5 gap-1.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center rounded-2xl text-sm font-bold sm:text-base ${
                active === n.href ? "bg-accent text-white" : "border-2 border-[#e2c4cc] bg-white"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
