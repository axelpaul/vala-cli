// vala lunch — what was on the menu for lunch, and how well the kid ate it.

import { items, ValaClient } from "../lib/api.ts";
import { matchChild } from "../lib/child.ts";
import { addDays, dayKey, firstMenuLine, isoDate, ratingColor, todayIso } from "../lib/format.ts";
import { color, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { loadAuth, loadConfig } from "../lib/storage.ts";
import type { AttendanceChild, EatRating, MenuSchool } from "../lib/types.ts";
import { EAT_LABELS_IS } from "../lib/types.ts";

interface LunchFlags {
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
	child?: string;
	date?: string;
	week?: boolean;
}

interface DaySummary {
	date: string; // ISO YYYY-MM-DD
	menu: string | null;
	eat: EatRating | null;
	child_name: string;
	school_name: string;
}

function buildSummaries(
	dates: string[],
	attendance: AttendanceChild[],
	menus: MenuSchool[],
): DaySummary[] {
	const out: DaySummary[] = [];

	// Build menu lookup keyed by `${school}|${date}` so multi-school families
	// (kids at different leikskólar) don't get one menu overwriting the other.
	const menuByKey = new Map<string, string | null>();
	for (const school of menus) {
		for (const day of school.menu) {
			menuByKey.set(`${school.school}|${dayKey(day.menu_date)}`, day.lunch);
		}
	}

	for (const child of attendance) {
		for (const date of dates) {
			// Find any attendance segment on this date that has an `eat` value.
			const seg = child.attendance.find((s) => dayKey(s.time_from) === date && s.eat);
			out.push({
				date,
				menu: menuByKey.get(`${child.school_name}|${date}`) ?? null,
				eat: seg?.eat ?? null,
				child_name: child.child_name,
				school_name: child.school_name,
			});
		}
	}
	return out;
}

export async function lunchCommand(flags: LunchFlags): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	const baseDate = flags.date ? isoDate(flags.date) : todayIso();
	const firstDay = flags.week ? addDays(baseDate, -6) : baseDate;
	const lastDay = baseDate;

	const client = ValaClient.fromAuth(auth);
	const [attEnv, menuEnv] = await Promise.all([
		client.getAttendance(firstDay, lastDay),
		client.getMenu(firstDay, lastDay),
	]);

	if (flags.raw) {
		console.log(JSON.stringify({ firstDay, lastDay, attendance: attEnv, menu: menuEnv }, null, 2));
		return;
	}

	const dates: string[] = [];
	for (let d = firstDay; d <= lastDay; d = addDays(d, 1)) {
		// Skip weekends — leikskóli isn't open Saturday/Sunday so there's never data.
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow === 0 || dow === 6) continue;
		dates.push(d);
	}

	let attendance = items(attEnv);
	const menus = items(menuEnv);

	const filter = flags.child ?? loadConfig().defaultChildName;
	if (filter) attendance = attendance.filter((r) => matchChild(r, filter));

	const summaries = buildSummaries(dates, attendance, menus);

	if (json) {
		printJson({ firstDay, lastDay, items: summaries });
		return;
	}

	if (summaries.length === 0) {
		console.log(color.dim("No data for that range."));
		return;
	}

	// Group by child for readability when multiple kids.
	const byChild = new Map<string, DaySummary[]>();
	for (const s of summaries) {
		const list = byChild.get(s.child_name) ?? [];
		list.push(s);
		byChild.set(s.child_name, list);
	}

	let first = true;
	for (const [child, days] of byChild) {
		if (!first) console.log("");
		first = false;
		console.log(color.bold(child));
		for (const s of days) {
			const ratingLabel = s.eat ? ratingColor(s.eat)(EAT_LABELS_IS[s.eat]) : color.dim("—");
			const menuLine = s.menu ? firstMenuLine(s.menu) : color.dim("(no menu)");
			console.log(`  ${color.dim(s.date)}  ${ratingLabel.padEnd(20)} ${menuLine}`);
		}
	}
}
