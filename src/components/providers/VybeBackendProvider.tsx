"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/data-mode";
import { createClient } from "@/lib/supabase/client";
import { getSupabasePlatformService } from "@/services";
import { useVybeStore } from "@/store/useVybeStore";

const PUBLIC_ROUTES = new Set(["/", "/login", "/signup", "/forgot-password", "/reset-password"]);

export function VybeBackendProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hydrateCloud = useVybeStore((state) => state.hydrateCloud);
  const cloudReady = useVybeStore((state) => state.cloudReady);
  const settings = useVybeStore((state) => state.settings);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const client = createClient();
    const scheduleHydrate = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void hydrateCloud(), 120);
    };

    void client.auth.getUser().then(({ data }) => {
      if (data.user) void hydrateCloud();
    });

    const { data: authListener } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") scheduleHydrate();
    });

    return () => {
      authListener.subscription.unsubscribe();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [hydrateCloud]);

  useEffect(() => {
    if (!hasSupabaseEnv() || !cloudReady) return;
    let unsubscribe: (() => void) | undefined;
    const service = getSupabasePlatformService();
    const scheduleHydrate = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void hydrateCloud(), 160);
    };
    void service.subscribeToPrivateData(scheduleHydrate).then((cleanup) => { unsubscribe = cleanup; });
    return () => unsubscribe?.();
  }, [cloudReady, hydrateCloud]);

  useEffect(() => {
    if (!hasSupabaseEnv() || !cloudReady) return;
    const service = getSupabasePlatformService();
    const update = (online: boolean) => void service.setPresence(settings.showOnlineStatus && settings.presenceVisibility !== "hidden" && online).catch(() => undefined);
    update(document.visibilityState === "visible");
    const onVisibility = () => update(document.visibilityState === "visible");
    const onPageHide = () => update(false);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    const heartbeat = window.setInterval(() => update(document.visibilityState === "visible"), 45_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.clearInterval(heartbeat);
      update(false);
    };
  }, [cloudReady, settings.presenceVisibility, settings.showOnlineStatus]);

  useEffect(() => {
    if (PUBLIC_ROUTES.has(pathname)) return;
    // Route protection is enforced server-side by proxy.ts; this keeps client data fresh after navigation.
    if (cloudReady) void hydrateCloud();
  }, [pathname, cloudReady, hydrateCloud]);

  return children;
}
