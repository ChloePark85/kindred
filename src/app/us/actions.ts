"use server";

import { refresh } from "next/cache";
import { getSession } from "@/lib/supabase/server";

/** Permanently deletes one of the signed-in user's memories. */
export async function forgetMemory(memoryId: string): Promise<{ error: string | null }> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Please sign in again to continue." };
  if (typeof memoryId !== "string" || memoryId.length === 0) return { error: "That note couldn't be found." };

  const { error } = await supabase.from("memories").delete().eq("id", memoryId).eq("user_id", user.id);
  if (error) return { error: "We couldn't forget that note. Please try again." };

  refresh();
  return { error: null };
}
