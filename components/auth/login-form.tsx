"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";
type Pending = null | "credentials" | "google";

export function LoginForm({ initialError = "" }: { initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("sign-in");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState(initialError);
  const [notice, setNotice] = React.useState("");
  const [pending, setPending] = React.useState<Pending>(null);

  const signingIn = mode === "sign-in";
  const busy = pending !== null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    setPending("credentials");

    try {
      const supabase = createBrowserSupabaseClient();
      const credentials = { email: cleanEmail, password };
      const { data, error: authError } = signingIn
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

      if (authError) {
        setError(authError.message);
        return;
      }

      // Sign-up returns no session when email confirmation is enabled.
      if (!data.session) {
        setNotice("Check your email to confirm the account, then sign in.");
        setMode("sign-in");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setPending(null);
    }
  }

  async function onGoogle() {
    setError("");
    setNotice("");
    setPending("google");

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });

      // A successful call navigates away, so the pending state is only cleared
      // on the paths that keep the user here.
      if (authError) {
        setError(authError.message);
        setPending(null);
      }
    } catch {
      setError("Could not reach the server. Check your connection.");
      setPending(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[22rem]">
      <div className="rounded-2xl border border-border bg-card/90 p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Check className="size-4" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tracking-tight">Praxis</p>
            <p className="text-xs text-muted-foreground">Daily planner</p>
          </div>
        </div>

        <h1 className="mt-7 text-2xl font-semibold tracking-[-0.03em]">
          {signingIn ? "Sign in" : "Create your account"}
        </h1>

        <Button
          className="mt-7 w-full"
          disabled={busy}
          onClick={onGoogle}
          type="button"
          variant="outline"
        >
          {pending === "google" ? (
            <LoaderCircle
              className="animate-spin motion-reduce:animate-none"
              data-icon="inline-start"
            />
          ) : (
            <GoogleMark />
          )}
          Continue with Google
        </Button>

        <div className="mt-6 flex items-center gap-3">
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>

        <form className="mt-6" noValidate onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              aria-invalid={Boolean(error)}
              autoComplete="email"
              disabled={busy}
              id="email"
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError("");
              }}
              type="email"
              value={email}
            />
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              aria-describedby={signingIn ? undefined : "password-hint"}
              aria-invalid={Boolean(error)}
              autoComplete={signingIn ? "current-password" : "new-password"}
              disabled={busy}
              id="password"
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError("");
              }}
              type="password"
              value={password}
            />
            {signingIn ? null : (
              <p className="text-xs text-muted-foreground" id="password-hint">
                At least 6 characters.
              </p>
            )}
          </div>

          <div aria-live="polite" className="empty:hidden">
            {error ? (
              <p className="mt-4 text-sm text-destructive">{error}</p>
            ) : null}
            {notice ? (
              <p className="mt-4 text-sm text-foreground">{notice}</p>
            ) : null}
          </div>

          <Button className="mt-6 w-full" disabled={busy} type="submit">
            {pending === "credentials" ? (
              <>
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  data-icon="inline-start"
                />
                {signingIn ? "Signing in" : "Creating account"}
              </>
            ) : signingIn ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          {signingIn ? "No account yet?" : "Already have an account?"}{" "}
          <Button
            className="h-auto p-0 align-baseline"
            disabled={busy}
            onClick={() => {
              setMode(signingIn ? "sign-up" : "sign-in");
              setError("");
              setNotice("");
            }}
            type="button"
            variant="link"
          >
            {signingIn ? "Create one" : "Sign in"}
          </Button>
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden data-icon="inline-start" viewBox="0 0 48 48">
      <path
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        fill="#4285F4"
      />
      <path
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        fill="#34A853"
      />
      <path
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
        fill="#FBBC05"
      />
      <path
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        fill="#EA4335"
      />
    </svg>
  );
}
