# Classes API

All routes require a Supabase cookie session and scope to its owner.

## Routes

- `GET /api/courses` returns every class with its exams and recurring work
  nested.
- `POST /api/courses` creates a class (`name`, `term`, `startsOn`, `endsOn`,
  optional `colorKey` and `notes`).
- `GET`, `PATCH`, `DELETE /api/courses/:courseId` read, edit, and remove one.
  `PATCH` takes `expectedVersion` and returns `409 VERSION_CONFLICT` when the
  client is stale.
- `POST /api/courses/:courseId/exams` adds an exam (`title`, `examOn`,
  optional `examTime` as `HH:MM`, `reminderDays` defaulting to `[7, 3, 1]`,
  `notes`). `PATCH` and `DELETE` live at `/exams/:examId`.
- `POST /api/courses/:courseId/assignments` adds recurring work (`title`,
  `weekdays` with 0 as Sunday, optional `dueTime`, `startsOn`, `endsOn`,
  `notes`). `PATCH` and `DELETE` live at `/assignments/:assignmentId`.

## Planner tasks

Every write to an exam or assignment is followed by a pass that brings the
planner in line with it, inside the same transaction:

- An exam writes one task per reminder day ahead of it (`CS 161 · Midterm in
  7 days`, `… tomorrow`) and one on the day (`CS 161 · Midterm`, with a time
  block when the exam has a time).
- Recurring work writes one task per matching weekday from today to the end
  of its range, clamped to the class's term.
- Dates before today are never touched. A task the rule no longer wants is
  soft-deleted like a planner delete, unless it was already completed. A task
  the rule still wants is retitled in place; its time block follows the rule
  only while it still sits on the date the rule put it. A date the rule newly
  wants gets a fresh task.
- A generated task the owner removed in the planner keeps its link and is not
  written back.
- Changing a class's name, colour, or term reruns the pass for every exam and
  assignment it has. Removing a class, exam, or assignment runs it with
  nothing wanted, so upcoming tasks go and completed ones stay.

Generated tasks use the `book` icon and the class colour. Their titles are
owned by the rule: an edit made in the planner is overwritten by the next
pass.
