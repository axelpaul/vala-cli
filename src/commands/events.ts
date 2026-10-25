// vala events — school calendar events (parent meetings, holidays, planning days).

import { ValaClient } from "../lib/api.ts";
import { isAllDay } from "../lib/format.ts";
import { color, die, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { fetchEvents } from "../lib/queries.ts";
import { loadAuth } from "../lib/storage.ts";

interface EventsFlags {
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
	child?: string;
	from?: string;
	to?: string;
	days?: string;
}

interface EventDateParts {
	day: string;
	time: string;
}

function eventDateParts(iso: string): EventDateParts {
	const d = new Date(iso);
	const day = `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
	const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
	return { day, time };
}

export async function eventsCommand(flags: EventsFlags): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	const days = flags.days ? Number(flags.days) : undefined;
	if (days !== undefined && (!Number.isInteger(days) || days < 1)) {
		die("Invalid --days value", 64, json);
	}
	const { result, raw } = await fetchEvents(ValaClient.fromAuth(auth), {
		from: flags.from,
		to: flags.to,
		days,
		child: flags.child,
	});

	if (flags.raw) {
		console.log(JSON.stringify(raw, null, 2));
		return;
	}

	const { from, to, items: events } = result;

	if (json) {
		printJson(result);
		return;
	}

	console.log(color.bold(`Events ${from} → ${to}`));
	if (events.length === 0) {
		console.log(color.dim("  Nothing scheduled."));
		return;
	}

	for (const e of events) {
		const start = eventDateParts(e.start_date);
		const end = eventDateParts(e.end_date);
		const when = isAllDay(e.start_date, e.end_date)
			? start.day
			: `${start.day} ${start.time} → ${end.time}`;
		const who = e.child_name ? color.dim(` (${e.child_name})`) : "";
		console.log("");
		console.log(`  ${color.cyan(when)}  ${color.bold(e.title)}${who}`);
		if (e.information) console.log(`    ${e.information}`);
		if (e.location) console.log(`    ${color.dim(`@ ${e.location}`)}`);
	}
}
