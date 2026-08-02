import { PlannerError } from "@/lib/daily-planner/errors";

export class GoogleNotConnectedError extends PlannerError {
  constructor(message = "Connect a Google account to sync the spreadsheet") {
    super(message, "GOOGLE_NOT_CONNECTED", 409);
  }
}

export class GoogleSyncError extends PlannerError {
  constructor(message = "The Google Sheets request failed") {
    super(message, "GOOGLE_SYNC_ERROR", 502);
  }
}
