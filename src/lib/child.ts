// Helpers for resolving which child a command should target.

import { AuthError, items, ValaClient } from "./api.ts";
import { die, dieAuth } from "./output.ts";
import { loadAuth, loadConfig } from "./storage.ts";
import type { Child } from "./types.ts";

export interface ResolvedChild {
	child: Child;
	client: ValaClient;
}

/** Match against `child_id` or a case-insensitive substring of the child's name.
 * Works for both top-level Child objects and rows in attendance/event responses
 * (which use `child_name` instead of `name`). */
export function matchChild<
	T extends { child_id?: number | string; name?: string; child_name?: string },
>(row: T, needle: string): boolean {
	const n = needle.toLowerCase();
	if (row.child_id !== undefined && String(row.child_id) === n) return true;
	const displayName = (row.name ?? row.child_name ?? "").toLowerCase();
	return displayName.includes(n);
}

/** Resolve the active child for a command: explicit --child wins, then a saved
 * default, then the only-child fallback. Errors are routed through dieAuth/die. */
export async function resolveChild(
	flagChild: string | undefined,
	json: boolean,
): Promise<ResolvedChild> {
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);
	const client = ValaClient.fromAuth(auth);

	let children: Child[];
	try {
		children = items(await client.getAllChildren());
	} catch (e) {
		if (e instanceof AuthError) dieAuth("expired", json);
		throw e;
	}

	if (children.length === 0) {
		die("No children registered on this account.", 1, json);
	}

	if (flagChild) {
		const match = children.find((c) => matchChild(c, flagChild));
		if (!match) die(`No child matches "${flagChild}".`, 1, json);
		return { child: match, client };
	}

	const cfg = loadConfig();
	if (cfg.defaultChildId) {
		const match = children.find((c) => c.child_id === cfg.defaultChildId);
		if (match) return { child: match, client };
	}

	if (children.length === 1) return { child: children[0] as Child, client };

	die(
		`Multiple children — pass --child or set a default with "vala kids --set-default <name>".`,
		1,
		json,
	);
}

/** Re-exports so existing imports `from "../lib/child.ts"` keep working. */
export { addDays, isoDate, todayIso } from "./format.ts";
