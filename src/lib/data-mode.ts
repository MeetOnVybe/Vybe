export type DataMode = "demo" | "supabase";

export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getDataMode(): DataMode {
  const configured = process.env.NEXT_PUBLIC_VYBE_DATA_MODE;
  if (configured === "demo") return "demo";
  if (configured === "supabase") return "supabase";

  // A configured Supabase project must never silently fall back to demo mode in
  // local development. Demo data is available only when explicitly requested or
  // when no Supabase browser configuration exists at all.
  if (hasSupabaseEnv()) return "supabase";
  return process.env.NODE_ENV === "production" ? "supabase" : "demo";
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
}
