import { describe, expect, it } from "vitest";
import { relabelCallTranscript, requestedPartnerId, resolvePartner } from "@/lib/partner";
import { fakeSupabase } from "./fakeSupabase";

describe("resolvePartner", () => {
  it("uses the open partner without a query when none is requested", async () => {
    const { client, calls } = fakeSupabase();
    const persona = await resolvePartner(client, "u1", "walter", undefined);
    expect(persona?.id).toBe("walter");
    expect(calls).toHaveLength(0);
  });

  it("uses the open partner without a query when the page shows it", async () => {
    const { client, calls } = fakeSupabase();
    expect((await resolvePartner(client, "u1", "walter", "walter"))?.id).toBe("walter");
    expect(calls).toHaveLength(0);
  });

  it("allows another partner only if the user matched with them", async () => {
    const { client, calls } = fakeSupabase(() => ({ data: { id: "m1" } }));
    expect((await resolvePartner(client, "u1", "walter", "james"))?.id).toBe("james");
    expect(calls[0].filters).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", "u1"],
        ["eq", "partner_id", "james"],
        ["eq", "status", "matched"],
      ]),
    );
  });

  it("refuses a partner the user hasn't matched with", async () => {
    const { client } = fakeSupabase(() => ({ data: null }));
    expect(await resolvePartner(client, "u1", "walter", "james")).toBeNull();
  });

  it("reports a failed match check as an error, not as 'not matched'", async () => {
    const { client } = fakeSupabase(() => ({ data: null, error: { message: "connection reset" } }));
    await expect(resolvePartner(client, "u1", "walter", "james")).rejects.toThrow("connection reset");
  });

  it("refuses an unknown partner id without a query", async () => {
    const { client, calls } = fakeSupabase();
    expect(await resolvePartner(client, "u1", "walter", "nobody")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("requestedPartnerId", () => {
  it.each([
    [{ partnerId: "james" }, "james"],
    [{ partnerId: 42 }, undefined],
    [{}, undefined],
    [null, undefined],
    ["james", undefined],
  ])("%j -> %j", (body, expected) => {
    expect(requestedPartnerId(body)).toBe(expected);
  });
});

describe("relabelCallTranscript", () => {
  it("names the user instead of 'You' so the partner never reads the user's words as its own", () => {
    const stored = "Walter: Hi Susan!\nYou: I planted forty tulip bulbs.\nWalter: Forty!";
    expect(relabelCallTranscript(stored, "Susan")).toBe(
      "Walter: Hi Susan!\nSusan: I planted forty tulip bulbs.\nWalter: Forty!",
    );
  });
});
