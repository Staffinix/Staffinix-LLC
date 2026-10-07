import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types.ts";

export type AiUsageOperation =
  | "copilot"
  | "candidate_parse"
  | "requirement_parse"
  | "match_rationale"
  | "resume_tailor"
  | "semantic_search"
  | "requirement_embedding";

const MAX_LOCAL_CONCURRENCY_PER_USER = 2;
const activeByUser = new Map<string, number>();

export async function runWithAiUsageGuard<T>(
  supabase: SupabaseClient<Database>,
  userId: string,
  operation: AiUsageOperation,
  task: () => Promise<T>,
): Promise<T> {
  const active = activeByUser.get(userId) ?? 0;
  if (active >= MAX_LOCAL_CONCURRENCY_PER_USER) {
    throw new Error("Too many AI requests are already running. Try again shortly.");
  }
  activeByUser.set(userId, active + 1);

  try {
    const { error } = await supabase.rpc("reserve_ai_usage", { _operation: operation });
    if (error) throw new Error("AI usage limit reached. Try again after the quota resets.");
    return await task();
  } finally {
    const remaining = (activeByUser.get(userId) ?? 1) - 1;
    if (remaining > 0) activeByUser.set(userId, remaining);
    else activeByUser.delete(userId);
  }
}
