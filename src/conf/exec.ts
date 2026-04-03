export class SuperBaseException extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SuperBaseException";
    Object.setPrototypeOf(this, SuperBaseException.prototype);
  }
}

export class StorageException extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "StorageException";
    Object.setPrototypeOf(this, StorageException.prototype);
  }
}

export class APIException extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "APIException";
    Object.setPrototypeOf(this, APIException.prototype);
  }
}

export class WorkerException extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "WorkerException";
    Object.setPrototypeOf(this, WorkerException.prototype);
  }
}
