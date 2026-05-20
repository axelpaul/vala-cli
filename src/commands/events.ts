// vala events — school calendar events (parent meetings, holidays, planning days).

import { items, ValaClient } from "../lib/api.ts";
import { matchChild } from "../lib/child.ts";
import { addDays, isAllDay, isoDate, todayIso } from "../lib/format.ts";
import { color, die, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { loadAuth, loadConfig } from "../lib/storage.ts";
import type { CalendarEvent } from "../lib/types.ts";

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

	const from = flags.from ? isoDate(flags.from) : todayIso();
	const days = flags.days ? Number(flags.days) : 30;
	if (Number.isNaN(days) || days < 1) die("Invalid --days value", 64, json);
	const to = flags.to ? isoDate(flags.to) : addDays(from, days - 1);

	const client = ValaClient.fromAuth(auth);
	const envelope = await client.getCalendarEvents(from, to);

	if (flags.raw) {
		console.log(JSON.stringify(envelope, null, 2));
		return;
	}

	let events: CalendarEvent[] = items(envelope);

	const filter = flags.child ?? loadConfig().defaultChildName;
	if (filter) events = events.filter((e) => matchChild(e, filter));

	// Sort chronologically.
	events.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

	if (json) {
		printJson({ from, to, items: events });
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
