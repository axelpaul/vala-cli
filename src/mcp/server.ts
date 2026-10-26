import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { items, toValaDate, ValaClient } from "../lib/api.ts";
import { addDays, dayKey, isoDate, parseValaDate, todayIso } from "../lib/format.ts";
import { loadAuth, loadConfig, saveConfig } from "../lib/storage.ts";

const result = (data: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(data) }],
});
const error = (value: unknown) => ({
	isError: true,
	content: [
		{ type: "text" as const, text: value instanceof Error ? value.message : "Vala lookup failed." },
	],
});

function client(): ValaClient {
	const auth = loadAuth();
	if (!auth) throw new Error("Not authenticated. Run vala login privately in your own terminal.");
	return ValaClient.fromAuth(auth);
}

export function createServer(
	makeClient = client,
	writes = process.env.VALA_MCP_ENABLE_WRITES === "1",
) {
	const server = new McpServer({ name: "vala", version: "0.1.0" });
	const dateSchema = z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.refine((value) => {
			const parsed = new Date(`${value}T00:00:00Z`);
			return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
		}, "Invalid calendar date");
	server.registerTool(
		"kids",
		{
			description:
				"List children on the signed-in Vala parent account. Omits kennitala and detailed profile data.",
			inputSchema: {},
		},
		async () => {
			try {
				const children = items(await makeClient().getAllChildren());
				return result({
					children: children.map((child) => ({
						id: child.child_id,
						name: child.name,
						school: child.school_name,
					})),
				});
			} catch (e) {
				return error(e);
			}
		},
	);

	server.registerTool(
		"lunch",
		{
			description:
				"Read a child's lunch menu and eating rating for one Icelandic calendar date. Read-only; no absence or account changes.",
			inputSchema: {
				date: dateSchema.optional(),
				childId: z.number().int().positive().optional(),
				week: z.boolean().optional(),
			},
		},
		async ({ date, childId, week }) => {
			try {
				const selectedDate = isoDate(date || todayIso());
				const api = makeClient();
				const [attendance, menu] = await Promise.all([
					api.getAttendance(week ? addDays(selectedDate, -6) : selectedDate, selectedDate),
					api.getMenu(week ? addDays(selectedDate, -6) : selectedDate, selectedDate),
				]);
				const schools = items(menu);
				return result({
					date: selectedDate,
					...(week
						? {
								firstDay: addDays(selectedDate, -6),
								attendance: items(attendance).filter(
									(c) => childId === undefined || c.child_id === childId,
								),
								menus: schools,
							}
						: {}),
					children: items(attendance)
						.filter((child) => childId === undefined || child.child_id === childId)
						.map((child) => ({
							id: child.child_id,
							name: child.child_name,
							school: child.school_name,
							menu:
								schools
									.find((school) => school.school === child.school_name)
									?.menu.find((day) => dayKey(day.menu_date) === selectedDate)?.lunch ?? null,
							eat:
								child.attendance.find(
									(segment) => dayKey(segment.time_from) === selectedDate && segment.eat,
								)?.eat ?? null,
						})),
				});
			} catch (e) {
				return error(e);
			}
		},
	);

	const childSchema = z.number().int().positive();
	server.registerTool(
		"whoami",
		{ description: "Read current user profile (private account data).", inputSchema: {} },
		async () => {
			try {
				return result(items(await makeClient().getUser())[0] ?? null);
			} catch (e) {
				return error(e);
			}
		},
	);
	server.registerTool(
		"attendance",
		{
			description: "Read attendance for an exact child ID and date.",
			inputSchema: { date: dateSchema.optional(), childId: childSchema.optional() },
		},
		async ({ date, childId }) => {
			try {
				const d = date ?? todayIso();
				return result({
					date: d,
					items: items(await makeClient().getAttendance(d, d)).filter(
						(c) => childId === undefined || c.child_id === childId,
					),
				});
			} catch (e) {
				return error(e);
			}
		},
	);
	server.registerTool(
		"today",
		{
			description: "Today's combined attendance and menu.",
			inputSchema: { childId: childSchema.optional() },
		},
		async ({ childId }) => {
			try {
				const d = todayIso();
				const api = makeClient();
				const [attendance, menu] = await Promise.all([api.getAttendance(d, d), api.getMenu(d, d)]);
				return result({
					date: d,
					children: items(attendance).filter(
						(c) => childId === undefined || c.child_id === childId,
					),
					menus: items(menu),
				});
			} catch (e) {
				return error(e);
			}
		},
	);
	server.registerTool(
		"events",
		{
			description: "Read calendar events with inclusive date range; defaults to next 30 days.",
			inputSchema: {
				from: dateSchema.optional(),
				to: dateSchema.optional(),
				days: z.number().int().positive().optional(),
				childId: childSchema.optional(),
			},
		},
		async ({ from, to, days, childId }) => {
			try {
				const start = from ?? todayIso();
				const end = to ?? addDays(start, (days ?? 30) - 1);
				if (end < start) throw new Error("to must not precede from");
				const api = makeClient();
				const child =
					childId === undefined
						? undefined
						: items(await api.getAllChildren()).find((c) => c.child_id === childId);
				if (childId !== undefined && !child) throw new Error("Child not found");
				return result({
					from: start,
					to: end,
					items: items(await api.getCalendarEvents(start, end)).filter(
						(c) => !child || (c.child_name === child.name && c.school_name === child.school_name),
					),
				});
			} catch (e) {
				return error(e);
			}
		},
	);
	server.registerTool(
		"chat",
		{
			description:
				"Read recent school messages for an exact child ID; never sends or marks messages read.",
			inputSchema: { childId: childSchema, limit: z.number().int().positive().default(20) },
		},
		async ({ childId, limit }) => {
			try {
				const api = makeClient();
				const child = items(await api.getAllChildren()).find((c) => c.child_id === childId);
				if (!child?.school_id) throw new Error("Child/school not found");
				const messages = await api.getChatMessages(child.school_id, childId);
				return result({
					childId,
					messages: [...messages]
						.sort(
							(a, b) =>
								(parseValaDate(a.created)?.getTime() ?? 0) -
								(parseValaDate(b.created)?.getTime() ?? 0),
						)
						.slice(-limit),
				});
			} catch (e) {
				return error(e);
			}
		},
	);
	server.registerTool(
		"absence_types",
		{ description: "Read exact absence reason IDs before registering absence.", inputSchema: {} },
		async () => {
			try {
				return result(items(await makeClient().getAbsenceTypes()));
			} catch (e) {
				return error(e);
			}
		},
	);

	server.registerTool(
		"doctor",
		{
			description:
				"Read cached auth readiness and API reachability, without exposing tokens or initiating login.",
			inputSchema: {},
		},
		async () => {
			try {
				const auth = loadAuth();
				if (!auth) return result({ authenticated: false, action: "Run vala login privately" });
				const children = items(await makeClient().getAllChildren());
				return result({
					authenticated: true,
					api: true,
					children: children.length,
					validTo: auth.validTo ?? null,
				});
			} catch (e) {
				return error(e);
			}
		},
	);
	if (writes)
		server.registerTool(
			"set_default_child",
			{
				description:
					"Change local CLI default child using an exact ID. Requires opt-in and confirmation.",
				inputSchema: { childId: childSchema, confirm: z.boolean() },
			},
			async ({ childId, confirm }) => {
				try {
					if (confirm !== true) throw new Error("confirm=true required");
					const child = items(await makeClient().getAllChildren()).find(
						(c) => c.child_id === childId,
					);
					if (!child) throw new Error("Child not found");
					saveConfig({ ...loadConfig(), defaultChildId: childId, defaultChildName: child.name });
					return result({ defaultChildId: childId });
				} catch (e) {
					return error(e);
				}
			},
		);
	if (writes)
		server.registerTool(
			"absent",
			{
				description:
					"Register absence. Requires opt-in, confirm=true and exact child/reason IDs; no fuzzy matching.",
				inputSchema: {
					childId: childSchema,
					absenceTypeId: childSchema,
					date: dateSchema,
					comment: z.string().optional(),
					confirm: z.boolean(),
				},
			},
			async (args) => {
				try {
					return result(await registerAbsence(makeClient, args, writes));
				} catch (e) {
					return error(e);
				}
			},
		);
	return server;
}

