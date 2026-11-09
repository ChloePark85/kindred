import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Call } from "./fakeSupabase";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ getSession: async () => session.current }));

const { POST, DELETE } = await import("@/app/api/discover/route");

function useDb(existingMatch: { status: string; matched_at: string | null } | null) {
  const db = fakeSupabase((call: Call) =>
    call.table === "matches" && call.op === "select" ? { data: existingMatch } : { data: null },
  );
  session.current = { supabase: db.client, user: { id: "u1" }, profile: { id: "u1", partner_id: null } };
  return db;
}

const req = (body: unknown) => new Request("http://test/api/discover", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/discover", () => {
  beforeEach(() => {
    session.current = null;
  });

  it("never turns an existing match into a pass", async () => {
    const db = useDb({ status: "matched", matched_at: "2026-11-01T00:00:00Z" });
    const res = await POST(req({ partnerId: "james", action: "pass" }));
    expect(await res.json()).toEqual({ passed: { partnerId: "james" } });
    expect(db.calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("records a pass for someone not matched", async () => {
    const db = useDb(null);
    await POST(req({ partnerId: "james", action: "pass" }));
    expect(db.calls.find((c) => c.op === "upsert")?.payload).toMatchObject({ status: "passed", partner_id: "james" });
  });

  it("keeps the original match date when liking someone again", async () => {
    const db = useDb({ status: "matched", matched_at: "2026-11-01T00:00:00Z" });
    const res = await POST(req({ partnerId: "james", action: "like" }));
    expect((await res.json()).match.matchedAt).toBe("2026-11-01T00:00:00Z");
    expect(db.calls.find((c) => c.op === "upsert")?.payload).toMatchObject({ matched_at: "2026-11-01T00:00:00Z" });
  });

  it("matches on like and makes the partner the open one", async () => {
    const db = useDb({ status: "passed", matched_at: null });
    await POST(req({ partnerId: "james", action: "like" }));
    expect(db.calls.find((c) => c.op === "upsert")?.payload).toMatchObject({ status: "matched", partner_id: "james" });
    expect(db.calls.find((c) => c.table === "profiles" && c.op === "update")?.payload).toEqual({ partner_id: "james" });
  });

  it("leaves the open partner alone when saving the match fails", async () => {
    const db = fakeSupabase((call: Call) =>
      call.table === "matches" && call.op === "upsert" ? { error: { message: "boom" } } : { data: null },
    );
    session.current = { supabase: db.client, user: { id: "u1" }, profile: { id: "u1", partner_id: "walter" } };
    const res = await POST(req({ partnerId: "james", action: "like" }));
    expect(res.status).toBe(500);
    expect(db.calls.some((c) => c.table === "profiles" && c.op === "update")).toBe(false);
  });

  it("rejects an unknown partner", async () => {
    useDb(null);
    expect((await POST(req({ partnerId: "nobody", action: "like" }))).status).toBe(400);
  });

  it("requires a session", async () => {
    session.current = { supabase: null, user: null, profile: null };
    expect((await POST(req({ partnerId: "james", action: "like" }))).status).toBe(401);
  });
});

describe("DELETE /api/discover (start over)", () => {
  it("clears passes only, never matches", async () => {
    const db = useDb(null);
    await DELETE();
    const del = db.calls.find((c) => c.op === "delete");
    expect(del?.filters).toEqual(expect.arrayContaining([["eq", "status", "passed"], ["eq", "user_id", "u1"]]));
  });
});
