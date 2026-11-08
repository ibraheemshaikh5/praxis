import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { getDatabaseClient } from "@/lib/db/client";

import { SmsConversationService } from "./service";

export function getSmsConversationService() {
  return new SmsConversationService(getDatabaseClient().db);
}

export function getSmsMessageCreator() {
  // Reads ANTHROPIC_API_KEY from the environment.
  return new Anthropic().beta.messages;
}
