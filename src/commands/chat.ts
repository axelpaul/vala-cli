// vala chat — recent messages from the school staff.
//
// Endpoint: GET /app/chat-message/{school_id}/{child_id} — returns a bare array
// (no ORDS envelope) of messages, oldest first based on observed data.

import { items, ValaClient } from "../lib/api.ts";
import { matchChild } from "../lib/child.ts";
import { parseValaDate, relTime } from "../lib/format.ts";
import { color, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { loadAuth, loadConfig } from "../lib/storage.ts";
import type { ChatMessage, Child } from "../lib/types.ts";

interface ChatFlags {
	json?: boolean;
	pretty?: boolean;
	child?: string;
	limit?: string;
	raw?: boolean;
}

function resolveChildren(children: Child[], flagChild: string | undefined): Child[] {
	if (flagChild) return children.filter((c) => matchChild(c, flagChild));
	const cfg = loadConfig();
	if (cfg.defaultChildId) {
		const m = children.find((c) => c.child_id === cfg.defaultChildId);
		if (m) return [m];
	}
	return children;
}

export async function chatCommand(flags: ChatFlags): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	const limit = flags.limit ? Number(flags.limit) : 20;
	const client = ValaClient.fromAuth(auth);

	const allChildren = items(await client.getAllChildren());
	const targets = resolveChildren(allChildren, flags.child).filter((c) => c.school_id);

	const fetched = await Promise.all(
		targets.map(async (child) => {
			try {
				const messages = await client.getChatMessages(child.school_id as number, child.child_id);
				return { child, messages };
			} catch {
				return { child, messages: [] as ChatMessage[] };
			}
		}),
	);
	const results = fetched;

	if (flags.raw) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}

	if (json) {
		printJson({
			items: results.map(({ child, messages }) => ({
				child: { id: child.child_id, name: child.name, school: child.school_name },
				messages,
			})),
		});
		return;
	}

	let first = true;
	for (const { child, messages } of results) {
		if (!first) console.log("");
		first = false;

		console.log(color.bold(`${child.name}  ${color.dim(`— ${child.school_name}`)}`));

		if (messages.length === 0) {
			console.log(color.dim("  No messages."));
			continue;
		}

		// Show newest last so the most recent message stays at the bottom (chat-style).
		const sorted = [...messages].sort((a, b) => {
			const da = parseValaDate(a.created)?.getTime() ?? 0;
			const db = parseValaDate(b.created)?.getTime() ?? 0;
			return da - db;
		});
		const shown = sorted.slice(-limit);

		for (const m of shown) {
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
