import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { createAndSyncApplication } from "@/lib/applications/create";
import { getApplicationsService } from "@/lib/applications/runtime";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { getDatabaseClient } from "@/lib/db/client";
import { getProfileTimeZone } from "@/lib/planner/profile";

import type { AssistantConfig } from "./config";
import { firecrawlPostingReader } from "./firecrawl";
import type { PollDeps } from "./poll";
import { sendblueLine } from "./sendblue";
import { SmsConversationService } from "./service";

/**
 * Wires the poller to Sendblue, the database, the planner, the application
 * tracker, Firecrawl and Claude.
 */
export function createPollDeps(config: AssistantConfig): PollDeps {
  let timeZone: Promise<string> | undefined;
  return {
    config,
    line: sendblueLine(config.sendblue, config.ownerPhone),
    conversation: new SmsConversationService(getDatabaseClient().db),
    planner: getDailyPlannerService(),
    applications: {
      list: (userId) => getApplicationsService().listApplications(userId, {}),
      create: createAndSyncApplication,
      readPosting: config.firecrawlApiKey
        ? firecrawlPostingReader(config.firecrawlApiKey)
        : undefined,
    },
    // Reads ANTHROPIC_API_KEY from the environment.
    client: new Anthropic().beta.messages,
    // A quiet poll answers nothing, so it never queries the profile.
    timeZone: () => (timeZone ??= getProfileTimeZone(config.ownerUserId)),
  };
}
