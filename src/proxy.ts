import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  // Must match the session cookie configured in src/lib/auth/auth-options.ts. Without this,
  // getToken guesses the name from NEXTAUTH_URL (https => "__Secure-" prefix), which breaks
  // sign-in in development mode behind an https tunnel and causes a login redirect loop.
  const secure = process.env.NODE_ENV === "production";
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: secure,
    cookieName: secure ? "__Secure-next-auth.session-token" : "next-auth.session-token",
  });
  if (token) return NextResponse.next();
  const login = new URL("/login", process.env.APP_BASE_URL ?? request.nextUrl.origin);
  login.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin/:path*"],
};
