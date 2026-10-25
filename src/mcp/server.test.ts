import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, writesEnabled } from "./server.ts";

const READ_TOOLS = ["attendance", "chat", "doctor", "events", "kids", "lunch", "today", "whoami"];

// Point config at an empty temp dir so tests never see a real login.
let dir: string;
let prevDir: string | undefined;
beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "vala-mcp-test-"));
	prevDir = process.env.VALA_CONFIG_DIR;
	process.env.VALA_CONFIG_DIR = dir;
});
afterAll(() => {
	if (prevDir === undefined) delete process.env.VALA_CONFIG_DIR;
	else process.env.VALA_CONFIG_DIR = prevDir;
	rmSync(dir, { recursive: true, force: true });
});

async function connect(enableWrites: boolean): Promise<Client> {
	const [clientT, serverT] = InMemoryTransport.createLinkedPair();
	await createServer({ enableWrites }).connect(serverT);
	const client = new Client({ name: "vala-test", version: "0.0.0" });
	await client.connect(clientT);
	return client;
}

describe("MCP server (in-memory)", () => {
	test("read-only tool set by default", async () => {
		const client = await connect(false);
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(READ_TOOLS);
		await client.close();
	});

	test("register_absence only appears with writes enabled", async () => {
		const client = await connect(true);
		const tools = (await client.listTools()).tools;
		expect(tools.map((t) => t.name).sort()).toEqual([...READ_TOOLS, "register_absence"].sort());
		const reg = tools.find((t) => t.name === "register_absence");
		expect(reg?.inputSchema.required).toContain("confirm");
		await client.close();
	});

	test("register_absence rejects calls without confirm: true", async () => {
		const client = await connect(true);
		const res = await client.callTool({ name: "register_absence", arguments: { type: "sick" } });
		expect(res.isError).toBe(true);
		await client.close();
	});

	test("invalid date is rejected", async () => {
		const client = await connect(false);
		const res = await client.callTool({ name: "lunch", arguments: { date: "tomorrow" } });
		expect(res.isError).toBe(true);
		await client.close();
	});

	test("reports missing login as a tool error", async () => {
		const client = await connect(false);
		const res = await client.callTool({ name: "kids", arguments: {} });
		expect(res.isError).toBe(true);
		expect(JSON.stringify(res.content)).toContain("Not authenticated");
		await client.close();
	});

	test("doctor works without login", async () => {
		const client = await connect(false);
		const res = await client.callTool({ name: "doctor", arguments: {} });
		expect(res.isError).toBeFalsy();
		const text = (res.content as { text: string }[])[0]?.text ?? "";
		expect(JSON.parse(text).status).toBe("fail");
		await client.close();
	});

	test("writesEnabled reads VALA_MCP_ENABLE_WRITES", () => {
		expect(writesEnabled({})).toBe(false);
		expect(writesEnabled({ VALA_MCP_ENABLE_WRITES: "1" })).toBe(true);
	});
});

test("`vala serve` stdio handshake", async () => {
	const client = new Client({ name: "vala-test", version: "0.0.0" });
	try {
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: ["src/index.ts", "serve"],
				cwd: join(import.meta.dir, "..", ".."),
				env: { ...(process.env as Record<string, string>), VALA_CONFIG_DIR: dir },
				stderr: "pipe",
			}),
		);
		expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(READ_TOOLS);
	} finally {
		await client.close();
	}
});
