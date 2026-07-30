export const TASK_ATTACHMENTS_BUCKET = "task-attachments";

export type UploadTarget = {
  path: string;
  signedUrl: string;
  token: string;
};

export interface AttachmentStorage {
  createUploadTarget(path: string): Promise<UploadTarget>;
  objectExists(path: string): Promise<boolean>;
  remove(paths: string[]): Promise<void>;
}
