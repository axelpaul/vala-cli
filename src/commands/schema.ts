// vala schema — print the JSON response shape for a given command.
//
// Agents can call `vala schema today --json` once to learn the shape they'll
// get back from `vala today --json`. Hand-curated rather than reflected — these
// schemas are the contract; tests and types enforce that the real output matches.

import { color, die, isJsonMode, printJson } from "../lib/output.ts";

interface SchemaFlags {
	json?: boolean;
	pretty?: boolean;
	command?: string;
}

interface CommandSchema {
	command: string;
	mutating: boolean;
	requires_auth: boolean;
	shape: unknown;
	example: unknown;
}

const SCHEMAS: Record<string, CommandSchema> = {
	whoami: {
		command: "whoami",
		mutating: false,
		requires_auth: true,
		shape: {
			user_id: "number",
			name: "string",
			ssn: "string",
			email: "string | null",
			phone: "string",
			language: "string",
		},
		example: {
			user_id: 10001,
			name: "Jón Jónsson",
			ssn: "1234567890",
			email: "you@example.com",
			phone: "5555555",
			language: "IS",
		},
	},
	kids: {
		command: "kids",
		mutating: false,
		requires_auth: true,
		shape: {
			children: [
				{
					child_id: "number",
					name: "string",
					ssn: "string",
					placement_id: "number",
					school_id: "number",
					school_name: "string",
					hour_from: "string (HH:MM)",
					hour_to: "string (HH:MM)",
				},
			],
		},
		example: {
			children: [
				{
					child_id: 12345,
					name: "Jóna Jónsdóttir",
					ssn: "0101201230",
					placement_id: 54321,
					school_id: 100,
					school_name: "Dæmiskóli",
					hour_from: "08:00",
					hour_to: "16:30",
				},
			],
		},
	},
	today: {
		command: "today",
		mutating: false,
		requires_auth: true,
		shape: {
			date: "string (YYYY-MM-DD)",
			children: "AttendanceChild[]  (see `vala schema attendance`)",
			menus: [
				{
					school_id: "number",
					school: "string",
					menu: [
						{
							menu_date: "string (ISO)",
							breakfast: "string | null",
							lunch: "string | null",
							afternoon: "string | null",
						},
					],
				},
			],
		},
		example: {
			date: "2026-05-20",
			children: ["see attendance schema"],
			menus: [
				{
					school_id: 100,
					school: "Dæmiskóli",
					menu: [
						{
							menu_date: "2026-05-20T00:00:00Z",
							breakfast: "Hafragrautur, mjólk, rúsínur",
							lunch: "Aðalréttur\nSoðin ýsa…",
							afternoon: "Sólkjarnabrauð, Egg…",
						},
					],
				},
			],
		},
	},
	attendance: {
		command: "attendance",
		mutating: false,
		requires_auth: true,
		shape: {
			date: "string (YYYY-MM-DD)",
			items: [
				{
					child_id: "number",
					child_name: "string",
					school_name: "string",
					attendance: [
						{
							time_from: "string (ISO)",
							time_to: "string (ISO) | null",
							attendance_comment: "string | null",
							sleep_from: "string (ISO) | null",
							sleep_to: "string (ISO) | null",
							sleeping_minutes: "number | null",
							eat: "'didnot' | 'average' | 'good' | 'verygood' | null",
							type: "string  (e.g. 'Mæting', 'Starfsmannaekla')",
							is_absence: "0 | 1",
						},
					],
				},
			],
		},
		example: {
			date: "2026-05-15",
			items: [
				{
					child_id: 12345,
					child_name: "Jóna Jónsdóttir",
					school_name: "Dæmiskóli",
					attendance: [
						{
							time_from: "2026-05-15T08:52:00Z",
							time_to: "2026-05-15T16:17:00Z",
							attendance_comment: null,
							sleep_from: null,
							sleep_to: null,
							sleeping_minutes: null,
							eat: "verygood",
							type: "Mæting",
							is_absence: 0,
						},
					],
				},
			],
		},
	},
	lunch: {
		command: "lunch",
		mutating: false,
		requires_auth: true,
		shape: {
			firstDay: "string (YYYY-MM-DD)",
			lastDay: "string (YYYY-MM-DD)",
			items: [
				{
					date: "string (YYYY-MM-DD)",
					menu: "string | null  (multi-line; Aðalréttur / Veganréttur / Meðlætisbar)",
					eat: "'didnot' | 'average' | 'good' | 'verygood' | null",
					child_name: "string",
					school_name: "string",
				},
			],
		},
		example: {
			firstDay: "2026-05-14",
			lastDay: "2026-05-20",
			items: [
				{
					date: "2026-05-15",
					menu: "Aðalréttur\nÍslensk kjötsúpa og skólabolla\nVeganréttur\n…",
					eat: "verygood",
					child_name: "Jóna Jónsdóttir",
					school_name: "Dæmiskóli",
				},
			],
		},
	},
	events: {
		command: "events",
		mutating: false,
		requires_auth: true,
		shape: {
			from: "string (YYYY-MM-DD)",
			to: "string (YYYY-MM-DD)",
			items: [
				{
					calendar_event_id: "number",
					child_name: "string",
					school_name: "string",
					department_name: "string | null",
					group_name: "string | null",
					start_date: "string (ISO)",
					end_date: "string (ISO)",
					title: "string",
					information: "string | null",
					location: "string | null",
				},
			],
		},
		example: {
			from: "2026-05-20",
			to: "2026-06-19",
			items: [
				{
					calendar_event_id: 2001,
					child_name: "Jóna Jónsdóttir",
					school_name: "Dæmiskóli",
					department_name: null,
					group_name: null,
					start_date: "2026-05-08T07:30:00Z",
					end_date: "2026-05-08T16:30:00Z",
					title: "Skipulagsdagur",
					information: null,
					location: null,
				},
			],
		},
	},
	chat: {
		command: "chat",
		mutating: false,
		requires_auth: true,
		shape: {
			items: [
				{
					child: { id: "number", name: "string", school: "string" },
					messages: [
						{
							id: "number",
							created: "string (DD.MM.YYYY HH:MM)",
							app_user_id: "number",
							app_user_name: "string",
							school_opened: "string | null",
							user_opened: "string | null  (null = unread)",
							message: "string",
						},
					],
				},
			],
		},
		example: {
			items: [
				{
					child: { id: 12345, name: "Jóna Jónsdóttir", school: "Dæmiskóli" },
					messages: [
						{
							id: 1001,
							created: "13.05.2026 10:23",
							app_user_id: 20002,
							app_user_name: "Guðrún Kennari",
							school_opened: "13.05.2026 11:14",
							user_opened: "13.05.2026 10:23",
							message: "Sæki kl. 12 í dag",
						},
					],
				},
			],
		},
	},
	absent: {
		command: "absent",
		mutating: true,
		requires_auth: true,
		shape: {
			registered: "boolean",
			body: {
				child_id: "number",
				placement_id: "number",
				date: "string (DD.MM.YYYY)",
				absence_comment: "string | null",
				absence_type_id: "number  (2 = Veikindi / sick, 3 = Frí / vacation)",
			},
			response: "unknown  (server echoes; see --raw)",
		},
		example: {
			registered: true,
			body: {
				child_id: 12345,
				placement_id: 54321,
				date: "21.05.2026",
				absence_comment: "fever",
				absence_type_id: 2,
			},
			response: null,
		},
	},
	doctor: {
		command: "doctor",
		mutating: false,
		requires_auth: false,
		shape: {
			status: "'ok' | 'warn' | 'fail'",
			checks: [{ name: "string", status: "'ok' | 'warn' | 'fail'", detail: "string" }],
		},
		example: {
			status: "ok",
			checks: [
				{ name: "auth", status: "ok", detail: "Token cached, user: Jón Jónsson" },
				{ name: "api_reachable", status: "ok", detail: "Got /app/user as Jón Jónsson" },
			],
		},
	},
};

export async function schemaCommand(flags: SchemaFlags): Promise<void> {
	const json = isJsonMode(flags);

	if (!flags.command) {
		if (json) {
			printJson({ commands: Object.values(SCHEMAS) });
		} else {
			console.log(color.bold("Schemas available:"));
			for (const name of Object.keys(SCHEMAS)) console.log(`  ${name}`);
			console.log("");
			console.log(color.dim("Run `vala schema <command> --json` for the full shape."));
		}
		return;
	}

	const schema = SCHEMAS[flags.command];
	if (!schema) {
		die(`No schema for "${flags.command}". Known: ${Object.keys(SCHEMAS).join(", ")}`, 64, json);
	}

	if (json) {
		printJson(schema);
		return;
	}

	console.log(color.bold(`vala ${schema.command}`));
	console.log(`  ${color.dim("mutating    ")} ${schema.mutating}`);
	console.log(`  ${color.dim("requires_auth")} ${schema.requires_auth}`);
	console.log("");
	console.log(color.dim("Shape:"));
	console.log(JSON.stringify(schema.shape, null, 2));
	console.log("");
	console.log(color.dim("Example:"));
	console.log(JSON.stringify(schema.example, null, 2));
}
