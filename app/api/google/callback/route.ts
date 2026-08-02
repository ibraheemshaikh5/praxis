import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getApplicationsService } from "@/lib/applications/runtime";
import { routeError } from "@/lib/api/routes";
import {
  exchangeAuthorizationCode,
  forgetAccessToken,
  OAUTH_STATE_COOKIE,
} from "@/lib/google/oauth";
import {
  encryptRefreshToken,
  matchesStateNonce,
} from "@/lib/google/token-crypto";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const url = new URL(request.url);
    const cookieStore = await cookies();
    const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value ?? "";
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code");

    if (url.searchParams.get("error")) {
      return finish(request, "denied");
    }

    if (!code || !matchesStateNonce(expectedState, state)) {
      return finish(request, "invalid_state");
    }

    const grant = await exchangeAuthorizationCode(code);

    await getApplicationsService().saveConnection(userId, {
      googleEmail: grant.googleEmail,
      refreshTokenCiphertext: encryptRefreshToken(grant.refreshToken),
      scope: grant.scope,
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? null,
    });

    // A new grant invalidates any access token cached for the old one.
    forgetAccessToken(userId);

    return finish(request, "connected");
  } catch (error) {
    return routeError(error);
  }
}

function finish(request: Request, result: string) {
  const destination = new URL("/applications", request.url);
  destination.searchParams.set("google", result);

  const response = NextResponse.redirect(destination);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}
