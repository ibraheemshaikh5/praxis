import { getDatabaseClient } from "@/lib/db/client";

import { WhiteboardsService } from "./service";

export function getWhiteboardsService() {
  return new WhiteboardsService(getDatabaseClient().db);
}
