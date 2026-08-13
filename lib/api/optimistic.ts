import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Runs a cache edit ahead of the server's answer. In-flight fetches for the
 * given keys are cancelled first so a response that was already on the wire
 * cannot clobber the edit, and every query matching the keys is snapshotted.
 * The returned function restores that snapshot; call it when the write is
 * rejected.
 */
export async function applyOptimistically(
  client: QueryClient,
  queryKeys: QueryKey[],
  edit: () => void,
): Promise<() => void> {
  await Promise.all(
    queryKeys.map((queryKey) => client.cancelQueries({ queryKey })),
  );

  const snapshot = queryKeys.flatMap((queryKey) =>
    client.getQueriesData({ queryKey }),
  );

  edit();

  return () => {
    for (const [queryKey, data] of snapshot) {
      client.setQueryData(queryKey, data);
    }
  };
}
