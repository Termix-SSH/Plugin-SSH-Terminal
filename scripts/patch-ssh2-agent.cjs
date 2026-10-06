// Core patches ssh2 the same way on install and hands that copy to plugins at
// runtime. Tests run against this repo's own ssh2, so it needs the patch too.
const fs = require("node:fs");

const original = `            default: {
              const req = new AgentInboundRequest(msgType);
              this[SYM_REQS].push(req);
              this.failureReply(req);
            }`;
const patched = `            default: {
              const req = new AgentInboundRequest(msgType);
              this[SYM_REQS].push(req);
              this.failureReply(req);
              // Discard the entire unsupported request, including its payload.
              p += this[SYM_MSGLEN] - 1;
            }`;

let target;
try {
  target = require.resolve("ssh2/lib/agent.js");
} catch {
  process.exit(0);
}
const source = fs.readFileSync(target, "utf8");
if (!source.includes(patched)) {
  if (!source.includes(original)) {
    throw new Error(
      "ssh2 agent parser changed; review the unsupported-request patch",
    );
  }
  fs.writeFileSync(target, source.replace(original, patched));
}
