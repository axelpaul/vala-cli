// Tiny stdin prompt helper. Works over SSH (stdin is still a TTY).
// Returns the trimmed answer or null if stdin is closed.

import { createInterface } from "node:readline/promises";

export async function ask(question: string): Promise<string> {
	if (!process.stdin.isTTY) {
		throw new Error(
			"This command needs interactive input. Run it with a TTY, or pass the value via a flag.",
		);
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await rl.question(question);
		return answer.trim();
	} finally {
		rl.close();
	}
}

export async function confirm(question: string, def = false): Promise<boolean> {
	const suffix = def ? " [Y/n] " : " [y/N] ";
	const ans = (await ask(question + suffix)).toLowerCase();
	if (ans === "") return def;
	return ans === "y" || ans === "yes" || ans === "j" || ans === "já";
}
