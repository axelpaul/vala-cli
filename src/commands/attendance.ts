// vala attendance — arrival / departure / sleep / eat for a day.

import { ValaClient } from "../lib/api.ts";
import { formatTime, ratingColor } from "../lib/format.ts";
import { color, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { fetchAttendance } from "../lib/queries.ts";
import { loadAuth } from "../lib/storage.ts";
import type { AttendanceSegment } from "../lib/types.ts";
import { EAT_LABELS_IS } from "../lib/types.ts";

interface AttendanceFlags {
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
	child?: string;
	date?: string;
}

export async function attendanceCommand(flags: AttendanceFlags): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	const { result, raw } = await fetchAttendance(ValaClient.fromAuth(auth), {
		date: flags.date,
		child: flags.child,
	});

	if (flags.raw) {
		console.log(JSON.stringify(raw, null, 2));
		return;
	}

	const { date, items: rows } = result;

	if (json) {
		printJson(result);
		return;
	}

	if (rows.length === 0) {
		console.log(color.dim(`No attendance for ${date}.`));
		return;
	}

	for (const r of rows) {
		console.log(color.bold(`${r.child_name} — ${date}`));
		if (r.attendance.length === 0) {
			console.log(color.dim("  No records."));
			continue;
		}
		for (const seg of r.attendance) {
			printSegment(seg);
		}
		console.log("");
	}
}

function printSegment(seg: AttendanceSegment): void {
	const from = formatTime(seg.time_from);
	const to = seg.time_to ? formatTime(seg.time_to) : color.dim("still in");
	const timeRange = `${color.cyan(from)} → ${color.cyan(String(to))}`;

	if (seg.is_absence) {
		console.log(`  ${color.yellow(seg.type)}  ${timeRange}`);
		if (seg.attendance_comment) console.log(`    ${color.dim(seg.attendance_comment)}`);
		return;
	}

	console.log(`  ${timeRange}  ${color.dim(`(${seg.type})`)}`);
	if (seg.eat) {
		const label = EAT_LABELS_IS[seg.eat] ?? seg.eat;
		console.log(`    ${color.dim("ate")}    ${ratingColor(seg.eat)(label)}`);
	}
	if (seg.sleeping_minutes != null) {
		const fromS = seg.sleep_from ? formatTime(seg.sleep_from) : "";
		const toS = seg.sleep_to ? formatTime(seg.sleep_to) : "";
		const range = fromS && toS ? ` (${fromS}–${toS})` : "";
		console.log(`    ${color.dim("sleep")}  ${seg.sleeping_minutes} min${range}`);
	}
	if (seg.attendance_comment) {
		console.log(`    ${color.dim("note")}   ${seg.attendance_comment}`);
	}
}
