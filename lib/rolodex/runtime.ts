import { getDatabaseClient } from "@/lib/db/client";

import { RolodexService } from "./service";

export function getRolodexService() {
  return new RolodexService(getDatabaseClient().db);
}
