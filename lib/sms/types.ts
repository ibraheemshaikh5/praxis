/** One text in the conversation, as the agent replays it. */
export type HistoryTurn = {
  direction: "inbound" | "outbound";
  body: string;
  toolLog: string | null;
};

/**
 * Where texts and replies are recorded. Recording an inbound text is also the
 * claim on it: a provider id already recorded returns null, so a retried
 * webhook or an overlapping poll never answers the same text twice.
 */
export type ConversationStore = {
  recordInbound(
    userId: string,
    providerSid: string,
    body: string,
  ): Promise<{ id: string } | null>;
  recordOutbound(
    userId: string,
    providerSid: string | null,
    body: string,
    toolLog: string | null,
  ): Promise<unknown>;
  recentHistory(userId: string, excludeId: string): Promise<HistoryTurn[]>;
  /**
   * Takes the owner's poll lease for the given time, returning a token to
   * release it with, or null while another poll holds it.
   */
  acquirePollLease(userId: string, ttlMs: number): Promise<string | null>;
  releasePollLease(userId: string, token: string): Promise<void>;
};
