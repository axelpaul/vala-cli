import { AuthError, first, ValaClient } from "../lib/api.ts";
import { color, dieAuth, isJsonMode, printJson } from "../lib/output.ts";
import { loadAuth } from "../lib/storage.ts";

export async function whoamiCommand(flags: { json?: boolean; pretty?: boolean }): Promise<void> {
	const json = isJsonMode(flags);
	const auth = loadAuth();
	if (!auth) dieAuth("not_logged_in", json);

	const client = ValaClient.fromAuth(auth);
	try {
		const envelope = await client.getUser();
		const user = first(envelope);

		if (json) {
			printJson(user ?? null);
			return;
		}

		if (!user) {
			console.log(color.dim("No user record returned."));
			return;
		}

		console.log(color.bold(user.name ?? "(unknown name)"));
		console.log(`  ${color.dim("kennitala")} ${user.ssn ?? "—"}`);
		console.log(`  ${color.dim("phone")}     ${user.phone ?? "—"}`);
		if (user.email) console.log(`  ${color.dim("email")}     ${user.email}`);
		if (auth.validTo) console.log(`  ${color.dim("session")}   valid until ${auth.validTo}`);
	} catch (e) {
		if (e instanceof AuthError) dieAuth("expired", json);
		throw e;
	}
}
