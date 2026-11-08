import { after, NextResponse } from "next/server";

import { requireMaintenanceAuthorization, routeError } from "@/lib/api/routes";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { getProfileTimeZone } from "@/lib/planner/profile";
import { readSendblueConfig } from "@/lib/sms/config";
import { pollSendblue } from "@/lib/sms/poll";
import {
  getSmsConversationService,
  getSmsMessageCreator,
} from "@/lib/sms/runtime";
import { sendblueLine } from "@/lib/sms/sendblue";

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

    const config = readSendblueConfig();
    if (!config) {
      return NextResponse.json(
        {
          error: {
            code: "SMS_NOT_CONFIGURED",
            message: "Sendblue is not configured",
          },
        },
        { status: 503 },
      );
    }

    after(async () => {
      try {
        const result = await pollSendblue({
          config,
          line: sendblueLine(config.sendblue, config.assistant.ownerPhone),
          conversation: getSmsConversationService(),
          planner: getDailyPlannerService(),
          client: getSmsMessageCreator(),
          timeZone: await getProfileTimeZone(config.assistant.ownerUserId),
        });
        if (result.answered > 0) console.info("Sendblue poll", result);
      } catch (error) {
        console.error("Sendblue poll failed", error);
      }
    });
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    return routeError(error);
  }
}

export const GET = poll;
export const POST = poll;
