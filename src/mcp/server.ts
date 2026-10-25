// vala MCP server (stdio). Started with `vala serve`.
//
// Every tool is backed by the same functions the CLI commands use
// (src/lib/queries.ts). Read tools are always available. The one write tool
// (register_absence) is only registered when VALA_MCP_ENABLE_WRITES=1, and it
// additionally requires `confirm: true` in the call.
//
// Never write to stdout here except via the transport; diagnostics go to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from "../../package.json" with { type: "json" };
import { ValaClient } from "../lib/api.ts";
import {
	fetchAttendance,
	fetchChat,
	fetchChildren,
	fetchEvents,
	fetchLunch,
	fetchToday,
	fetchUser,
	prepareAbsence,
	runDoctor,
	submitAbsence,
} from "../lib/queries.ts";
import { loadAuth } from "../lib/storage.ts";

export const WRITES_ENV = "VALA_MCP_ENABLE_WRITES";

export function writesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[WRITES_ENV] === "1";
}

const result = (data: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(data) }],
});
const error = (value: unknown) => ({
	isError: true,
	content: [
		{
			type: "text" as const,
			text: value instanceof Error ? value.message : "Vala request failed.",
		},
	],
});

function client(): ValaClient {
	const auth = loadAuth();
	if (!auth) throw new Error("Not authenticated. Run `vala login` privately in your own terminal.");
	return ValaClient.fromAuth(auth);
}

async function run(fn: () => Promise<unknown>) {
	try {
		return result(await fn());
	} catch (e) {
		return error(e);
	}
}

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
	.describe("Date as YYYY-MM-DD (Iceland time = UTC).");
const childArg = z
	.string()
	.min(1)
	.describe(
		"Child id or case-insensitive substring of the child's name (same as the CLI's --child). Defaults to the saved default child, else all children.",
	);

export function createServer(opts: { enableWrites?: boolean } = {}): McpServer {
	const server = new McpServer({ name: "vala", version: pkg.version });

	server.registerTool(
		"whoami",
		{
			description:
				"Show the signed-in Vala parent (name, email, language). Kennitala and phone number are deliberately omitted.",
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		() =>
			run(async () => {
				const user = await fetchUser(client());
				return user
					? {
							user_id: user.user_id,
							name: user.name,
							email: user.email ?? null,
							language: user.language,
						}
					: null;
			}),
	);

	server.registerTool(
		"kids",
		{
			description:
				"List children on the signed-in Vala parent account with school and opening hours. Omits kennitala.",
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		() =>
			run(async () => ({
				children: (await fetchChildren(client())).map((c) => ({
					id: c.child_id,
					name: c.name,
					school: c.school_name,
					school_id: c.school_id,
					hour_from: c.hour_from,
					hour_to: c.hour_to,
				})),
			})),
	);

	server.registerTool(
		"lunch",
		{
			description:
				"Lunch menu and how well each child ate (eat: verygood | good | average | didnot | null) for a date, or the 7 days ending on it (weekdays only). Defaults to today.",
			inputSchema: {
				date: isoDate.optional(),
				week: z.boolean().optional().describe("Return the 7 days ending on `date`."),
				child: childArg.optional(),
			},
			annotations: { readOnlyHint: true },
		},
		({ date, week, child }) =>
			run(async () => (await fetchLunch(client(), { date, week, child })).result),
	);

	server.registerTool(
		"attendance",
		{
			description:
				"Attendance segments for a day: arrival/departure times, sleep, eat rating, staff comments and absence rows. Defaults to today.",
			inputSchema: { date: isoDate.optional(), child: childArg.optional() },
			annotations: { readOnlyHint: true },
		},
		({ date, child }) => run(async () => (await fetchAttendance(client(), { date, child })).result),
	);

	server.registerTool(
		"today",
		{
			description:
				"Today's snapshot: attendance segments per child plus each school's menu (breakfast, lunch, afternoon).",
			inputSchema: { child: childArg.optional() },
			annotations: { readOnlyHint: true },
		},
		({ child }) => run(async () => (await fetchToday(client(), { child })).result),
	);

	server.registerTool(
		"events",
		{
			description:
				"School calendar events (planning days, parent meetings, holidays). Defaults to the next 30 days from today.",
			inputSchema: {
				from: isoDate.optional().describe("Start date (YYYY-MM-DD). Defaults to today."),
				to: isoDate.optional().describe("End date (YYYY-MM-DD). Overrides `days`."),
				days: z.number().int().min(1).max(366).optional().describe("Range length. Default 30."),
				child: childArg.optional(),
			},
			annotations: { readOnlyHint: true },
		},
		({ from, to, days, child }) =>
			run(async () => (await fetchEvents(client(), { from, to, days, child })).result),
	);

	server.registerTool(
		"chat",
		{
			description:
				"Recent chat messages between the parent and the school, per child, oldest first. user_opened = null means unread.",
			inputSchema: {
				child: childArg.optional(),
				limit: z
					.number()
					.int()
					.min(1)
					.max(500)
					.optional()
					.describe("Latest N messages per child. Default 20."),
			},
			annotations: { readOnlyHint: true },
		},
		({ child, limit }) => run(async () => (await fetchChat(client(), { child, limit })).result),
	);

	server.registerTool(
		"doctor",
		{
			description:
				"Pre-flight check: local login state, token expiry, API reachable, children visible. Use first when other tools fail.",
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		() => run(() => runDoctor((token) => new ValaClient({ token }))),
	);

	if (opts.enableWrites) {
		server.registerTool(
			"register_absence",
			{
				description:
					"WRITE: register an absence (sick / vacation) for a child at their preschool. The school is notified. Confirm child, date and reason with the user first, then call with confirm: true.",
				inputSchema: {
					type: z
						.string()
						.min(1)
						.describe(
							"Absence type: 'sick', 'vacation', an Icelandic name (veikindi, frí) or a numeric absence_type_id.",
						),
					date: isoDate.optional().describe("Day of absence (YYYY-MM-DD). Defaults to today."),
					child: childArg
						.optional()
						.describe(
							"Child id or name substring. Required if the account has several children and no default.",
						),
					comment: z.string().max(500).optional().describe("Optional note to the school."),
					confirm: z.literal(true).describe("Must be true; confirms the user approved this write."),
				},
				annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			},
			({ type, date, child, comment }) =>
				run(async () => {
					const api = client();
					const prepared = await prepareAbsence(api, { type, date, child, comment });
					return {
						...(await submitAbsence(api, prepared)),
						child: { id: prepared.child.child_id, name: prepared.child.name },
						reason: prepared.type.absence_type,
					};
				}),
		);
	}

	return server;
}

export async function serve(): Promise<void> {
	const enableWrites = writesEnabled();
	const server = createServer({ enableWrites });
	await server.connect(new StdioServerTransport());
	console.error(`vala MCP server ${pkg.version} ready (writes ${enableWrites ? "on" : "off"})`);
}
