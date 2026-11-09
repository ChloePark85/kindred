import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Call } from "./fakeSupabase";

const state = vi.hoisted(() => ({
  session: null as unknown,
  items: [] as { start: string; end: string; activity: string; busy: boolean }[],
}));
vi.mock("@/lib/supabase/server", () => ({ getSession: async () => state.session }));
vi.mock("@/lib/schedule", async (orig) => ({
  ...(await orig<typeof import("@/lib/schedule")>()),
  getOrCreateSchedule: async () => ({ items: state.items }),
}));
vi.mock("@/lib/claude", () => ({ generateText: vi.fn(async () => "Sorry, just got back! How are you?") }));
vi.mock("@/lib/memories", async (orig) => ({
  ...(await orig<typeof import("@/lib/memories")>()),
  getRelevantMemories: async () => [],
  extractAndStoreMemories: vi.fn(async () => []),
}));
vi.mock("@/lib/relationship", async (orig) => {
  const real = await orig<typeof import("@/lib/relationship")>();
  return { ...real, getStage: async () => ({ stage: real.STAGES[0] }) };
});
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const { POST } = await import("@/app/api/chat/route");
const { generateText } = await import("@/lib/claude");
const { extractAndStoreMemories } = await import("@/lib/memories");

const profile = { id: "u1", name: "Susan", partner_id: "walter", day_offset: 0, timezone: "UTC", interests: [] };
const msg = (over: object) => ({ id: "m", user_id: "u1", partner_id: "walter", sim_date: "2026-11-09", created_at: "2026-11-09T10:00:00Z", ...over });

function withDb(history: object[]) {
  const db = fakeSupabase((call: Call) => {
    if (call.table === "messages" && call.op === "select") return { data: [...history].reverse() };
    if (call.table === "messages" && call.op === "insert") return { data: { id: "new", ...(call.payload as object) } };
    return { data: null };
  });
  state.session = { supabase: db.client, user: { id: "u1" }, profile };
  return db;
}

const req = (body: object) =>
  new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ ...body, partnerId: "walter" }) });

const allDay = (busy: boolean) => [{ start: "00:00", end: "23:59", activity: busy ? "Fixing a clock" : "Free", busy }];

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockClear();
    vi.mocked(extractAndStoreMemories).mockClear();
  });

  it("waits for the partner to be free before replying", async () => {
    state.items = allDay(false);
    const replyAt = new Date(Date.now() + 30 * 60_000).toISOString();
    withDb([msg({ role: "user", kind: "chat", content: "hi" }), msg({ role: "partner", kind: "busy_note", content: "busy", reply_at: replyAt })]);
    const body = await (await POST(req({ resume: true }))).json();
    expect(body.notYet).toBe(true);
    expect(body.replyAfterMs).toBeGreaterThan(29 * 60_000);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("replies once the partner is free again, knowing why it's late", async () => {
    state.items = allDay(false);
    const replyAt = new Date(Date.now() - 1000).toISOString();
    withDb([
      msg({ role: "user", kind: "chat", content: "hi" }),
      msg({ role: "partner", kind: "busy_note", content: "🌙 Walter has gone to sleep.", reply_at: replyAt }),
    ]);
    const body = await (await POST(req({ resume: true }))).json();
    expect(body.notYet).toBeUndefined();
    expect(body.messages).toHaveLength(1);
    const system = vi.mocked(generateText).mock.calls[0][0].system;
    expect(system).toContain("Walter has gone to sleep");
    expect(extractAndStoreMemories).not.toHaveBeenCalled(); // remembered when it was sent
  });

  it("stores a busy note with the time the partner will be free", async () => {
    state.items = allDay(true); // busy until the end of the day: asleep until the morning
    const db = withDb([]);
    const body = await (await POST(req({ message: "Good night!" }))).json();
    expect(body.busy).toBe(true);
    const note = db.calls.find((c) => c.op === "insert" && (c.payload as { kind: string }).kind === "busy_note")!;
    expect(Date.parse((note.payload as { reply_at: string }).reply_at)).toBeGreaterThan(Date.now());
    expect(generateText).not.toHaveBeenCalled();
    // Remembered right away, so "tomorrow" means tomorrow from today.
    expect(vi.mocked(extractAndStoreMemories).mock.calls[0][0]).toMatchObject({ userMessage: "Good night!" });
  });
});
