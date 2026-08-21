// vala login — phone-based Auðkenni flow that works headless.

import { ApiError, ValaClient } from "../lib/api.ts";
import { color, die, isJsonMode, printJson } from "../lib/output.ts";
import { ask } from "../lib/prompt.ts";
import { saveAuth } from "../lib/storage.ts";
import type { CheckLoginResponse, LoginInitResponse } from "../lib/types.ts";

interface LoginFlags {
	phone?: string;
	kennitala?: string;
	json?: boolean;
	pretty?: boolean;
}

// Server-side long-poll. Auðkenni gives the user a couple of minutes to approve;
// we allow a bit more to account for clock drift / slow networks.
const APPROVAL_TIMEOUT_MS = 3 * 60 * 1000;
const SIGNET_URL = "https://login.signet.is";
// This is the client embedded in the current, official com.valaapp Android app.
// It is deliberately *not* the older `vala-leikskoli` web/admin client.
const SIGNET_CLIENT = "vala-leikskoli-app";
const HEIMDALLUR_URL = "https://heimdallur.vala.is";

function normalizePhone(s: string): string {
	return s.replace(/[^0-9+]/g, "");
}

function normalizeKennitala(s: string): string {
	const normalized = s.replace(/\D/g, "");
	if (normalized.length !== 10) throw new Error("Kennitala must contain exactly 10 digits.");
	return normalized;
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

function getInput(html: string, id: string): string {
	const match = html.match(new RegExp(`<input[^>]+id=["']${id}["'][^>]+value=["']([^"']*)`, "i"));
	if (!match) throw new Error(`Signet login page did not contain ${id}.`);
	return match[1] ?? "";
}

function responseCookies(response: Response): string {
	const headers = response.headers as Headers & { getSetCookie?: () => string[] };
	const cookies = headers.getSetCookie?.() ?? [];
	return cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

async function postForm(
	url: string,
	fields: Record<string, string>,
	cookie: string,
	referer: string,
): Promise<Response> {
	return fetch(url, {
		method: "POST",
		redirect: "manual",
		headers: {
			Accept: "application/json, text/javascript, */*; q=0.01",
			"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
			Origin: SIGNET_URL,
			Referer: referer,
			"X-Requested-With": "XMLHttpRequest",
			Cookie: cookie,
		},
		body: new URLSearchParams(fields),
	});
}

/**
 * Initiate exactly the Auðkennisappið route shown by Vala's Android app:
 *   heimdallur /auth/signet/login?client=vala-leikskoli-app
 *   → Signet StartAppLogin(ssn) → PollLogin → Vala callback.
 *
 * The final callback is intentionally left as a URL/body result: Vala has
 * changed this hand-off before, so callers can handle either a direct token or
 * an onetime key without ever treating the staff Signet client as equivalent.
 */
async function signetKennitalaLogin(
	kennitala: string,
): Promise<{ token?: string; onetime?: string }> {
	const start = await fetch(`${HEIMDALLUR_URL}/auth/signet/login?client=${SIGNET_CLIENT}`, {
		redirect: "manual",
	});
	const loginUrl = start.headers.get("location");
	if (!loginUrl) throw new Error(`Vala did not redirect to Signet (HTTP ${start.status}).`);

	const page = await fetch(loginUrl, { redirect: "manual" });
	if (!page.ok) throw new Error(`Signet login page failed (HTTP ${page.status}).`);
	const html = await page.text();
	const cookie = responseCookies(page);
	if (!cookie) throw new Error("Signet did not create a login session.");

	const authid = getInput(html, "authid");
	const path = getInput(html, "url");
	const account = getInput(html, "account");
	const csrf = html.match(/name=["']__RequestVerificationToken["'][^>]+value=["']([^"']*)/i)?.[1];
	if (!csrf) throw new Error("Signet login page did not contain its CSRF token.");

	const fields = {
		ssn: kennitala,
		account,
		authid,
		path,
		ip: "",
		returnUrl: "",
		__RequestVerificationToken: csrf,
	};
	const referer = page.url;
	const started = await postForm(`${SIGNET_URL}/login/StartAppLogin`, fields, cookie, referer);
	if (!started.ok)
		throw new Error(`Signet could not start Auðkennisappið login (HTTP ${started.status}).`);
	const init = (await started.json()) as { error?: string; sessionid?: string; vcode?: string };
	if (init.error || !init.sessionid)
		throw new Error(init.error ?? "Signet did not return a session id.");

	console.log(color.dim(`  Auðkenni confirmation code: ${init.vcode ?? "(shown in app)"}`));
	const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
	let result: { error?: string; running?: boolean; token?: string } | undefined;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 3500));
		const poll = await postForm(
			`${SIGNET_URL}/login/PollLogin`,
			{ sessionId: init.sessionid, account, onbehalf: "", __RequestVerificationToken: csrf },
			cookie,
			referer,
		);
		if (!poll.ok) throw new Error(`Signet login poll failed (HTTP ${poll.status}).`);
		const polled = (await poll.json()) as { error?: string; running?: boolean; token?: string };
		result = polled;
		if (!polled.running) break;
	}
	if (!result) throw new Error("Auðkenni approval timed out.");
	if (result.error || !result.token)
		throw new Error(result.error ?? "Signet did not return an approved token.");

	const callback = await fetch(`${HEIMDALLUR_URL}/auth/signet/callback`, {
		method: "POST",
		redirect: "manual",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ token: result.token }),
	});
	const location = callback.headers.get("location") ?? "";
	const callbackCookies = responseCookies(callback);
	const body = await callback.text();
	const data = (() => {
		try {
			return JSON.parse(body) as Record<string, unknown>;
		} catch {
			return {};
		}
	})();
	const find = (key: string): string | undefined => {
		const fromData = data[key];
		if (typeof fromData === "string" && fromData) return fromData;
		const fromUrl = new URL(location || callback.url).searchParams.get(key);
		return fromUrl || undefined;
	};
	// The native app's WebView receives the Vala session as a callback cookie;
	// some deployments instead redirect with an exchange key. Support both.
	const cookieToken = callbackCookies.match(/(?:^|;\s*)token=([^;]+)/)?.[1];
	return {
		token: find("token") ?? find("sessionToken") ?? cookieToken,
		onetime:
			find("oneTimeToken") ??
			find("onetime") ??
			find("oneTimeKey") ??
			find("one_time_key") ??
			find("pin"),
	};
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
	if (flags.phone && flags.kennitala) {
		die("Use either --phone or --kennitala, not both.", 1, json);
	}

	if (flags.kennitala) {
		let kennitala: string;
		try {
			kennitala = normalizeKennitala(flags.kennitala);
		} catch (e) {
			die(e instanceof Error ? e.message : "Invalid kennitala.", 1, json);
		}
		if (json) printJson({ step: "awaiting_approval", method: "kennitala" });
		else {
			console.log("");
			console.log(color.bold("  📱 Approve the Auðkennisappið request on your phone."));
			console.log(color.dim("  (Waiting up to 3 minutes…)"));
		}

		const handoff = await signetKennitalaLogin(kennitala);
		let token = handoff.token;
		let approval: CheckLoginResponse | undefined;
		if (!token && handoff.onetime) {
			approval = await awaitApproval(client, handoff.onetime, json);
			token = approval.token;
		}
		if (!token) die("Vala did not return a session token after Signet approval.", 1, json);
		client.setToken(token);
		const user = {
			name: approval?.name,
			ssn: approval?.ssn ?? kennitala,
			kennitala: approval?.ssn ?? kennitala,
			child_count: approval?.child_count,
		};
		saveAuth({ token, user, loggedInAt: new Date().toISOString(), validTo: approval?.valid_to });
		if (json) printJson({ step: "logged_in", user, valid_to: approval?.valid_to });
		else console.log(color.green(`✓ Logged in as ${user.name ?? "you"}.`));
		return;
	}

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
