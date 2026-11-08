import { after, NextResponse } from "next/server";

import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { getProfileTimeZone } from "@/lib/planner/profile";
import { readTwilioConfig } from "@/lib/sms/config";
import { replyToText, screenInbound } from "@/lib/sms/inbound";
import {
  getSmsConversationService,
  getSmsMessageCreator,
} from "@/lib/sms/runtime";
import { emptyTwimlResponse, sendSms } from "@/lib/sms/twilio";

// The reply is produced after the webhook is acknowledged; this bounds that.
export const maxDuration = 60;

/**
 * Twilio's incoming-message webhook. Twilio waits at most 15 seconds and
 * retries on failure, while a reply can take longer than that, so the text is
 * recorded (which also de-duplicates retries), acknowledged at once, and
 * answered with a separate outbound message.
 */
export async function POST(request: Request) {
  const config = readTwilioConfig();
  if (!config) {
    return NextResponse.json(
      {
        error: { code: "SMS_NOT_CONFIGURED", message: "SMS is not configured" },
      },
      { status: 503 },
    );
  }

  let params: Record<string, string>;
  try {
    const form = await request.formData();
    params = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return new Response(null, { status: 400 });
  }

  const decision = screenInbound(
    config,
    config.webhookUrl ?? request.url,
    params,
    request.headers.get("x-twilio-signature"),
  );
  if (decision.kind === "rejected") {
    return new Response(null, { status: decision.status });
  }
  if (decision.kind === "ignored") return emptyTwimlResponse();

  const conversation = getSmsConversationService();
  const { assistant } = config;
  const inbound = await conversation.recordInbound(
    assistant.ownerUserId,
    decision.providerSid,
    decision.body,
  );
  if (!inbound) return emptyTwimlResponse();

  after(async () => {
    try {
      await replyToText({
        assistant,
        conversation,
        planner: getDailyPlannerService(),
        client: getSmsMessageCreator(),
        timeZone: await getProfileTimeZone(assistant.ownerUserId),
        inboundId: inbound.id,
        text: decision.body,
        send: async (body) => {
          const { sid } = await sendSms(
            config.twilio,
            assistant.ownerPhone,
            body,
          );
          return { providerSid: sid };
        },
      });
    } catch (error) {
      console.error("SMS reply failed", error);
    }
  });

  return emptyTwimlResponse();
}
