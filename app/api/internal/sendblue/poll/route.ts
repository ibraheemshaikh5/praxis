import { NextResponse } from "next/server";

import { requireMaintenanceAuthorization, routeError } from "@/lib/api/routes";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { getProfileTimeZone } from "@/lib/planner/profile";
import { readSendblueConfig } from "@/lib/sms/config";
import { pollSendblue } from "@/lib/sms/poll";
import {
  getSmsConversationService,
  getSmsMessageCreator,
} from "@/lib/sms/runtime";

// A poll answers up to a few texts in turn, each one a Claude round trip.
export const maxDuration = 60;

/**
 * Checks the Sendblue line for new texts and answers them. Sendblue's free
 * plan has no webhooks, so a scheduler calls this every minute with
 * `Authorization: Bearer <MAINTENANCE_SECRET>`. GET is accepted because that
 * is what Vercel Cron sends.
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

    const result = await pollSendblue({
      config,
      conversation: getSmsConversationService(),
      planner: getDailyPlannerService(),
      client: getSmsMessageCreator(),
      timeZone: await getProfileTimeZone(config.assistant.ownerUserId),
    });
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export const GET = poll;
export const POST = poll;
