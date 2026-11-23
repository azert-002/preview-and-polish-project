// 100% Offline Protected Local Database Client for Beyond Words.
// Completely replaces Supabase Cloud with offline local storage and security.
import { localSupabase } from "@/lib/local-db/local-client";
import type { Database } from "./types";

export type { Database };

/**
 * Returns true because Beyond Words operates entirely with the protected local offline database.
 */
export function isLocalDbMode(): boolean {
  return true;
}

export function setLocalDbMode(_enabled: boolean) {
  // Always local offline
}

/**
 * Beyond Words client.
 * Provides identical API to Supabase JS client but executes 100% locally.
 * Usage: import { supabase } from "@/integrations/supabase/client";
 */
export const supabase = localSupabase as unknown as {
  from: typeof localSupabase.from;
  auth: typeof localSupabase.auth;
  rpc: typeof localSupabase.rpc;
  exportLocalData: typeof localSupabase.exportLocalData;
  restoreLocalData: typeof localSupabase.restoreLocalData;
};
