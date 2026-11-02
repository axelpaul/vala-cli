import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const binary = fileURLToPath(new URL("../vala", import.meta.url));
const home = mkdtempSync(join(tmpdir(), "vala-mcp-check-"));
const inventories: string[][] = [];
try {
  const version = Bun.spawnSync([binary, "--version"]);
  if (version.exitCode !== 0 || !new TextDecoder().decode(version.stdout).match(/\d+\.\d+\.\d+/)) {
    throw new Error("Compiled CLI --version failed");
  }
  for (const writes of [false, true]) {
    const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
    for (const key of Object.keys(env)) if (key.endsWith("_MCP_ENABLE_WRITES")) env[key] = "0";
    Object.assign(env, { HOME: home, XDG_CONFIG_HOME: join(home, ".config"), VALA_CONFIG_DIR: join(home, ".config", "vala"), VALA_MCP_ENABLE_WRITES: writes ? "1" : "0" });
    const client = new Client({ name: "setup-verification", version: "1.0.0" });
    try {
      await client.connect(new StdioClientTransport({ command: binary, args: ["serve"], env, stderr: "pipe" }), { timeout: 15000 });
      const { tools } = await client.listTools();
      if (!tools.length) throw new Error("Server advertised no tools");
      if (new Set(tools.map(t => t.name)).size !== tools.length) throw new Error("Duplicate tool names");
      for (const tool of tools) {
        if (!tool.description || tool.inputSchema.type !== "object") throw new Error(`Invalid tool metadata: ${tool.name}`);
      }
      inventories.push(tools.map(t => t.name).sort());
    } finally { await client.close(); }
  }
  if (inventories[0]!.some(name => !inventories[1]!.includes(name))) throw new Error("Write opt-in removed read tools");
  const writeOnly = inventories[1]!.filter(name => !inventories[0]!.includes(name));
  if (!writeOnly.length) throw new Error("Expected opt-in write tools");
  console.log(JSON.stringify({ version: true, serve: true, readOnlyTools: inventories[0], optInTools: writeOnly, accountCalls: false }));
} finally { rmSync(home, { recursive: true, force: true }); }
