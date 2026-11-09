/** Always-visible reminder that the partner is an AI. */
export function AiBadge({ name }: { name?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#1f1b16] px-3 py-1 text-sm font-bold text-white">
      🤖 {name ? `${name} is an AI companion` : "AI companion"}
    </span>
  );
}
