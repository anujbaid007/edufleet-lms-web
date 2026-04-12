import { cookies } from "next/headers";
import type { Lang } from "@/lib/i18n";

/**
 * Read the current language from the ui_language cookie (server-side only).
 * In Next.js 14, cookies() is synchronous.
 * Falls back to "en" if cookie is missing or invalid.
 */
export function getServerLang(): Lang {
  try {
    const val = cookies().get("ui_language")?.value;
    if (val === "en" || val === "hi") return val;
  } catch {
    // cookies() throws outside a request context (e.g. during build)
  }
  return "en";
}
