import { ValaClient } from "../lib/api.ts";
import { color, isJsonMode, printJson } from "../lib/output.ts";
import { clearAuth, loadAuth } from "../lib/storage.ts";

export async function logoutCommand(flags: { json?: boolean; pretty?: boolean }): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (auth) {
		const client = ValaClient.fromAuth(auth);
		try {
			await client.postLogout();
		} catch {
			// Server-side logout is best-effort; we still clear local state.
		}
	}
	clearAuth();
	if (json) printJson({ logged_out: true });
	else console.log(color.green("✓ Logged out."));
}
