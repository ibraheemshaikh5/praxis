import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback for every page under the root layout. Pages await
 * auth and their first data on the server; this paints the shell's outline
 * immediately instead of holding the previous document.
 */
export default function Loading() {
  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar p-4 lg:block">
        <Skeleton className="h-9 w-32" />
        <div className="mt-8 space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton className="h-9 w-full" key={index} />
          ))}
        </div>
      </aside>

      <main className="px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        <Skeleton className="h-8 w-56" />
        <div className="mt-8 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </main>
    </div>
  );
}
