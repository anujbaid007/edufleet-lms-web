import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const isAuthPage = request.nextUrl.pathname === "/login";
  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/admin");

  // Fast path: skip auth check for non-protected, non-auth pages
  if (!isAuthPage && !isProtectedRoute) {
    return supabaseResponse;
  }

  // Check if we refreshed recently (within 1 hour) — skip expensive getUser()
  const lastRefresh = request.cookies.get("auth_refreshed_at")?.value;
  const now = Date.now();
  const needsRefresh = !lastRefresh || now - parseInt(lastRefresh, 10) > REFRESH_INTERVAL_MS;

  if (needsRefresh) {
    // Full validation: calls Supabase auth server to verify + refresh token
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && isProtectedRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    if (user && isAuthPage) {
      const url = request.nextUrl.clone();
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "platform_admin" || profile?.role === "org_admin" || profile?.role === "centre_admin") {
        url.pathname = "/admin";
      } else {
        url.pathname = "/dashboard";
      }
      return NextResponse.redirect(url);
    }

    // Stamp the refresh time
    supabaseResponse.cookies.set("auth_refreshed_at", String(now), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60, // 1 hour
      path: "/",
    });
  } else {
    // Cheap path: just read the session from the cookie (no network call)
    const { data: { session } } = await supabase.auth.getSession();

    if (!session && isProtectedRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    if (session && isAuthPage) {
      const url = request.nextUrl.clone();
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile?.role === "platform_admin" || profile?.role === "org_admin" || profile?.role === "centre_admin") {
        url.pathname = "/admin";
      } else {
        url.pathname = "/dashboard";
      }
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
