export class ApplicationError extends Error {
  override name = 'ApplicationError';
}

/** Rejected input. `field` is the dotted path of the offending field, when known. */
export class ValidationError extends ApplicationError {
  override name = 'ValidationError';
  readonly field: string | null;
  constructor(message: string, field: string | null = null) {
    super(message);
    this.field = field;
  }
}

export class NotFoundError extends ApplicationError {
  override name = 'NotFoundError';
}

export class WorkspaceAlreadyExistsError extends ApplicationError {
  override name = 'WorkspaceAlreadyExistsError';
  constructor() {
    super('A workspace already exists on this device.');
  }
}

export class NoWorkspaceError extends ApplicationError {
  override name = 'NoWorkspaceError';
  constructor() {
    super('There is no workspace on this device yet.');
  }
}

export class ConfirmationMismatchError extends ApplicationError {
  override name = 'ConfirmationMismatchError';
  constructor() {
    super('The confirmation text does not match the workspace name.');
  }
}
