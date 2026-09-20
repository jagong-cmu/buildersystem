import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAuth } from "@/lib/dropbox/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = createAuth();
  if (!auth) return NextResponse.redirect(new URL("/library?error=not_configured", request.url));
  const redirectUri = new URL("/api/dropbox/callback", request.url).toString();
  const url = (await auth.getAuthenticationUrl(redirectUri, undefined, "code", "offline", undefined, "none", true))
    .replace("https://dropbox.com/", "https://www.dropbox.com/");
  const verifier = auth.getCodeVerifier();
  if (verifier) {
    (await cookies()).set("dbx_pkce", verifier, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });
  }
  return NextResponse.redirect(url);
}
