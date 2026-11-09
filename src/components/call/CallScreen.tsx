"use client";

import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation, type DisconnectionDetails } from "@elevenlabs/react";
import { Captions, type CaptionLine } from "@/components/call/Captions";
import { VoiceMessagePlayer } from "@/components/call/VoiceMessagePlayer";

type Phase = "idle" | "mic" | "connecting" | "live" | "ended" | "fallback";
type EndReason = DisconnectionDetails["reason"];

type SessionResponse = { signedUrl: string; prompt: string; firstMessage: string; voiceId: string };
type VoiceMessage =
  | { status: "loading" }
  | { status: "ready"; text: string; audioSrc: string | null }
  | { status: "failed" };

/** A call shorter than this that ends on its own, before the user spoke, counts as "didn't connect". */
const EARLY_DROP_MS = 8000;

export function CallScreen({ partnerName, userName }: { partnerName: string; userName: string }) {
  return (
    <ConversationProvider>
      <CallPanel partnerName={partnerName} userName={userName} />
    </ConversationProvider>
  );
}

function CallPanel({ partnerName, userName }: { partnerName: string; userName: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [dropped, setDropped] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [voiceMessage, setVoiceMessage] = useState<VoiceMessage>({ status: "loading" });

  const linesRef = useRef<CaptionLine[]>([]);
  const connectedAtRef = useRef<number | null>(null);
  /** True once the current call attempt has been wrapped up (saved, fallen back or cancelled). */
  const finishedRef = useRef(true);

  const conversation = useConversation({
    onConnect: () => {
      connectedAtRef.current = Date.now();
      setPhase("live");
    },
    onMessage: ({ message, role }) => {
      const text = message.trim();
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

  // Save whatever was said if the person leaves the page mid-call; the
  // provider ends the session itself on unmount.
  const finishRef = useRef(finishCall);
  useEffect(() => {
    finishRef.current = finishCall;
  });
  useEffect(() => () => finishRef.current("user"), []);

  function saveTranscript(transcript: CaptionLine[]) {
    if (transcript.length === 0) return;
    setSaveState("saving");
    const body = JSON.stringify({ transcript });
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
    const connectedAt = connectedAtRef.current;
    const userSpoke = transcript.some((l) => l.role === "user");

    if (reason !== "user" && (connectedAt === null || (Date.now() - connectedAt < EARLY_DROP_MS && !userSpoke))) {
      leaveVoiceMessage(false);
      return;
    }
    if (transcript.length === 0) {
      setPhase("idle");
      return;
    }
    setDropped(reason === "error");
    setPhase("ended");
    saveTranscript(transcript);
  }

  function leaveVoiceMessage(denied: boolean) {
    finishedRef.current = true;
    conversation.endSession();
    setMicDenied(denied);
    setVoiceMessage({ status: "loading" });
    setPhase("fallback");
    fetch("/api/voice/message", { method: "POST" })
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
    let granted = false;
    try {
      const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      granted = status?.state === "granted";
    } catch {
      // Some browsers can't query microphone permission; explain first to be safe.
    }
    if (granted) void startCall();
    else setPhase("mic");
  }

  async function startCall() {
    finishedRef.current = false;
    connectedAtRef.current = null;
    linesRef.current = [];
    setLines([]);
    setDropped(false);
    setSaveState("idle");
    setPhase("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      if (!finishedRef.current) leaveVoiceMessage(true);
      return;
    }

    let session: SessionResponse;
    try {
      const res = await fetch("/api/voice/session", { method: "POST" });
      if (!res.ok) throw new Error(`session ${res.status}`);
      session = (await res.json()) as SessionResponse;
    } catch (error) {
      console.error(error);
      if (!finishedRef.current) leaveVoiceMessage(false);
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

  const statusText =
    phase === "connecting" || conversation.status === "connecting"
      ? "Connecting…"
      : conversation.isSpeaking
        ? `${partnerName} is speaking`
        : "Listening…";

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-2xl bg-[#1f1b16] px-4 py-3 text-center text-lg font-bold text-white">
        🤖 You&apos;re talking to an AI companion
      </p>

      {phase === "idle" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <button
            type="button"
            onClick={onCallClick}
            className="flex size-56 flex-col items-center justify-center gap-2 rounded-full bg-[#2f7d32] text-3xl font-bold text-white shadow-lg transition-colors hover:bg-[#25642a] focus-visible:outline-offset-4"
          >
            <span aria-hidden className="text-6xl">
              📞
            </span>
            Call {partnerName}
          </button>
          <p className="max-w-md text-lg text-muted">
            Have a real voice chat with {partnerName}. Tap the green button, then just talk, like a phone call.
          </p>
        </div>
      )}

      {phase === "mic" && (
        <div className="card flex flex-col gap-5">
          <h2 className="text-2xl font-bold">🎤 {partnerName} needs to hear you</h2>
          <p className="text-xl">
            To talk out loud, this app needs to use your microphone. When you tap the button below, your browser will
            ask for permission. Please choose <strong>Allow</strong>.
          </p>
          <p className="text-lg text-muted">The microphone is only used during the call. You can hang up at any time.</p>
          <button type="button" onClick={() => void startCall()} className="btn-primary w-full text-xl">
            Allow microphone and call
          </button>
          <button type="button" onClick={() => setPhase("idle")} className="btn-secondary w-full">
            Not now
          </button>
        </div>
      )}

      {(phase === "connecting" || phase === "live") && (
        <>
          <div className="card flex flex-col items-center gap-6 text-center">
            <p role="status" aria-live="polite" className="text-4xl font-bold">
              {statusText}
            </p>
            {phase === "live" ? (
              <button
                type="button"
                onClick={hangUp}
                className="btn min-h-20 w-full bg-[#c62828] text-2xl text-white hover:bg-[#a31f1f]"
              >
                End call
              </button>
            ) : (
              <button type="button" onClick={cancelConnecting} className="btn-secondary w-full">
                Cancel
              </button>
            )}
          </div>
          <Captions lines={lines} partnerName={partnerName} />
        </>
      )}

      {phase === "ended" && (
        <>
          <div className="card flex flex-col gap-4 text-center">
            <p role="status" className="text-3xl font-bold">
              {dropped ? "The call was cut off" : "Call ended"}
            </p>
            <p aria-live="polite" className="text-lg text-muted">
              {saveState === "saving" && "Saving your call…"}
              {saveState === "saved" && `${partnerName} will remember what you talked about.`}
              {saveState === "failed" && "Sorry, we couldn't save this call. Your chat is still safe."}
            </p>
            <button type="button" onClick={onCallClick} className="btn-primary w-full text-xl">
              📞 Call {partnerName} again
            </button>
          </div>
          <Captions lines={lines} partnerName={partnerName} />
        </>
      )}

      {phase === "fallback" && (
        <>
          <div role="status" className="card flex flex-col gap-3">
            <p className="text-2xl font-bold">
              The call couldn&apos;t connect, so {partnerName} left you a voice message instead.
            </p>
            {micDenied && (
              <p className="text-lg text-muted">
                Your microphone is blocked for this site, {userName}. To call next time, allow the microphone in your
                browser settings (usually the lock icon next to the web address).
              </p>
            )}
          </div>
          {voiceMessage.status === "loading" && (
            <p aria-live="polite" className="card text-xl">
              {partnerName} is recording a message for you…
            </p>
          )}
          {voiceMessage.status === "ready" && (
            <VoiceMessagePlayer partnerName={partnerName} text={voiceMessage.text} audioSrc={voiceMessage.audioSrc} />
          )}
          {voiceMessage.status === "failed" && (
            <p role="alert" className="card text-xl">
              Sorry, something went wrong on our side. Please try again in a little while, or send {partnerName} a
              message in Chat.
            </p>
          )}
          <button type="button" onClick={onCallClick} className="btn-secondary w-full">
            📞 Try calling again
          </button>
        </>
      )}
    </div>
  );
}
