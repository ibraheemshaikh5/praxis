import { getDatabaseClient } from "@/lib/db/client";

import { ReadingService } from "./service";

export function getReadingService() {
  return new ReadingService(getDatabaseClient().db);
}
