"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("sign-in");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const signingIn = mode === "sign-in";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    setPending(true);

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
      setPending(false);
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
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {signingIn
            ? "Open your planner and pick up where you left off."
            : "Save your days to one account."}
        </p>

        <form className="mt-7" noValidate onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              aria-invalid={Boolean(error)}
              autoComplete="email"
              disabled={pending}
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
              disabled={pending}
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

          <Button className="mt-6 w-full" disabled={pending} type="submit">
            {pending ? (
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
            disabled={pending}
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
