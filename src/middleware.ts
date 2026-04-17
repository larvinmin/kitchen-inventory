import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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

  // Refresh the session — IMPORTANT: don't remove this
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public paths that don't require auth
  const publicPaths = ["/login", "/signup", "/auth/callback"];
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Redirect unauthenticated users to login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/recipes";
    return NextResponse.redirect(url);
  }

  // Onboarding gate: authenticated users without a customized username
  // are funnelled to the profile page until they pick one. This guarantees
  // every social interaction (follows, feed, notifications) has a stable
  // human-readable handle to attach to.
  if (user && !isPublicPath) {
    const path = request.nextUrl.pathname;
    const onboardingExempt =
      path.startsWith("/profile") ||
      path.startsWith("/api/") ||
      path.startsWith("/_next/");

    if (!onboardingExempt) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username_customized")
        .eq("id", user.id)
        .maybeSingle();

      // Send to onboarding if profile is missing entirely (auto-create trigger
      // failed) or hasn't been customized yet.
      if (!profile || profile.username_customized === false) {
        const url = request.nextUrl.clone();
        url.pathname = "/profile";
        url.searchParams.set("onboarding", "1");
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
