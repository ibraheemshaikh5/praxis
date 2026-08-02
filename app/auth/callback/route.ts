import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // A dismissed consent screen is a choice, not a failure to report.
  if (error === "access_denied") return backToLogin(request, null);
  if (error || !code) return backToLogin(request, "google");

  const supabase = await createServerSupabaseClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) return backToLogin(request, "google");

  return NextResponse.redirect(new URL("/", request.url));
}

function backToLogin(request: Request, reason: string | null) {
  const destination = new URL("/login", request.url);
  if (reason) destination.searchParams.set("error", reason);

  return NextResponse.redirect(destination);
}
