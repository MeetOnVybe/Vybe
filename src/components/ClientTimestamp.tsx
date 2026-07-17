"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

export function ClientTimestamp({ value, format = "time", fallback = "Just now" }: { value: string; format?: "time" | "dateTime"; fallback?: string }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  if (!hydrated) return <span>{fallback}</span>;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>{fallback}</span>;
  const label = format === "dateTime"
    ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return <span>{label}</span>;
}
