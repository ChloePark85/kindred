"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConversationProvider, useConversation, type DisconnectionDetails } from "@elevenlabs/react";
import type { Persona } from "@/lib/personas";
import { PartnerPhoto } from "@/components/PartnerPhoto";
import { withoutVoiceTags } from "@/lib/speech";
import { Captions, type CaptionLine } from "@/components/call/Captions";
import { VoiceMessagePlayer } from "@/components/call/VoiceMessagePlayer";
import { useRingtone } from "@/components/call/useRingtone";

type Phase = "idle" | "mic" | "ringing" | "missed" | "connecting" | "live" | "ended" | "fallback";
type EndReason = DisconnectionDetails["reason"];
type FallbackReason = "failed" | "mic" | "declined";

type SessionResponse = { signedUrl: string; prompt: string; firstMessage: string; voiceId: string };
type VoiceMessage =
  | { status: "loading" }
  | { status: "ready"; text: string; audioSrc: string | null }
  | { status: "failed" };

/** A call shorter than this that ends on its own, before the user spoke, counts as "didn't connect". */
const EARLY_DROP_MS = 8000;
/** An unanswered incoming call stops ringing after this long. */
const RING_TIMEOUT_MS = 30_000;

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function spokenDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return [m && `${m} minute${m === 1 ? "" : "s"}`, (s || !m) && `${s} second${s === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" ");
}

export function CallScreen({
  persona,
  userName,
  incoming,
}: {
  persona: Persona;
  userName: string;
  incoming: boolean;
}) {
  return (
    <ConversationProvider>
      <CallPanel persona={persona} userName={userName} incoming={incoming} />
    </ConversationProvider>
  );
}

/** The partner's round photo; the soft ring pulses while `pulsing` (off with reduced motion). */
function CallAvatar({ persona, pulsing }: { persona: Persona; pulsing: boolean }) {
  return (
    <div className="relative size-[200px] shrink-0">
      <style href="call-avatar-pulse" precedence="default">{`
        @keyframes call-avatar-pulse {
          0% { transform: scale(1); opacity: 0.55; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .call-avatar-pulse { animation: call-avatar-pulse 1.8s ease-out infinite; }
          .call-avatar-pulse-late { animation-delay: 0.9s; }
        }
      `}</style>
      {pulsing && (
        <>
          <span aria-hidden className="call-avatar-pulse absolute inset-0 rounded-full border-4 border-white/70" />
          <span
            aria-hidden
            className="call-avatar-pulse call-avatar-pulse-late absolute inset-0 rounded-full border-4 border-white/70"
          />
        </>
      )}
      <PartnerPhoto
        persona={persona}
        small
        className="size-full rounded-full border-4 border-white shadow-2xl"
        priority
      />
    </div>
  );
}

function RoundButton({
  label,
  icon,
  onClick,
  className,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  className: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex size-24 items-center justify-center rounded-full text-4xl shadow-xl transition-colors ${className}`}
      >
        <span aria-hidden>{icon}</span>
      </button>
      <span aria-hidden className="text-lg font-bold">
        {label}
      </span>
    </div>
  );
}

