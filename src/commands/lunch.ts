// vala lunch — what was on the menu for lunch, and how well the kid ate it.

import { ValaClient } from "../lib/api.ts";
import { firstMenuLine, ratingColor } from "../lib/format.ts";
import { color, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { fetchLunch, type LunchDay } from "../lib/queries.ts";
import { loadAuth } from "../lib/storage.ts";
import { EAT_LABELS_IS } from "../lib/types.ts";

interface LunchFlags {
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
	child?: string;
	date?: string;
	week?: boolean;
}

export async function lunchCommand(flags: LunchFlags): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	const { result, raw } = await fetchLunch(ValaClient.fromAuth(auth), {
		date: flags.date,
		week: flags.week,
		child: flags.child,
	});

	if (flags.raw) {
		console.log(JSON.stringify(raw, null, 2));
		return;
	}

	const summaries = result.items;

	if (json) {
		printJson(result);
		return;
	}

	if (summaries.length === 0) {
		console.log(color.dim("No data for that range."));
		return;
	}

	// Group by child for readability when multiple kids.
	const byChild = new Map<string, LunchDay[]>();
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
