export class PlannerError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AuthenticationError extends PlannerError {
  constructor(message = "Authentication required") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class NotFoundError extends PlannerError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ConflictError extends PlannerError {
  constructor(message = "The resource changed; refresh and try again") {
    super(message, "VERSION_CONFLICT", 409);
  }
}

export class ValidationError extends PlannerError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 422);
  }
}

export class StorageError extends PlannerError {
  constructor(message = "Attachment storage operation failed") {
    super(message, "STORAGE_ERROR", 502);
  }
}
