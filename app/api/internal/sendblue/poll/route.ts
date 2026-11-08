import { after, NextResponse } from "next/server";

import { requireMaintenanceAuthorization, routeError } from "@/lib/api/routes";
import {
  readAssistantConfig,
  SmsNotConfiguredError,
  type AssistantConfig,
} from "@/lib/sms/config";
import { pollSendblue } from "@/lib/sms/poll";
import { createPollDeps } from "@/lib/sms/runtime";

// A poll answers up to a few texts in turn, each one a Claude round trip.
// This bounds the background work started below.
export const maxDuration = 60;

/**
 * Checks the Sendblue line for new texts and answers them. Sendblue's free
 * plan has no webhooks, so a scheduler calls this every minute with
 * `Authorization: Bearer <MAINTENANCE_SECRET>`. GET is accepted because that
 * is what Vercel Cron sends.
 *
 * The scheduler is answered at once and the poll runs in `after()`: answering
 * texts can outlast a scheduler's request timeout (30 seconds on
 * cron-job.org), which would otherwise count as a failed run. Overlapping
 * polls are safe because a text is claimed by recording it before it is
 * answered.
 */
async function poll(request: Request) {
  try {
    requireMaintenanceAuthorization(request);
    const config = readAssistantConfig();
    if (!config) throw new SmsNotConfiguredError();

    after(() => runPoll(config));
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    return routeError(error);
  }
}

async function runPoll(config: AssistantConfig) {
  try {
    const result = await pollSendblue(createPollDeps(config));
    if (result.answered > 0) console.info("Sendblue poll", result);
  } catch (error) {
    console.error("Sendblue poll failed", error);
  }
}

export const GET = poll;
export const POST = poll;
