import { getDatabaseClient } from "@/lib/db/client";

import { CoursesService } from "./service";

export function getCoursesService() {
  return new CoursesService(getDatabaseClient().db);
}
