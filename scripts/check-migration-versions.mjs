import { readdirSync } from "node:fs";

// Supabase keys applied migrations by the version prefix alone, so two files
// sharing one prefix leave the second recorded as applied and never run.
const DIRECTORY = "supabase/migrations";
const FILE_NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

const files = readdirSync(DIRECTORY)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const errors = [];
const byVersion = new Map();

for (const file of files) {
  const match = FILE_NAME.exec(file);
  if (!match) {
    errors.push(`${DIRECTORY}/${file}: expected <14-digit version>_<name>.sql`);
    continue;
  }

  const version = match[1];
  byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
}

for (const [version, group] of byVersion) {
  if (group.length > 1) {
    errors.push(
      `${version} is used by ${group.length} migrations: ${group.join(", ")}`,
    );
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}
