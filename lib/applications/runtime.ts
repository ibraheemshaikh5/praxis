import { getDatabaseClient } from "@/lib/db/client";

import { ApplicationsService } from "./service";

export function getApplicationsService() {
  return new ApplicationsService(getDatabaseClient().db);
}
