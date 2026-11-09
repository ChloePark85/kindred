import type { Persona } from "@/lib/personas";
import type { Message } from "@/lib/types";

/** One line of the conversation; its look depends on who sent it and what kind of message it is. */
export function MessageItem({ message, persona }: { message: Message; persona: Pick<Persona, "name" | "emoji"> }) {
  if (message.role === "user") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-md bg-accent px-5 py-3 text-lg text-white">
          <span className="sr-only">You said: </span>
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </li>
    );
  }

  if (message.kind === "busy_note") {
    return (
      <li className="px-2 text-center text-base text-muted" role="note">
        {message.content}
      </li>
    );
  }

  if (message.kind === "call") {
    return (
      <li>
        <details className="rounded-2xl border-2 border-[#e8ddd0] bg-[#f4efe8] px-4 py-2 text-base">
          <summary className="flex min-h-12 cursor-pointer items-center font-bold">📞 Call transcript</summary>
          <p className="whitespace-pre-wrap break-words pb-2 pt-1 text-lg">{message.content}</p>
        </details>
      </li>
    );
  }

  const label =
    message.kind === "reach_out"
      ? `💌 ${persona.name} reached out`
      : message.kind === "voice_message"
        ? "🔊 Voice message"
        : `${persona.emoji} ${persona.name}`;

  return (
    <li className="flex flex-col items-start gap-1">
      <div className="max-w-[85%] rounded-3xl rounded-bl-md border-2 border-[#e8ddd0] bg-white px-5 py-3 text-lg">
        <p className="mb-1 flex flex-wrap items-center gap-2 text-base font-bold text-muted">
          <span>{label}</span>
          <span className="rounded-full bg-[#1f1b16] px-2 text-sm text-white">AI</span>
          <span className="sr-only">says:</span>
        </p>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
      {message.kind === "reach_out" && message.nudged_person && (
        <p className="px-2 text-base text-muted">💛 Encouraged you to reach out to {message.nudged_person}</p>
      )}
    </li>
  );
}
