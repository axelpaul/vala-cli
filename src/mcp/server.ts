import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { items, ValaClient } from "../lib/api.ts";
import { dayKey, isoDate, todayIso } from "../lib/format.ts";
import { loadAuth } from "../lib/storage.ts";

const server = new McpServer({ name: "vala", version: "0.1.0" });
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

server.registerTool(
	"kids",
	{
		description:
			"List children on the signed-in Vala parent account. Omits kennitala and detailed profile data.",
		inputSchema: {},
	},
	async () => {
		try {
			const children = items(await client().getAllChildren());
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
			date: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional(),
			childId: z.number().int().positive().optional(),
		},
	},
	async ({ date, childId }) => {
		try {
			const selectedDate = isoDate(date || todayIso());
			const api = client();
			const [attendance, menu] = await Promise.all([
				api.getAttendance(selectedDate, selectedDate),
				api.getMenu(selectedDate, selectedDate),
			]);
			const schools = items(menu);
			return result({
				date: selectedDate,
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

export async function serve(): Promise<void> {
	await server.connect(new StdioServerTransport());
}
