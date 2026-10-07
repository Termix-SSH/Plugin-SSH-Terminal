import { EventEmitter } from "node:events";

/** Stands in for ssh2's Client: records connect() and lets a test drive events. */
export class FakeSshClient extends EventEmitter {
  connectConfig: Record<string, unknown> | null = null;
  static instances: FakeSshClient[] = [];

  constructor() {
    super();
    FakeSshClient.instances.push(this);
  }

  connect(config: Record<string, unknown>) {
    this.connectConfig = config;
    return this;
  }

  end() {}
  destroy() {}
}

/** A ws socket that records what the server sends and lets a test send back. */
export class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: string[] = [];
  closedWith: number | null = null;

  send(message: string) {
    this.sent.push(message);
  }

  close(code = 1000) {
    this.closedWith = code;
    this.readyState = 3;
    this.emit("close");
  }

  ping() {}

  terminate() {
    this.close(1006);
  }

  message(type: string, data?: unknown) {
    this.emit("message", Buffer.from(JSON.stringify({ type, data })));
  }

  messages(): Array<Record<string, unknown>> {
    return this.sent.map((m) => JSON.parse(m));
  }
}
