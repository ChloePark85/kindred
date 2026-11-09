import { describe, expect, it } from "vitest";
import { settleLikes } from "@/lib/likes";
import { fakeSupabase, type Call } from "./fakeSupabase";

const profile = { day_offset: 0, timezone: "UTC", interests: [] as string[] };
const past = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 3 * 60 * 60_000).toISOString();

function db(rows: { partner_id: string; status: string; decide_at: string | null }[], updatedRows = [{}]) {
  return fakeSupabase((call: Call) => {
    if (call.table === "matches" && call.op === "select") return { data: rows };
    if (call.table === "matches" && call.op === "update") return { data: updatedRows };
    return { data: null };
  });
}

describe("settleLikes", () => {
  it("leaves likes alone until the partner's time comes", async () => {
    const { client, calls } = db([{ partner_id: "walter", status: "pending", decide_at: future }]);
    const { decided, pending } = await settleLikes(client, "u1", profile, () => 0);
    expect(decided).toEqual([]);
    expect(pending[0]).toMatchObject({ partnerId: "walter" });
    expect(pending[0].waitMs).toBeGreaterThan(2 * 60 * 60_000);
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("says yes to a first like and opens that partner", async () => {
    const { client, calls } = db([{ partner_id: "walter", status: "pending", decide_at: past }]);
    const { decided } = await settleLikes(client, "u1", profile, () => 0.99);
    expect(decided).toEqual([{ partnerId: "walter", status: "matched" }]);
    const update = calls.find((c) => c.table === "matches" && c.op === "update")!;
    expect(update.payload).toMatchObject({ status: "matched" });
    expect(update.filters).toContainEqual(["eq", "status", "pending"]); // decided only once
    expect(calls.find((c) => c.table === "profiles")?.payload).toEqual({ partner_id: "walter" });
  });

  it("can say no once the user has a match, without opening that partner", async () => {
    const { client, calls } = db([
      { partner_id: "walter", status: "matched", decide_at: null },
      { partner_id: "james", status: "pending", decide_at: past },
    ]);
    const { decided } = await settleLikes(client, "u1", profile, () => 0.99);
    expect(decided).toEqual([{ partnerId: "james", status: "declined" }]);
    expect(calls.some((c) => c.table === "profiles")).toBe(false);
  });

  it("doesn't report a like another request already decided", async () => {
    const { client } = db([{ partner_id: "walter", status: "pending", decide_at: past }], []);
    expect((await settleLikes(client, "u1", profile, () => 0)).decided).toEqual([]);
  });
});
