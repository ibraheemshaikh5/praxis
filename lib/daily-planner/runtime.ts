import { getDatabaseClient } from "@/lib/db/client";

import { DailyPlannerService } from "./service";

export function getDailyPlannerService() {
  return new DailyPlannerService(getDatabaseClient().db);
}
