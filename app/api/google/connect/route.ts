import { NextResponse } from "next/server";

import { routeError } from "@/lib/api/routes";
import { buildAuthorizationUrl, OAUTH_STATE_COOKIE } from "@/lib/google/oauth";
import { createStateNonce } from "@/lib/google/token-crypto";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUserId();

    const state = createStateNonce();
    const response = NextResponse.redirect(buildAuthorizationUrl(state));

    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 600,
    });

    return response;
  } catch (error) {
    return routeError(error);
  }
}
