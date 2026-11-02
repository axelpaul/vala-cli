import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("Vala MCP handshake and read-only tools", async () => {
	const client = new Client({ name: "vala-test", version: "0.1.0" });
	try {
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: ["src/index.ts", "serve"],
				cwd: process.cwd(),
				stderr: "pipe",
			}),
		);
		expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
			"absence_types",
			"attendance",
			"chat",
			"doctor",
			"events",
			"kids",
			"lunch",
			"today",
			"whoami",
		]);
		const invalid = await client.callTool({ name: "lunch", arguments: { date: "tomorrow" } });
		expect(invalid.isError).toBe(true);
	} finally {
		await client.close();
	}
});

import type { ValaClient } from "../lib/api.ts";
import { registerAbsence } from "./server.ts";

test("absence refuses without opt-in/confirmation before any API client is created", async () => {
	let calls = 0;
	const factory = () => {
		calls++;
		throw new Error("must not create API client");
	};
	const args = { childId: 1, absenceTypeId: 2, date: "2026-10-20", confirm: true };
	await expect(registerAbsence(factory, args, false)).rejects.toThrow("opt-in");
	await expect(registerAbsence(factory, { ...args, confirm: false }, true)).rejects.toThrow(
		"confirm",
	);
	await expect(registerAbsence(factory, { ...args, date: "2026-02-30" }, true)).rejects.toThrow(
		"Invalid date",
	);
	expect(calls).toBe(0);
});

test("absence validates exact resources and posts only the approved fixture", async () => {
	const posted: unknown[] = [];
	const api = {
		getAllChildren: async () => [{ child_id: 1, placement_id: 7 }],
		getAbsenceTypes: async () => [{ absence_type_id: 2 }],
		postAbsence: async (body: unknown) => {
			posted.push(body);
			return { ok: true };
		},
	} as unknown as ValaClient;
	const args = { childId: 1, absenceTypeId: 2, date: "2026-10-20", confirm: true };
	await expect(registerAbsence(() => api, { ...args, childId: 9 }, true)).rejects.toThrow(
		"placement",
	);
	await expect(registerAbsence(() => api, { ...args, absenceTypeId: 9 }, true)).rejects.toThrow(
		"Unknown",
	);
	expect(posted).toHaveLength(0);
	await registerAbsence(() => api, args, true);
	expect(posted).toEqual([
		{ child_id: 1, placement_id: 7, date: "20.10.2026", absence_comment: null, absence_type_id: 2 },
	]);
});
