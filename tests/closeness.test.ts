import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Call } from "./fakeSupabase";

const state = vi.hoisted(() => ({ demo: false }));
vi.mock("@/lib/demo", async () => ({
  ...(await vi.importActual<typeof import("@/lib/demoConfig")>("@/lib/demoConfig")),
  isDemo: async () => state.demo,
}));
const { getStage } = await import("@/lib/closeness");

/** A conversation with `messages` user messages and `calls` calls. */
function db(messages: number, calls: number) {
  return fakeSupabase((call: Call) => ({ count: call.filters.some(([, col]) => col === "kind") ? calls : messages })).client;
}

describe("getStage", () => {
  it("counts each message once and each call five times", async () => {
    state.demo = false;
    expect((await getStage(db(7, 0), "u1", "walter")).stage.id).toBe("just_met");
    expect((await getStage(db(3, 1), "u1", "walter")).stage.id).toBe("getting_to_know");
    expect((await getStage(db(7, 0), "u1", "walter")).chatsToNext).toBe(1);
  });

  it("in demo mode, grows within a short demo: second message, then a call", async () => {
    state.demo = true;
    expect((await getStage(db(1, 0), "u1", "walter")).stage.id).toBe("just_met");
    expect((await getStage(db(2, 0), "u1", "walter")).stage.id).toBe("getting_to_know");
    expect((await getStage(db(2, 1), "u1", "walter")).stage.id).toBe("close");
    expect((await getStage(db(1, 0), "u1", "walter")).chatsToNext).toBe(1); // in real chats, not points
  });
});
