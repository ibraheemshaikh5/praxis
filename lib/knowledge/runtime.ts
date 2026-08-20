import { getDatabaseClient } from "@/lib/db/client";

import { KnowledgeService } from "./service";

export function getKnowledgeService() {
  return new KnowledgeService(getDatabaseClient().db);
}
