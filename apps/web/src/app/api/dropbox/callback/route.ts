import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAuth, encryptCookie, REFRESH_COOKIE } from "@/lib/dropbox/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const target = new URL("/library", request.url);
  const secret = process.env.DROPBOX_COOKIE_SECRET;
  if (!secret) {
    target.searchParams.set("error", "no_cookie_secret");
    return NextResponse.redirect(target);
  }
  const code = new URL(request.url).searchParams.get("code");
  const verifier = (await cookies()).get("dbx_pkce")?.value;
  const auth = createAuth();
  if (!code || !verifier || !auth) {
    target.searchParams.set("error", "missing_callback");
    return NextResponse.redirect(target);
  }
  try {
    auth.setCodeVerifier(verifier);
    const response = await auth.getAccessTokenFromCode(new URL("/api/dropbox/callback", request.url).toString(), code);
    const refreshToken = (response.result as { refresh_token?: string }).refresh_token;
    const encrypted = refreshToken ? encryptCookie(refreshToken) : null;
    if (!encrypted) {
      target.searchParams.set("error", "no_cookie_secret");
      return NextResponse.redirect(target);
    }
    const store = await cookies();
    store.set(REFRESH_COOKIE, encrypted, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    store.delete("dbx_pkce");
    target.searchParams.set("connected", "1");
  } catch (error) {
    target.searchParams.set("error", (error as Error).message);
  }
  return NextResponse.redirect(target);
}
