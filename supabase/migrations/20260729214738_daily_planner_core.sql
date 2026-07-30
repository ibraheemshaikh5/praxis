CREATE TYPE "public"."attachment_upload_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."planner_entry_closure_reason" AS ENUM('moved', 'unscheduled');--> statement-breakpoint
CREATE TABLE "planner_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"planner_date" date NOT NULL,
	"position" integer DEFAULT 1024 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"time_zone" text DEFAULT 'America/New_York' NOT NULL,
	"closed_at" timestamp with time zone,
	"closure_reason" "planner_entry_closure_reason",
	"moved_from_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planner_entries_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "planner_entries_moved_from_entry_key" UNIQUE("moved_from_entry_id"),
	CONSTRAINT "planner_entries_position_positive_check" CHECK ("planner_entries"."position" > 0),
	CONSTRAINT "planner_entries_time_zone_not_blank" CHECK (length(trim("planner_entries"."time_zone")) > 0),
	CONSTRAINT "planner_entries_time_range_check" CHECK (
        ("planner_entries"."starts_at" is null and "planner_entries"."ends_at" is null)
        or (
          "planner_entries"."starts_at" is not null
          and ("planner_entries"."ends_at" is null or "planner_entries"."ends_at" > "planner_entries"."starts_at")
          and timezone("planner_entries"."time_zone", "planner_entries"."starts_at")::date = "planner_entries"."planner_date"
          and (
            "planner_entries"."ends_at" is null
            or timezone("planner_entries"."time_zone", "planner_entries"."ends_at")::date = "planner_entries"."planner_date"
          )
        )
      ),
	CONSTRAINT "planner_entries_closure_check" CHECK (
        (
          "planner_entries"."closed_at" is null
          and "planner_entries"."closure_reason" is null
        )
        or (
          "planner_entries"."closed_at" is not null
          and "planner_entries"."closure_reason" = 'unscheduled'
        )
        or (
          "planner_entries"."closed_at" is not null
          and "planner_entries"."closure_reason" = 'moved'
        )
      ),
	CONSTRAINT "planner_entries_not_own_predecessor_check" CHECK ("planner_entries"."moved_from_entry_id" is null or "planner_entries"."moved_from_entry_id" <> "planner_entries"."id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"time_zone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_time_zone_not_blank" CHECK (length(trim("profiles"."time_zone")) > 0)
);
--> statement-breakpoint
CREATE TABLE "task_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"upload_status" "attachment_upload_status" DEFAULT 'pending' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_attachments_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "task_attachments_storage_path_key" UNIQUE("storage_path"),
	CONSTRAINT "task_attachments_file_name_length_check" CHECK (length(trim("task_attachments"."file_name")) between 1 and 255),
	CONSTRAINT "task_attachments_byte_size_check" CHECK ("task_attachments"."byte_size" between 1 and 26214400),
	CONSTRAINT "task_attachments_mime_type_check" CHECK ("task_attachments"."mime_type" in (
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'application/pdf',
        'text/plain',
        'text/markdown'
      ))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "tasks_title_length_check" CHECK (length(trim("tasks"."title")) between 1 and 500),
	CONSTRAINT "tasks_notes_length_check" CHECK ("tasks"."notes" is null or length("tasks"."notes") <= 50000),
	CONSTRAINT "tasks_version_positive_check" CHECK ("tasks"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "planner_entries" ADD CONSTRAINT "planner_entries_task_owner_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_entries" ADD CONSTRAINT "planner_entries_moved_from_owner_fk" FOREIGN KEY ("moved_from_entry_id","user_id") REFERENCES "public"."planner_entries"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_owner_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "planner_entries_one_active_per_task_idx" ON "planner_entries" USING btree ("task_id") WHERE "planner_entries"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "planner_entries_active_day_order_idx" ON "planner_entries" USING btree ("user_id","planner_date","position") WHERE "planner_entries"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "planner_entries_day_history_idx" ON "planner_entries" USING btree ("user_id","planner_date","created_at");--> statement-breakpoint
CREATE INDEX "task_attachments_task_idx" ON "task_attachments" USING btree ("user_id","task_id","deleted_at");--> statement-breakpoint
CREATE INDEX "task_attachments_pending_idx" ON "task_attachments" USING btree ("created_at") WHERE "task_attachments"."upload_status" = 'pending';--> statement-breakpoint
CREATE INDEX "tasks_user_state_idx" ON "tasks" USING btree ("user_id","deleted_at","completed_at");--> statement-breakpoint
CREATE INDEX "tasks_user_created_idx" ON "tasks" USING btree ("user_id","created_at");