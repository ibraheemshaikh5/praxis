import { getDatabaseClient } from "@/lib/db/client";

import { BuildNotesService } from "./service";

export function getBuildNotesService() {
  return new BuildNotesService(getDatabaseClient().db);
}
