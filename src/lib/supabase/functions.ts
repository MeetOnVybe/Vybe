"use client";

import type { FunctionsHttpError, SupabaseClient } from "@supabase/supabase-js";

async function functionErrorMessage(error: unknown, fallback: string) {
  const maybeHttpError = error as Partial<FunctionsHttpError> & {
    context?: Response;
    message?: string;
  };
  const response = maybeHttpError.context;
  if (response) {
    try {
      const payload = (await response.clone().json()) as { error?: string; message?: string };
      if (payload.error || payload.message) return payload.error || payload.message || fallback;
    } catch {
      try {
        const text = await response.clone().text();
        if (text.trim()) return text.trim();
      } catch {
        // Fall through to the SDK error message.
      }
    }
  }
  return maybeHttpError.message || fallback;
}

export async function invokeAuthenticatedFunction<T>(
  client: SupabaseClient,
  functionName: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Authentication required");

  const { data: result, error } = await client.functions.invoke(functionName, {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  if (error) throw new Error(await functionErrorMessage(error, fallback));
  return result as T;
}