export async function registerAbsence(
	makeClient: () => ValaClient,
	args: {
		childId: number;
		absenceTypeId: number;
		date: string;
		comment?: string;
		confirm: boolean;
	},
	writes: boolean,
) {
	if (!writes || args.confirm !== true)
		throw new Error("Writes require explicit opt-in and confirm=true");
	const date = args.date;
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
		new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
	)
		throw new Error("Invalid date");
	if (
		!Number.isInteger(args.childId) ||
		args.childId <= 0 ||
		!Number.isInteger(args.absenceTypeId) ||
		args.absenceTypeId <= 0
	)
		throw new Error("Exact positive IDs required");
	const api = makeClient();
	const child = items(await api.getAllChildren()).find((c) => c.child_id === args.childId);
	if (!child?.placement_id) throw new Error("Child has no active placement");
	const reason = items(await api.getAbsenceTypes()).find(
		(t) => t.absence_type_id === args.absenceTypeId,
	);
	if (!reason) throw new Error("Unknown absence type ID");
	return api.postAbsence({
		child_id: child.child_id,
		placement_id: child.placement_id,
		date: toValaDate(date),
		absence_comment: args.comment ?? null,
		absence_type_id: reason.absence_type_id,
	});
}
export async function serve(): Promise<void> {
	await createServer().connect(new StdioServerTransport());
}
