import type { SupabaseClient } from "@supabase/supabase-js";

/** One recorded query: table, operation, payload and filters, e.g. eq("status", "matched"). */
export type Call = {
  table: string;
  op: "select" | "insert" | "upsert" | "update" | "delete";
  payload?: unknown;
  filters: [string, string, unknown][];
};

type Result = { data?: unknown; error?: unknown; count?: number };

/**
 * A minimal stand-in for the Supabase query builder. Every chain is recorded in
 * `calls`; `respond` decides what each finished query resolves to.
 */
export function fakeSupabase(respond: (call: Call) => Result = () => ({ data: null, error: null })) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      const builder = {
        select: () => builder,
        insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), builder),
        upsert: (payload: unknown) => ((call.op = "upsert"), (call.payload = payload), builder),
        update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), builder),
        delete: () => ((call.op = "delete"), builder),
        eq: (col: string, val: unknown) => (call.filters.push(["eq", col, val]), builder),
        neq: (col: string, val: unknown) => (call.filters.push(["neq", col, val]), builder),
        in: (col: string, val: unknown) => (call.filters.push(["in", col, val]), builder),
        order: () => builder,
        limit: () => builder,
        single: () => builder,
        maybeSingle: () => builder,
        then(resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) {
          calls.push(call);
          return Promise.resolve({ data: null, error: null, ...respond(call) }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}
