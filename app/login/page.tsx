import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in to Praxis",
};

const ERRORS: Record<string, string> = {
  google: "Could not sign in with Google. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 planner-grid opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 planner-wash"
      />
      <div className="relative z-10 w-full">
        <LoginForm initialError={error ? (ERRORS[error] ?? "") : ""} />
      </div>
    </main>
  );
}
