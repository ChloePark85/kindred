"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { Persona } from "@/lib/personas";
import type { Message } from "@/lib/types";
import { MessageItem } from "./MessageItem";

type ChatBody = { message: string } | { resume: true } | { greet: true };

type ChatResponse = {
  messages?: Message[];
  status?: string;
  busy?: boolean;
  note?: string;
  replyAfterMs?: number;
  queued?: boolean;
  retry?: boolean;
  error?: string;
};

const FRIENDLY_ERROR = "Sorry, something went wrong. Please try again.";
/** After a page reload while a delayed reply is owed, wait this long before asking for it. */
const RESUME_AFTER_RELOAD_MS = 4000;

/** Adds new messages, replacing any with the same id, in time order. */
function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

type PostResult = { ok: boolean; data: ChatResponse | null } | null;

async function postChat(body: ChatBody): Promise<PostResult> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as ChatResponse | null;
    return { ok: res.ok, data };
  } catch {
    return null;
  }
}

export function ChatWindow({
  persona,
  initialMessages,
  initialStatus,
  initialAwaiting,
  reachOut,
}: {
  persona: Persona;
  initialMessages: Message[];
  initialStatus: string | null;
  initialAwaiting: boolean;
  reachOut: ReactNode;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [input, setInput] = useState("");
  const [inFlight, setInFlight] = useState(initialMessages.length === 0);
  const [typing, setTyping] = useState(initialMessages.length === 0);
  const [awaiting, setAwaiting] = useState(initialAwaiting);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  // router.refresh() (e.g. after "reach out") sends new server props: fold them in.
  const [serverMessages, setServerMessages] = useState(initialMessages);
  const [serverStatus, setServerStatus] = useState(initialStatus);
  if (serverMessages !== initialMessages) {
    setServerMessages(initialMessages);
    setMessages((current) => mergeMessages(current, initialMessages));
  }
  if (serverStatus !== initialStatus) {
    setServerStatus(initialStatus);
    setStatus(initialStatus);
  }

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  /** Folds a /api/chat result into the conversation; returns the response body (null if unreachable). */
  function applyResult(result: PostResult, tempId?: string): ChatResponse | null {
    if (!result) {
      if (tempId) setMessages((current) => current.filter((m) => m.id !== tempId));
      setError("We couldn't reach the internet. Please check your connection and try again.");
      return null;
    }
    const { ok, data } = result;
    const saved = data?.messages ?? [];
    setMessages((current) => mergeMessages(tempId ? current.filter((m) => m.id !== tempId) : current, saved));
    if (data?.status) setStatus(data.status);
    if (!ok || !data) setError(data?.error ?? FRIENDLY_ERROR);
    return data;
  }

  async function callChat(body: ChatBody, tempId?: string) {
    return applyResult(await postChat(body), tempId);
  }

  async function run(body: ChatBody, opts: { showTyping: boolean; tempId?: string }) {
    setInFlight(true);
    setTyping(opts.showTyping);
    setError(null);
    setCanRetry(false);
    try {
      return await callChat(body, opts.tempId);
    } finally {
      setInFlight(false);
      setTyping(false);
    }
  }

  async function resume() {
    const data = await run({ resume: true }, { showTyping: true });
    if (data && !data.error) setAwaiting(false);
    else setCanRetry(true);
  }

  function scheduleResume(ms: number) {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void resume();
    }, ms);
  }

  async function greet() {
    const data = await run({ greet: true }, { showTyping: true });
    if (data?.error) setCanRetry(true);
  }

  // Effects run once on mount; the handlers they start only read state through setters.
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      // inFlight/typing start as true when the conversation is empty, so the greeting needs no setup here.
      if (initialMessages.length === 0) {
        void postChat({ greet: true })
          .then((result) => {
            const data = applyResult(result);
            if (!data || data.error) setCanRetry(true);
          })
          .finally(() => {
            setInFlight(false);
            setTyping(false);
          });
      }
    }
    if (initialAwaiting) scheduleResume(RESUME_AFTER_RELOAD_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || inFlight) return;
    setInput("");
    const tempId = `pending-${Date.now()}`;
    const last = messages.at(-1);
    const temp: Message = {
      id: tempId,
      user_id: "",
      partner_id: persona.id,
      role: "user",
      kind: "chat",
      content,
      sim_date: last?.sim_date ?? "",
      created_at: new Date(Math.max(Date.now(), last ? Date.parse(last.created_at) + 1 : 0)).toISOString(),
    };
    setMessages((current) => [...current, temp]);

    const data = await run({ message: content }, { showTyping: !awaiting, tempId });
    if (!data || (data.error && !data.messages?.length)) {
      // Nothing was saved: give the words back so they can be sent again.
      setInput(content);
      return;
    }
    if (data.retry) {
      setCanRetry(true);
      return;
    }
    if (data.busy) {
      setAwaiting(true);
      scheduleResume(data.replyAfterMs ?? 10_000);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  }

  function retry() {
    if (messages.length === 0) void greet();
    else void resume();
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {status && (
        <p className="rounded-2xl bg-accent-soft px-4 py-2 text-base font-bold text-foreground">
          {persona.emoji} {status}
        </p>
      )}

      {reachOut}

      <ol
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Conversation with ${persona.name}`}
        className="flex flex-1 flex-col gap-4 py-2"
      >
        {messages.map((m) => (
          <MessageItem key={m.id} message={m} persona={persona} />
        ))}
      </ol>

      <div role="status" aria-live="polite">
        {typing && (
          <p className="inline-flex items-center gap-2 rounded-3xl border-2 border-[#e8ddd0] bg-white px-5 py-3 text-lg text-muted">
            <span aria-hidden className="animate-pulse">
              ✍️
            </span>
            {persona.name} is typing…
          </p>
        )}
        {!typing && awaiting && (
          <p className="text-base text-muted">
            {persona.name} will reply in a little while. You can keep writing in the meantime.
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-accent-soft px-4 py-3">
          <p className="text-lg font-bold">{error}</p>
          {canRetry && (
            <button type="button" onClick={retry} disabled={inFlight} className="btn-secondary self-start">
              🔄 Try again
            </button>
          )}
        </div>
      )}

      <div ref={bottomRef} />

      <form onSubmit={onSubmit} className="sticky bottom-0 flex flex-col gap-3 border-t-2 border-[#e8ddd0] bg-background py-3">
        <label htmlFor="chat-input" className="text-lg font-bold">
          Write to {persona.name}
        </label>
        <textarea
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          maxLength={2000}
          placeholder="Type your message here…"
          className="input min-h-28 resize-y py-3"
        />
        <button type="submit" disabled={inFlight || input.trim() === ""} className="btn-primary w-full text-xl">
          Send ➤
        </button>
      </form>
    </div>
  );
}
