// vala absent — register an absence for a child (sick, vacation).
//
// Mutating: POSTs /app/absence. Requires explicit confirmation unless --yes is
// passed. Maps short --type aliases to absence_type_id values fetched from the
// server.

import { items, toValaDate, ValaClient } from "../lib/api.ts";
import { matchChild } from "../lib/child.ts";
import { isoDate, todayIso } from "../lib/format.ts";
import { color, die, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { confirm } from "../lib/prompt.ts";
import { loadAuth, loadConfig } from "../lib/storage.ts";
import type { AbsenceType, Child } from "../lib/types.ts";

interface AbsentFlags {
	json?: boolean;
	pretty?: boolean;
	type?: string;
	date?: string;
	child?: string;
	comment?: string;
	yes?: boolean;
}

/** Each row says: "if the user typed something matching this pattern, find a
 * server-side absence type whose name starts with this prefix." This lets us
 * accept English aliases ("sick", "holiday") and short Icelandic forms ("veik",
 * "frí") while still matching the localized names returned by the API. */
const TYPE_ALIASES: Array<{ inputs: RegExp; nameStartsWith: string }> = [
	{ inputs: /^(sick|veik|sjuk)/i, nameStartsWith: "veik" },
	{ inputs: /^(vacation|holiday|leyfi|fri|frí)/i, nameStartsWith: "frí" },
];

export function pickAbsenceType(input: string, types: AbsenceType[]): AbsenceType | undefined {
	// 1. Direct numeric id.
	if (/^\d+$/.test(input)) {
		return types.find((t) => t.absence_type_id === Number(input));
	}
	// 2. English / Icelandic aliases.
	for (const { inputs, nameStartsWith } of TYPE_ALIASES) {
		if (inputs.test(input)) {
			return types.find((t) => t.absence_type.toLowerCase().startsWith(nameStartsWith));
		}
	}
	// 3. Substring match against the localized name as a last resort.
	const lc = input.toLowerCase();
	return types.find((t) => t.absence_type.toLowerCase().includes(lc));
}

function resolveChildFromList(
	children: Child[],
	flagChild: string | undefined,
	json: boolean,
): Child {
	if (flagChild) {
		const match = children.find((c) => matchChild(c, flagChild));
		if (!match) die(`No child matches "${flagChild}".`, 1, json);
		return match;
	}

	const cfg = loadConfig();
	if (cfg.defaultChildId) {
		const m = children.find((c) => c.child_id === cfg.defaultChildId);
		if (m) return m;
	}

	if (children.length === 1) return children[0] as Child;

	die("Multiple children — pass --child or set a default with `vala kids --set-default`.", 1, json);
}

export async function absentCommand(flags: AbsentFlags): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	if (!flags.type) {
		die("Missing --type. Examples: --type sick, --type vacation", 64, json);
	}

	const date = flags.date ? isoDate(flags.date) : todayIso();
	const client = ValaClient.fromAuth(auth);

	const [childrenEnv, typesEnv] = await Promise.all([
		client.getAllChildren(),
		client.getAbsenceTypes(),
	]);

	const children = items(childrenEnv);
	if (children.length === 0) die("No children registered on this account.", 1, json);

	const child = resolveChildFromList(children, flags.child, json);
	if (!child.placement_id) {
		die(
			`Cannot register absence for ${child.name}: missing placement_id (child may not be actively enrolled).`,
			1,
			json,
		);
	}

	const types = items(typesEnv);
	const matchedType = pickAbsenceType(flags.type, types);
	if (!matchedType) {
		const available = types.map((t) => `${t.absence_type} (id=${t.absence_type_id})`).join(", ");
		die(`Unknown --type "${flags.type}". Available: ${available}`, 64, json);
	}

	const body = {
		child_id: child.child_id,
		placement_id: child.placement_id,
		date: toValaDate(date),
		absence_comment: flags.comment ?? null,
		absence_type_id: matchedType.absence_type_id,
	};

	// In JSON mode, --yes is required so scripts must be explicit about the write.
	if (!flags.yes) {
		if (json) {
			die(`Mutating call: pass --yes to confirm. Body would be: ${JSON.stringify(body)}`, 64, json);
		}
		console.log(color.bold("Register absence:"));
		console.log(`  ${color.dim("child  ")}  ${child.name} ${color.dim(`#${child.child_id}`)}`);
		console.log(`  ${color.dim("date   ")}  ${date}`);
		console.log(`  ${color.dim("reason ")}  ${matchedType.absence_type}`);
		if (flags.comment) console.log(`  ${color.dim("comment")}  ${flags.comment}`);
		console.log("");
		const ok = await confirm("Send to school?", false);
		if (!ok) die("Aborted.", 1, json);
	}

	const result = await client.postAbsence(body);

	if (json) {
		printJson({ registered: true, body, response: result });
	} else {
		console.log(color.green(`✓ Absence registered for ${child.name} on ${date}.`));
	}
}
