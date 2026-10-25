// vala absent — register an absence for a child (sick, vacation).
//
// Mutating: POSTs /app/absence. Requires explicit confirmation unless --yes is
// passed. Maps short --type aliases to absence_type_id values fetched from the
// server.

import { ValaClient } from "../lib/api.ts";
import { color, die, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { confirm } from "../lib/prompt.ts";
import { prepareAbsence, submitAbsence } from "../lib/queries.ts";
import { loadAuth } from "../lib/storage.ts";

interface AbsentFlags {
	json?: boolean;
	pretty?: boolean;
	type?: string;
	date?: string;
	child?: string;
	comment?: string;
	yes?: boolean;
}

export async function absentCommand(flags: AbsentFlags): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	if (!flags.type) {
		die("Missing --type. Examples: --type sick, --type vacation", 64, json);
	}

	const client = ValaClient.fromAuth(auth);
	const prepared = await prepareAbsence(client, {
		type: flags.type,
		date: flags.date,
		child: flags.child,
		comment: flags.comment,
	});
	const { child, date, type, body } = prepared;

	// In JSON mode, --yes is required so scripts must be explicit about the write.
	if (!flags.yes) {
		if (json) {
			die(`Mutating call: pass --yes to confirm. Body would be: ${JSON.stringify(body)}`, 64, json);
		}
		console.log(color.bold("Register absence:"));
		console.log(`  ${color.dim("child  ")}  ${child.name} ${color.dim(`#${child.child_id}`)}`);
		console.log(`  ${color.dim("date   ")}  ${date}`);
		console.log(`  ${color.dim("reason ")}  ${type.absence_type}`);
		if (flags.comment) console.log(`  ${color.dim("comment")}  ${flags.comment}`);
		console.log("");
		const ok = await confirm("Send to school?", false);
		if (!ok) die("Aborted.", 1, json);
	}

	const result = await submitAbsence(client, prepared);

	if (json) {
		printJson(result);
	} else {
		console.log(color.green(`✓ Absence registered for ${child.name} on ${date}.`));
	}
}
