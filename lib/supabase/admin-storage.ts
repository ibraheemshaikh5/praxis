import { createClient } from "@supabase/supabase-js";

import { StorageError } from "@/lib/daily-planner/errors";
import {
  TASK_ATTACHMENTS_BUCKET,
  type AttachmentStorage,
} from "@/lib/daily-planner/storage";

const REMOVE_BATCH_SIZE = 1000;

export function createAdminAttachmentStorage(): AttachmentStorage {
  const supabase = createClient(
    requireEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const bucket = supabase.storage.from(TASK_ATTACHMENTS_BUCKET);

  return {
    async createUploadTarget(path) {
      const { data, error } = await bucket.createSignedUploadUrl(path);
      if (error) throw new StorageError(error.message);
      return {
        path: data.path,
        signedUrl: data.signedUrl,
        token: data.token,
      };
    },

    async objectExists(path) {
      const separator = path.lastIndexOf("/");
      const directory = separator === -1 ? "" : path.slice(0, separator);
      const fileName = separator === -1 ? path : path.slice(separator + 1);
      const { data, error } = await bucket.list(directory, {
        limit: 100,
        search: fileName,
      });
      if (error) throw new StorageError(error.message);
      return data.some(({ name }) => name === fileName);
    },

    async remove(paths) {
      for (let offset = 0; offset < paths.length; offset += REMOVE_BATCH_SIZE) {
        const batch = paths.slice(offset, offset + REMOVE_BATCH_SIZE);
        const { error } = await bucket.remove(batch);
        if (error) throw new StorageError(error.message);
      }
    },
  };
}

function requireEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
