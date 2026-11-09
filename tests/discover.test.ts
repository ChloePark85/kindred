import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Call } from "./fakeSupabase";

const session = vi.hoisted(() => ({ current: null as unknown, demo: false }));
vi.mock("@/lib/demo", async () => ({
  ...(await vi.importActual<typeof import("@/lib/demoConfig")>("@/lib/demoConfig")),
  isDemo: async () => session.demo,
}));
vi.mock("@/lib/supabase/server", () => ({ getSession: async () => session.current }));
// Walter is free all day in these tests, so a like is answered within minutes.
vi.mock("@/lib/schedule", () => ({
  getOrCreateSchedule: async () => ({ items: [{ start: "00:00", end: "23:59", activity: "Free", busy: false }] }),
}));

const { POST, DELETE, PUT } = await import("@/app/api/discover/route");

const profile = { id: "u1", partner_id: null, day_offset: 0, timezone: "UTC", interests: [] };

function withDb(rows: { partner_id: string; status: string; matched_at?: string | null; decide_at?: string | null }[]) {
  const db = fakeSupabase((call: Call) => {
    if (call.table === "matches" && call.op === "select") return { data: rows };
    if (call.table === "profiles" && call.op === "update") return { data: { ...profile, day_offset: 1 } };
    return { data: null };
  });
  session.current = { supabase: db.client, user: { id: "u1" }, profile };
  return db;
}

const req = (body: unknown) => new Request("http://test/api/discover", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/discover", () => {
  beforeEach(() => {
    session.current = null;
    session.demo = false;
  });

  it("in demo mode, answers a like within seconds", async () => {
    session.demo = true;
    const db = withDb([]);
    await POST(req({ partnerId: "james", action: "like" }));
    const upsert = db.calls.find((c) => c.op === "upsert")!;
    const decideIn = Date.parse((upsert.payload as { decide_at: string }).decide_at) - Date.now();
    expect(decideIn).toBeLessThanOrEqual(10_000);
  });

  it("never turns a match, a pending like or an answer into a pass", async () => {
    for (const status of ["matched", "pending", "declined"]) {
      const db = withDb([{ partner_id: "james", status }]);
      const res = await POST(req({ partnerId: "james", action: "pass" }));
      expect(await res.json()).toEqual({ passed: { partnerId: "james" } });
      expect(db.calls.filter((c) => c.op !== "select")).toHaveLength(0);
    }
  });

  it("records a pass for someone new", async () => {
    const db = withDb([]);
    await POST(req({ partnerId: "james", action: "pass" }));
    expect(db.calls.find((c) => c.op === "upsert")?.payload).toMatchObject({ status: "passed", partner_id: "james" });
  });

  it("sends a like as a request the partner answers later, without opening them yet", async () => {
    const db = withDb([]);
    const res = await POST(req({ partnerId: "james", action: "like" }));
    expect(res.status).toBe(200);
    const upsert = db.calls.find((c) => c.op === "upsert")!;
    expect(upsert.payload).toMatchObject({ status: "pending", partner_id: "james", matched_at: null });
    const decideIn = Date.parse((upsert.payload as { decide_at: string }).decide_at) - Date.now();
    expect(decideIn).toBeGreaterThan(0);
    expect(decideIn).toBeLessThanOrEqual(60_000); // first like, partner free: within a minute
    expect(db.calls.some((c) => c.table === "profiles" && c.op === "update")).toBe(false);
  });

  it("keeps an existing match as it is", async () => {
    const db = withDb([{ partner_id: "james", status: "matched", matched_at: "2026-11-01T00:00:00Z" }]);
    const res = await POST(req({ partnerId: "james", action: "like" }));
    expect((await res.json()).match.matchedAt).toBe("2026-11-01T00:00:00Z");
    expect(db.calls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("doesn't let a declined partner be asked again", async () => {
    const db = withDb([{ partner_id: "james", status: "declined" }]);
    const res = await POST(req({ partnerId: "james", action: "like" }));
    expect(await res.json()).toEqual({ declined: { partnerId: "james" } });
    expect(db.calls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("rejects an unknown partner", async () => {
    withDb([]);
    expect((await POST(req({ partnerId: "nobody", action: "like" }))).status).toBe(400);
  });

  it("requires a session", async () => {
    session.current = { supabase: null, user: null, profile: null };
    expect((await POST(req({ partnerId: "james", action: "like" }))).status).toBe(401);
  });
});

describe("PUT /api/discover (skip ahead a day)", () => {
  it("moves the simulated clock one day, only from the day the page saw", async () => {
    const db = withDb([]);
    await PUT();
    const update = db.calls.find((c) => c.table === "profiles" && c.op === "update")!;
    expect(update.payload).toEqual({ day_offset: 1 });
    expect(update.filters).toContainEqual(["eq", "day_offset", 0]);
  });
});

describe("DELETE /api/discover (start over)", () => {
  it("clears passes only", async () => {
    const db = withDb([]);
    await DELETE();
    const del = db.calls.find((c) => c.op === "delete");
    expect(del?.filters).toEqual(expect.arrayContaining([["eq", "status", "passed"], ["eq", "user_id", "u1"]]));
  });
});