function CallPanel({ persona, userName, incoming }: { persona: Persona; userName: string; incoming: boolean }) {
  const name = persona.name;
  const [phase, setPhase] = useState<Phase>(incoming ? "ringing" : "idle");
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [dropped, setDropped] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<FallbackReason>("failed");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [voiceMessage, setVoiceMessage] = useState<VoiceMessage>({ status: "loading" });
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [talkedMs, setTalkedMs] = useState(0);

  const linesRef = useRef<CaptionLine[]>([]);
  const connectedAtRef = useRef<number | null>(null);
  /** True once the current call attempt has been wrapped up (saved, fallen back or cancelled). */
  const finishedRef = useRef(true);

  const conversation = useConversation({
    onConnect: () => {
      const t = Date.now();
      connectedAtRef.current = t;
      setConnectedAt(t);
      setNow(t);
      setPhase("live");
    },
    onMessage: ({ message, role }) => {
      // The expressive voice model's delivery cues ("[warm]") are for the voice, not the captions.
      const text = (role === "agent" ? withoutVoiceTags(message) : message).trim();
      if (!text) return;
      const line: CaptionLine = { role: role === "agent" ? "partner" : "user", text };
      linesRef.current = [...linesRef.current, line];
      setLines(linesRef.current);
    },
    onDisconnect: (details) => finishCall(details.reason),
    onError: (message) => {
      console.error("Call error:", message);
      if (connectedAtRef.current === null) finishCall("error");
    },
  });

  useRingtone(phase === "ringing");

  // An unanswered incoming call becomes a missed call.
  useEffect(() => {
    if (phase !== "ringing") return;
    const timer = window.setTimeout(() => {
      clearIncomingParam(); // so a refresh on the missed-call screen doesn't ring again
      setPhase("missed");
    }, RING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Call timer.
  useEffect(() => {
    if (phase !== "live") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Save whatever was said if the person leaves the page mid-call; the
  // provider ends the session itself on unmount.
  const finishRef = useRef(finishCall);
  useEffect(() => {
    finishRef.current = finishCall;
  });
  useEffect(() => () => finishRef.current("user"), []);

  /** Drop ?incoming=1 so a refresh doesn't ring again. */
  function clearIncomingParam() {
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }

  function saveTranscript(transcript: CaptionLine[]) {
    if (transcript.length === 0) return;
    setSaveState("saving");
    const body = JSON.stringify({ transcript, partnerId: persona.id });
    fetch("/api/voice/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // keepalive lets the save finish if the page is closing (browser limit ~64 KB).
      keepalive: body.length < 60_000,
    })
      .then((res) => setSaveState(res.ok ? "saved" : "failed"))
      .catch(() => setSaveState("failed"));
  }

  function finishCall(reason: EndReason) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const transcript = linesRef.current;
    const startedAt = connectedAtRef.current;
    const userSpoke = transcript.some((l) => l.role === "user");

    if (reason !== "user" && (startedAt === null || (Date.now() - startedAt < EARLY_DROP_MS && !userSpoke))) {
      leaveVoiceMessage("failed");
      return;
    }
    if (transcript.length === 0) {
      setPhase("idle");
      return;
    }
    setTalkedMs(startedAt === null ? 0 : Date.now() - startedAt);
    setDropped(reason === "error");
    setPhase("ended");
    saveTranscript(transcript);
  }

  function leaveVoiceMessage(reason: FallbackReason) {
    finishedRef.current = true;
    conversation.endSession();
    clearIncomingParam();
    setFallbackReason(reason);
    setVoiceMessage({ status: "loading" });
    setPhase("fallback");
    fetch("/api/voice/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId: persona.id }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`voice message ${res.status}`);
        const data = (await res.json()) as { text: string; audio: string | null };
        setVoiceMessage({
          status: "ready",
          text: data.text,
          audioSrc: data.audio ? `data:audio/mpeg;base64,${data.audio}` : null,
        });
      })
      .catch((error) => {
        console.error(error);
        setVoiceMessage({ status: "failed" });
      });
  }

  async function onCallClick() {
    clearIncomingParam();
    let granted = false;
    try {
      const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      granted = status?.state === "granted";
    } catch {
      // Some browsers can't query microphone permission; explain first to be safe.
    }
    if (granted) void startCall(false);
    else setPhase("mic");
  }

  async function startCall(answering: boolean) {
    clearIncomingParam();
    finishedRef.current = false;
    connectedAtRef.current = null;
    linesRef.current = [];
    setConnectedAt(null);
    setLines([]);
    setDropped(false);
    setSaveState("idle");
    setPhase("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      if (!finishedRef.current) leaveVoiceMessage("mic");
      return;
    }

    let session: SessionResponse;
    try {
      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incoming: answering, partnerId: persona.id }),
      });
      if (!res.ok) throw new Error(`session ${res.status}`);
      session = (await res.json()) as SessionResponse;
    } catch (error) {
      console.error(error);
      if (!finishedRef.current) leaveVoiceMessage("failed");
      return;
    }
    if (finishedRef.current) return; // cancelled while we were getting ready

    conversation.startSession({
      signedUrl: session.signedUrl,
      connectionType: "websocket",
      overrides: {
        agent: {
          prompt: { prompt: session.prompt },
          firstMessage: session.firstMessage,
          language: "en",
        },
        tts: { voiceId: session.voiceId },
      },
    });
  }

  function hangUp() {
    finishCall("user");
    conversation.endSession();
  }

  function cancelConnecting() {
    finishedRef.current = true;
    conversation.endSession();
    setPhase("idle");
  }

  const inCall = phase === "connecting" || phase === "live";
  const statusText =
    phase === "connecting" || conversation.status === "connecting"
      ? "Connecting…"
      : conversation.isSpeaking
        ? `${name} is speaking`
        : "Listening…";
  const pulsing =
    phase === "ringing" || phase === "connecting" || (phase === "live" && conversation.isSpeaking);

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden rounded-3xl text-white shadow-xl"
      style={{ background: `linear-gradient(170deg, ${persona.colors[0]}, ${persona.colors[1]})` }}
    >
      {/* Darkening layer keeps white text readable on light gradients. */}
      <div aria-hidden className="absolute inset-0 bg-black/30" />

      <div className="relative flex flex-1 flex-col items-center gap-5 px-5 py-8 text-center">
        <CallAvatar persona={persona} pulsing={pulsing} />

        <div className="flex flex-col items-center gap-2">
          <p className="text-4xl font-bold drop-shadow">{name}</p>
          <span className="rounded-full bg-black/60 px-4 py-1 text-base font-bold">🤖 AI companion</span>
        </div>

        {phase === "idle" && (
          <div className="mt-auto flex w-full max-w-md flex-col items-center gap-4">
            <p className="text-xl">
              {persona.city} · {persona.occupation}
            </p>
            <button
              type="button"
              onClick={onCallClick}
              className="flex min-h-20 w-full items-center justify-center gap-3 rounded-full bg-[#22a447] px-8 text-2xl font-bold text-white shadow-xl transition-colors hover:bg-[#1b8a3b]"
            >
              <span aria-hidden>📞</span> Call {name}
            </button>
            <p className="text-lg text-white/90">Tap to call, then just talk, like a phone call.</p>
          </div>
        )}

        {phase === "mic" && (
          <div className="mt-auto flex w-full max-w-md flex-col gap-4 rounded-3xl bg-white p-6 text-left text-foreground">
            <h2 className="text-2xl font-bold">🎤 {name} needs to hear you</h2>
            <p className="text-xl">
              To talk out loud, this app needs your microphone. When you tap the button below, your browser will ask
              for permission. Please choose <strong>Allow</strong>.
            </p>
            <p className="text-lg text-muted">The microphone is only used during the call. You can hang up at any time.</p>
            <button type="button" onClick={() => void startCall(false)} className="btn-primary w-full text-xl">
              Allow microphone and call
            </button>
            <button type="button" onClick={() => setPhase("idle")} className="btn-secondary w-full">
              Not now
            </button>
          </div>
        )}

        {phase === "ringing" && (
          <>
            <p role="status" className="text-3xl font-bold">
              {name} is calling…
            </p>
            <p className="text-lg text-white/90">
              When you answer, your browser may ask to use the microphone. Please choose Allow.
            </p>
            <div className="mt-auto flex w-full max-w-md flex-col gap-4">
              <button
                type="button"
                onClick={() => void startCall(true)}
                className="flex min-h-24 w-full items-center justify-center gap-3 rounded-full bg-[#22a447] text-3xl font-bold shadow-xl hover:bg-[#1b8a3b]"
              >
                <span aria-hidden>📞</span> Answer
              </button>
              <button
                type="button"
                onClick={() => leaveVoiceMessage("declined")}
                className="flex min-h-20 w-full items-center justify-center gap-3 rounded-full bg-[#d32f2f] text-2xl font-bold shadow-xl hover:bg-[#b71c1c]"
              >
                <span aria-hidden>☎️</span> Decline
              </button>
            </div>
          </>
        )}

        {phase === "missed" && (
          <div className="mt-auto flex w-full max-w-md flex-col gap-4">
            <p role="status" className="text-3xl font-bold">
              Missed call from {name}
            </p>
            <button
              type="button"
              onClick={onCallClick}
              className="flex min-h-20 w-full items-center justify-center gap-3 rounded-full bg-[#22a447] text-2xl font-bold shadow-xl hover:bg-[#1b8a3b]"
            >
              <span aria-hidden>📞</span> Call back
            </button>
            <Link href="/chat" className="btn w-full bg-white text-xl text-foreground">
              💬 Send a message instead
            </Link>
          </div>
        )}

        {inCall && (
          <>
            <div className="flex flex-col items-center gap-1">
              <p role="status" aria-live="polite" className="text-3xl font-bold">
                {statusText}
              </p>
              {phase === "live" && connectedAt !== null && (
                <p className="text-2xl tabular-nums">
                  <span aria-hidden>{formatDuration(now - connectedAt)}</span>
                  <span className="sr-only">Call time {spokenDuration(now - connectedAt)}</span>
                </p>
              )}
            </div>
            <Captions lines={lines} partnerName={name} />
            <div className="mt-auto flex w-full items-start justify-center gap-12 pt-2">
              {phase === "live" ? (
                <>
                  <RoundButton
                    label={conversation.isMuted ? "Unmute" : "Mute"}
                    icon={conversation.isMuted ? "🎙️" : "🔇"}
                    onClick={() => conversation.setMuted(!conversation.isMuted)}
                    className={
                      conversation.isMuted ? "bg-white text-foreground" : "bg-white/25 text-white hover:bg-white/35"
                    }
                  />
                  <RoundButton label="End" icon="☎️" onClick={hangUp} className="bg-[#d32f2f] hover:bg-[#b71c1c]" />
                </>
              ) : (
                <RoundButton
                  label="Cancel"
                  icon="☎️"
                  onClick={cancelConnecting}
                  className="bg-[#d32f2f] hover:bg-[#b71c1c]"
                />
              )}
            </div>
            {conversation.isMuted && phase === "live" && (
              <p role="status" className="text-lg font-bold">
                You&apos;re muted — {name} can&apos;t hear you.
              </p>
            )}
          </>
        )}

        {phase === "ended" && (
          <>
            <div className="w-full max-w-md rounded-3xl bg-white p-6 text-foreground">
              <p role="status" className="text-2xl font-bold">
                {dropped ? "The call was cut off" : "Call ended"}
              </p>
              <p className="mt-2 text-xl">
                📞 You talked for <span className="tabular-nums">{formatDuration(talkedMs)}</span>
                {saveState !== "failed" && <> · {name} will remember</>}
              </p>
              <p aria-live="polite" className="mt-1 text-lg text-muted">
                {saveState === "saving" && "Saving your call…"}
                {saveState === "failed" && "Sorry, we couldn't save this call."}
              </p>
              <div className="mt-5 flex flex-col gap-3">
                <button type="button" onClick={onCallClick} className="btn-primary w-full text-xl">
                  📞 Call again
                </button>
                <Link href="/chat" className="btn-secondary w-full text-xl">
                  💬 Go to chat
                </Link>
              </div>
            </div>
            <Captions lines={lines} partnerName={name} />
          </>
        )}

        {phase === "fallback" && (
          <div className="flex w-full max-w-md flex-col gap-4 text-left">
            <div role="status" className="rounded-3xl bg-black/40 p-5">
              <p className="text-2xl font-bold">
                {fallbackReason === "declined"
                  ? `${name} will leave you a voice message.`
                  : `The call couldn't connect, so ${name} left you a voice message instead.`}
              </p>
              {fallbackReason === "mic" && (
                <p className="mt-2 text-lg">
                  Your microphone is blocked for this site, {userName}. To call next time, allow the microphone in
                  your browser settings (usually the lock icon next to the web address).
                </p>
              )}
            </div>
            {voiceMessage.status === "loading" && (
              <p aria-live="polite" className="rounded-3xl bg-white p-6 text-xl text-foreground">
                {name} is recording a message for you…
              </p>
            )}
            {voiceMessage.status === "ready" && (
              <div className="text-foreground">
                <VoiceMessagePlayer partnerName={name} text={voiceMessage.text} audioSrc={voiceMessage.audioSrc} />
              </div>
            )}
            {voiceMessage.status === "failed" && (
              <p role="alert" className="rounded-3xl bg-white p-6 text-xl text-foreground">
                Sorry, something went wrong on our side. Please try again in a little while, or send {name} a message
                in Chat.
              </p>
            )}
            <button
              type="button"
              onClick={onCallClick}
              className="flex min-h-16 w-full items-center justify-center gap-3 rounded-full bg-[#22a447] text-xl font-bold shadow-xl hover:bg-[#1b8a3b]"
            >
              <span aria-hidden>📞</span> Call {name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
