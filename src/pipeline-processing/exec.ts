export class PipelineException extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PipelineException";
    Object.setPrototypeOf(this, PipelineException.prototype);
  }
}

export class ClientException extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ClientException";
    Object.setPrototypeOf(this, ClientException.prototype);
  }
}

export class DatabaseExecption extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "DatabaseExecption";
    Object.setPrototypeOf(this, DatabaseExecption.prototype);
  }
}

export class RetrivalExecption extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "RetrivalExecption";
    Object.setPrototypeOf(this, RetrivalExecption.prototype);
  }
}
