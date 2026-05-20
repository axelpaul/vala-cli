// vala kids — list children, set a default for other commands.

import { AuthError, items, ValaClient } from "../lib/api.ts";
import { matchChild } from "../lib/child.ts";
import { color, die, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { loadAuth, loadConfig, saveConfig } from "../lib/storage.ts";

interface KidsFlags {
	json?: boolean;
	pretty?: boolean;
	"set-default"?: string;
	raw?: boolean;
}

export async function kidsCommand(flags: KidsFlags): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	const client = ValaClient.fromAuth(auth);
	let envelope: Awaited<ReturnType<typeof client.getAllChildren>>;
	try {
		envelope = await client.getAllChildren();
	} catch (e) {
		if (e instanceof AuthError) dieAuth("expired", json);
		throw e;
	}

	// Escape hatch for debugging: --raw prints the full ORDS envelope.
	if (flags.raw) {
		console.log(JSON.stringify(envelope, null, 2));
		return;
	}

	const children = items(envelope);

	if (flags["set-default"]) {
		const needle = flags["set-default"];
		const match = children.find((c) => matchChild(c, needle));
		if (!match) die(`No child matches "${needle}".`, 1, json);
		const cfg = loadConfig();
		cfg.defaultChildId = match.child_id;
		cfg.defaultChildName = match.name;
		saveConfig(cfg);
		if (json) printJson({ default_child: match });
		else console.log(color.green(`✓ Default child set to ${match.name}.`));
		return;
	}

	if (json) {
		printJson({ children });
		return;
	}

	if (children.length === 0) {
		console.log(color.dim("No children registered on this account."));
		return;
	}

	const cfg = loadConfig();
	for (const c of children) {
		const isDefault = c.child_id === cfg.defaultChildId;
		const marker = isDefault ? color.green(" (default)") : "";
		const school = c.school_name ? color.dim(` — ${c.school_name}`) : "";
		const hours = c.hour_from && c.hour_to ? color.dim(` (${c.hour_from}–${c.hour_to})`) : "";
		console.log(
			`  ${color.bold(c.name)}${school}${hours}  ${color.dim(`#${c.child_id}`)}${marker}`,
		);
	}
	if (children.length > 1 && !cfg.defaultChildId) {
		console.log("");
		console.log(color.dim("  Tip: vala kids --set-default <name>"));
	}
}
