import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in to Praxis",
};

export default function LoginPage() {
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
      <div className="relative z-10">
        <LoginForm />
      </div>
    </main>
  );
}
