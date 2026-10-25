// vala today — combined snapshot: arrival, departure, lunch rating + menu.

import { ValaClient } from "../lib/api.ts";
import { formatTime, ratingColor } from "../lib/format.ts";
import { color, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { fetchToday } from "../lib/queries.ts";
import { loadAuth } from "../lib/storage.ts";
import { EAT_LABELS_IS } from "../lib/types.ts";

interface TodayFlags {
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
	child?: string;
}

export async function todayCommand(flags: TodayFlags): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	const { result, raw } = await fetchToday(ValaClient.fromAuth(auth), { child: flags.child });

	if (flags.raw) {
		console.log(JSON.stringify(raw, null, 2));
		return;
	}

	const { date, children, menus } = result;

	if (json) {
		printJson(result);
		return;
	}

	if (children.length === 0) {
		console.log(color.dim(`No records for ${date}.`));
		return;
	}

	let first = true;
	for (const child of children) {
		if (!first) console.log("");
		first = false;
		console.log(color.bold(`${child.child_name}  ${color.dim(`— ${child.school_name}`)}`));

		// Surface the canonical times: earliest arrival and last departure.
		// Sort explicitly — the API has been chronological so far, but we shouldn't rely on it.
		const present = child.attendance
			.filter((s) => !s.is_absence)
			.sort((a, b) => (a.time_from < b.time_from ? -1 : 1));
		const arrival = present[0];
		const departure = present[present.length - 1];

		if (arrival) {
			const arrived = formatTime(arrival.time_from);
			console.log(`  ${color.dim("arrived")}  ${color.cyan(arrived)}`);
			const leftRaw = departure?.time_to;
			const left = leftRaw ? color.cyan(formatTime(leftRaw)) : color.dim("still in");
			console.log(`  ${color.dim("left   ")}  ${left}`);
		} else {
			console.log(`  ${color.dim("arrived")}  ${color.dim("not yet")}`);
		}

		// Lunch rating: first segment of the day with `eat`.
		const eatSeg = child.attendance.find((s) => s.eat);
		const lunchVal = eatSeg?.eat
			? ratingColor(eatSeg.eat)(EAT_LABELS_IS[eatSeg.eat])
			: color.dim("—");
		console.log(`  ${color.dim("lunch  ")}  ${lunchVal}`);

		// Sleep
		const sleepSeg = child.attendance.find((s) => s.sleeping_minutes != null);
		if (sleepSeg?.sleeping_minutes != null) {
			console.log(`  ${color.dim("sleep  ")}  ${sleepSeg.sleeping_minutes} min`);
		}

		// Absence segments (e.g. school closed)
		for (const a of child.attendance.filter((s) => s.is_absence)) {
			console.log(
				`  ${color.yellow(a.type)}  ${formatTime(a.time_from)} → ${formatTime(a.time_to)}`,
			);
			if (a.attendance_comment) console.log(`    ${color.dim(a.attendance_comment)}`);
		}

		// Menu for that child's school
		const schoolMenu = menus.find((m) => m.school === child.school_name);
		const lunchText = schoolMenu?.menu[0]?.lunch;
		if (lunchText) {
			console.log("");
			console.log(`  ${color.dim("menu")}`);
			for (const line of lunchText.split("\n")) {
				if (line.trim()) console.log(`    ${line.trim()}`);
			}
		}
	}
}
