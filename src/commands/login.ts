// vala login — phone-based Auðkenni flow that works headless.

import { ApiError, ValaClient } from "../lib/api.ts";
import { color, die, isJsonMode, printJson } from "../lib/output.ts";
import { ask } from "../lib/prompt.ts";
import { saveAuth } from "../lib/storage.ts";
import type { CheckLoginResponse, LoginInitResponse } from "../lib/types.ts";

interface LoginFlags {
	phone?: string;
	json?: boolean;
	pretty?: boolean;
}

// Server-side long-poll. Auðkenni gives the user a couple of minutes to approve;
// we allow a bit more to account for clock drift / slow networks.
const APPROVAL_TIMEOUT_MS = 3 * 60 * 1000;

function normalizePhone(s: string): string {
	return s.replace(/[^0-9+]/g, "");
}

function pickOneTimeKey(res: LoginInitResponse): string | undefined {
	// Confirmed against live API: field is `oneTimeKey`. Keep fallbacks just in case.
	const candidates = ["oneTimeKey", "onetime", "onetime_key", "one_time_key"];
	for (const k of candidates) {
		const v = (res as Record<string, unknown>)[k];
		if (typeof v === "string" && v.length > 0) return v;
	}
	return undefined;
}

async function resolvePhone(flags: LoginFlags, json: boolean): Promise<string> {
	if (flags.phone) return normalizePhone(flags.phone);
	const input = await ask("Phone number registered with Auðkenni: ");
	if (!input) die("No phone number provided.", 1, json);
	return normalizePhone(input);
}

async function awaitApproval(
	client: ValaClient,
	oneTimeKey: string,
	json: boolean,
): Promise<CheckLoginResponse> {
	// Single long-polling call. The server returns when the user has either
	// approved the Auðkenni request or it has failed/timed out.
	let res: CheckLoginResponse;
	try {
		res = await client.postCheckLogin(oneTimeKey, { timeoutMs: APPROVAL_TIMEOUT_MS });
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) {
			die(
				"Auðkenni session not found. It may have already been consumed or expired — re-run `vala login`.",
				1,
				json,
			);
		}
		throw e;
	}

	if (res.error) die(`Auðkenni rejected: ${res.error}`, 1, json);
	if (res.successful === false || !res.token) {
		if (json) {
			console.error(JSON.stringify({ error: "no_token_in_response", response: res }));
		} else {
			console.error(color.red("Approval succeeded but no token was returned."));
			console.error(color.dim(`Response: ${JSON.stringify(res)}`));
		}
		process.exit(1);
	}
	return res;
}

export async function loginCommand(flags: LoginFlags): Promise<void> {
	const json = isJsonMode(flags);
	const client = new ValaClient();

	const phone = await resolvePhone(flags, json);

	const initRes = await client.postLogin(phone);
	if (initRes.successful === false) {
		die(`Login initiation failed: ${JSON.stringify(initRes)}`, 1, json);
	}
	const oneTimeKey = pickOneTimeKey(initRes);
	if (!oneTimeKey) {
		if (json) {
			console.error(JSON.stringify({ error: "no_one_time_key_in_response", response: initRes }));
		} else {
			console.error(color.red("Server didn't return a polling token."));
			console.error(color.dim(`Response: ${JSON.stringify(initRes)}`));
		}
		process.exit(1);
	}

	if (json) {
		printJson({ step: "awaiting_approval" });
	} else {
		console.log("");
		console.log(color.bold("  📱 Approve the Auðkenni request on your phone."));
		console.log(color.dim("  (Waiting up to 3 minutes…)"));
	}

	const approval = await awaitApproval(client, oneTimeKey, json);
	const token = approval.token as string;
	client.setToken(token);

	// The check-login response already carries everything we need to identify the
	// user — no extra /app/user round-trip required.
	const user = {
		name: approval.name,
		ssn: approval.ssn,
		kennitala: approval.ssn,
		phone,
		child_count: approval.child_count,
	};

	saveAuth({
		token,
		user,
		loggedInAt: new Date().toISOString(),
		validTo: approval.valid_to,
	});

	if (json) {
		printJson({ step: "logged_in", user, valid_to: approval.valid_to });
	} else {
		console.log(color.green(`✓ Logged in as ${user.name ?? "you"}.`));
		if (approval.valid_to) {
			console.log(color.dim(`  Session valid until ${approval.valid_to}.`));
		}
	}
}
