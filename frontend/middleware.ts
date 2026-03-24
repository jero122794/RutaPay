// frontend/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "rp_session";

const isPublicPath = (pathname: string): boolean => {
  if (pathname === "/" || pathname === "/offline" || pathname === "/favicon.ico" || pathname === "/manifest.json") {
    return true;
  }
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/offline")) {
    return true;
  }
  if (pathname.startsWith("/icons/") || pathname.startsWith("/_next/")) {
    return true;
  }
  if (pathname === "/sw.js" || pathname.startsWith("/workbox-")) {
    return true;
  }
  return false;
};

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE);
  if (!session?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|.*\\.(?:svg|png|ico|webp|json)$).*)"]
};
