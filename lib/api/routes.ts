import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";

import {
  AuthenticationError,
  PlannerError,
  ValidationError,
} from "@/lib/daily-planner/errors";

export type TaskRouteContext = {
  params: Promise<{ taskId: string }>;
};

export type AttachmentRouteContext = {
  params: Promise<{ attachmentId: string; taskId: string }>;
};

export type ApplicationRouteContext = {
  params: Promise<{ applicationId: string }>;
};

export type ReadingItemRouteContext = {
  params: Promise<{ itemId: string }>;
};

export async function parseJson<T>(request: Request, schema: ZodType<T>) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  return parseInput(schema, body);
}

export function parseQuery<T>(request: Request, schema: ZodType<T>) {
  const values = Object.fromEntries(new URL(request.url).searchParams);
  return parseInput(schema, values);
}

export function parseUuid(value: string, label: string) {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) throw new ValidationError(`${label} must be a UUID`);
  return result.data;
}

export async function resolveTaskId(context: TaskRouteContext) {
  const { taskId } = await context.params;
  return parseUuid(taskId, "taskId");
}

export async function resolveAttachmentIds(context: AttachmentRouteContext) {
  const { attachmentId, taskId } = await context.params;
  return {
    attachmentId: parseUuid(attachmentId, "attachmentId"),
    taskId: parseUuid(taskId, "taskId"),
  };
}

export async function resolveApplicationId(context: ApplicationRouteContext) {
  const { applicationId } = await context.params;
  return parseUuid(applicationId, "applicationId");
}

export async function resolveReadingItemId(context: ReadingItemRouteContext) {
  const { itemId } = await context.params;
  return parseUuid(itemId, "itemId");
}

export function jsonCreated(data: unknown) {
  return NextResponse.json(data, { status: 201 });
}

export function routeError(error: unknown) {
  if (error instanceof PlannerError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  console.error("Unhandled API error", error);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    },
    { status: 500 },
  );
}

export function requireMaintenanceAuthorization(request: Request) {
  const configured = process.env.MAINTENANCE_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const configuredBytes = Buffer.from(configured ?? "");
  const providedBytes = Buffer.from(provided ?? "");

  if (
    !configured ||
    !provided ||
    configuredBytes.length !== providedBytes.length ||
    !timingSafeEqual(configuredBytes, providedBytes)
  ) {
    throw new AuthenticationError();
  }
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  throw new ValidationError(`${path}${issue.message}`);
}
