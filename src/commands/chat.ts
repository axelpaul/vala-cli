// vala chat — recent messages from the school staff.
//
// Endpoint: GET /app/chat-message/{school_id}/{child_id} — returns a bare array
// (no ORDS envelope) of messages.

import { ValaClient } from "../lib/api.ts";
import { relTime } from "../lib/format.ts";
import { color, die, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { fetchChat } from "../lib/queries.ts";
import { loadAuth } from "../lib/storage.ts";

interface ChatFlags {
	json?: boolean;
	pretty?: boolean;
	child?: string;
	limit?: string;
	raw?: boolean;
}

export async function chatCommand(flags: ChatFlags): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	const limit = flags.limit ? Number(flags.limit) : undefined;
	if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
		die("Invalid --limit value", 64, json);
	}

	const { result, raw } = await fetchChat(ValaClient.fromAuth(auth), {
		child: flags.child,
		limit,
	});

	if (flags.raw) {
		console.log(JSON.stringify(raw, null, 2));
		return;
	}

	if (json) {
		printJson(result);
		return;
	}

	let first = true;
	for (const { child, messages } of result.items) {
		if (!first) console.log("");
		first = false;

		console.log(color.bold(`${child.name}  ${color.dim(`— ${child.school ?? ""}`)}`));

		if (messages.length === 0) {
			console.log(color.dim("  No messages."));
			continue;
		}

		// Oldest first so the most recent message stays at the bottom (chat-style).
		for (const m of messages) {
			const unread = m.user_opened === null;
			const marker = unread ? color.yellow("●") : color.dim("○");
			const when = color.dim(relTime(m.created).padEnd(8));
			const who = color.cyan(m.app_user_name);
			console.log(`  ${marker} ${when} ${who}`);
			for (const line of m.message.split("\n")) {
				console.log(`      ${line}`);
			}
		}
	}
}
