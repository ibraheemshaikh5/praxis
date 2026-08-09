import { PlannerError } from "@/lib/daily-planner/errors";

export class DispatchNotConfiguredError extends PlannerError {
  constructor(message = "Agent dispatch is not configured") {
    super(message, "DISPATCH_NOT_CONFIGURED", 503);
  }
}

export class DispatchRateLimitedError extends PlannerError {
  constructor(message = "The agent run limit has been reached") {
    super(message, "DISPATCH_RATE_LIMITED", 429);
  }
}

export class DispatchError extends PlannerError {
  constructor(message = "The agent could not be started") {
    super(message, "DISPATCH_FAILED", 502);
  }
}
