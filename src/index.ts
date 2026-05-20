#!/usr/bin/env bun

// vala — CLI for the Vala Leikskóli parent app.

import { absentCommand } from "./commands/absent.ts";
import { attendanceCommand } from "./commands/attendance.ts";
import { chatCommand } from "./commands/chat.ts";
import { eventsCommand } from "./commands/events.ts";
import { kidsCommand } from "./commands/kids.ts";
import { loginCommand } from "./commands/login.ts";
import { logoutCommand } from "./commands/logout.ts";
import { lunchCommand } from "./commands/lunch.ts";
import { todayCommand } from "./commands/today.ts";
import { whoamiCommand } from "./commands/whoami.ts";
import { ApiError, AuthError } from "./lib/api.ts";
import { color, dieAuth } from "./lib/output.ts";

// --- arg parsing ----------------------------------------------------------

function getFlag(name: string): string | undefined {
	const argv = process.argv;
	const prefix = `--${name}=`;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a) continue;
		if (a === `--${name}`) return argv[i + 1];
		if (a.startsWith(prefix)) return a.slice(prefix.length);
	}
	return undefined;
}

function hasFlag(name: string): boolean {
	const argv = process.argv;
	const prefix = `--${name}=`;
	// Exact match on `--name`, or starts with `--name=`. We don't match `--name<other>`
	// as a prefix, so e.g. hasFlag("week") won't wrongly fire on a future `--weekend`.
	return argv.includes(`--${name}`) || argv.some((a) => a.startsWith(prefix));
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const command = positional[0];

const globalFlags = {
	json: hasFlag("json"),
	pretty: hasFlag("pretty"),
};

// --- help -----------------------------------------------------------------

interface CommandSpec {
	name: string;
	description: string;
	usage?: string;
	flags?: { name: string; description: string }[];
}

const COMMANDS: CommandSpec[] = [
	{
		name: "login",
		description: "Authenticate via Auðkenni (rafræn skilríki). Interactive by default.",
		usage: "vala login [--phone <number>]",
		flags: [{ name: "phone", description: "Phone number registered with Auðkenni." }],
	},
	{ name: "logout", description: "Clear local session." },
	{ name: "whoami", description: "Show the logged-in user." },
	{
		name: "kids",
		description: "List your children. Use --set-default to pick the default for other commands.",
		flags: [{ name: "set-default", description: "Match a child by name or id." }],
	},
	{
		name: "lunch",
		description: "Lunch menu + how well the kid ate it. Defaults to today.",
		usage: "vala lunch [--child NAME] [--date YYYY-MM-DD] [--week]",
	},
	{
		name: "attendance",
		description: "Arrival, departure, sleep, eat for a day. Defaults to today.",
		usage: "vala attendance [--child NAME] [--date YYYY-MM-DD]",
	},
	{
		name: "today",
		description: "Combined snapshot: arrival, lunch rating, departure, menu.",
		usage: "vala today [--child NAME]",
	},
	{
		name: "events",
		description: "School calendar events. Defaults to the next 30 days.",
		usage: "vala events [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days N] [--child NAME]",
	},
	{
		name: "absent",
		description: "Register an absence (sick / vacation). Asks to confirm unless --yes.",
		usage:
			"vala absent --type sick|vacation [--date YYYY-MM-DD] [--child NAME] [--comment ...] [--yes]",
	},
	{
		name: "chat",
		description: "Recent chat messages from the school. Latest 20 by default.",
		usage: "vala chat [--child NAME] [--limit N]",
	},
];

function printHelp(): void {
	if (globalFlags.json) {
		console.log(
			JSON.stringify({ commands: COMMANDS, global_flags: ["--json", "--pretty"] }, null, 2),
		);
		return;
	}
	console.log(`${color.bold("vala")} — Vala Leikskóli from the terminal`);
	console.log("");
	console.log("Commands:");
	for (const c of COMMANDS) {
		console.log(`  ${color.bold(c.name.padEnd(11))} ${c.description}`);
	}
	console.log("");
	console.log(
		`Global: ${color.dim("--json")} (machine output), ${color.dim("--pretty")} (force human output even when piped)`,
	);
}

// --- dispatch -------------------------------------------------------------

async function main(): Promise<void> {
	if (!command || command === "help" || hasFlag("help")) {
		printHelp();
		return;
	}

	switch (command) {
		case "login":
			await loginCommand({
				phone: getFlag("phone"),
				...globalFlags,
			});
			return;
		case "logout":
			await logoutCommand(globalFlags);
			return;
		case "whoami":
			await whoamiCommand(globalFlags);
			return;
		case "kids":
			await kidsCommand({
				"set-default": getFlag("set-default"),
				raw: hasFlag("raw"),
				...globalFlags,
			});
			return;
		case "lunch":
			await lunchCommand({
				child: getFlag("child"),
				date: getFlag("date"),
				week: hasFlag("week"),
				raw: hasFlag("raw"),
				...globalFlags,
			});
			return;
		case "attendance":
			await attendanceCommand({
				child: getFlag("child"),
				date: getFlag("date"),
				raw: hasFlag("raw"),
				...globalFlags,
			});
			return;
		case "today":
			await todayCommand({
				child: getFlag("child"),
				raw: hasFlag("raw"),
				...globalFlags,
			});
			return;
		case "events":
			await eventsCommand({
				child: getFlag("child"),
				from: getFlag("from"),
				to: getFlag("to"),
				days: getFlag("days"),
				raw: hasFlag("raw"),
				...globalFlags,
			});
			return;
		case "absent":
			await absentCommand({
				type: getFlag("type"),
				date: getFlag("date"),
				child: getFlag("child"),
				comment: getFlag("comment"),
				yes: hasFlag("yes"),
				...globalFlags,
			});
			return;
		case "chat":
			await chatCommand({
				child: getFlag("child"),
				limit: getFlag("limit"),
				raw: hasFlag("raw"),
				...globalFlags,
			});
			return;
		default:
			console.error(color.red(`Unknown command: ${command}`));
			console.error(`Run ${color.bold("vala help")}.`);
			process.exit(64);
	}
}

main().catch((err: unknown) => {
	if (err instanceof AuthError) dieAuth("expired", globalFlags.json);
	const msg = err instanceof Error ? err.message : String(err);
	if (globalFlags.json) {
		const status = err instanceof ApiError ? err.status : undefined;
		console.error(JSON.stringify({ error: msg, status }));
	} else {
		console.error(color.red(`Error: ${msg}`));
	}
	process.exit(1);
});
