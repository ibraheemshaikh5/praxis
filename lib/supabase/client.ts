import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    requirePublicEnvironment(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    requirePublicEnvironment(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  );
}

// Next.js only inlines process.env members referenced statically, so the value
// is read at the call site rather than looked up by name.
function requirePublicEnvironment(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
