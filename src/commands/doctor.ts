// vala doctor — pre-flight health check. Useful for agents (and humans) to
// verify the CLI is ready to do real work before issuing data commands.

import { AuthError, items, ValaClient } from "../lib/api.ts";
import { color, isJsonMode, printJson } from "../lib/output.ts";
import { loadAuth } from "../lib/storage.ts";

interface DoctorFlags {
	json?: boolean;
	pretty?: boolean;
}

type CheckStatus = "ok" | "warn" | "fail";

interface Check {
	name: string;
	status: CheckStatus;
	detail?: string;
}

export async function doctorCommand(flags: DoctorFlags): Promise<void> {
	const json = isJsonMode(flags);
	const checks: Check[] = [];

	// 1. Local auth state.
	const auth = loadAuth();
	if (!auth) {
		checks.push({ name: "auth", status: "fail", detail: "Not logged in. Run `vala login`." });
		report(checks, json);
		return;
	}
	checks.push({
		name: "auth",
		status: "ok",
		detail: `Token cached, user: ${auth.user?.name ?? "?"}`,
	});

	// 2. Token freshness vs valid_to.
	if (auth.validTo) {
		const exp = Date.parse(auth.validTo);
		if (Number.isFinite(exp)) {
			const remainingMs = exp - Date.now();
			if (remainingMs < 0) {
				checks.push({
					name: "token_expiry",
					status: "warn",
					detail: `valid_to (${auth.validTo}) has passed; token may still work in practice — see /token check below.`,
				});
			} else {
				const hours = Math.round(remainingMs / 3_600_000);
				checks.push({
					name: "token_expiry",
					status: "ok",
					detail: `valid_to=${auth.validTo} (~${hours}h remaining per the login response)`,
				});
			}
		}
	} else {
		checks.push({ name: "token_expiry", status: "warn", detail: "No valid_to recorded." });
	}

	// 3. Live API reachability via /app/user (cheap, no params).
	const client = ValaClient.fromAuth(auth);
	try {
		const env = await client.getUser();
		const user = items(env)[0];
		checks.push({
			name: "api_reachable",
			status: "ok",
			detail: user?.name ? `Got /app/user as ${user.name}` : "Got /app/user (empty record)",
		});
	} catch (e) {
		if (e instanceof AuthError) {
			checks.push({
				name: "api_reachable",
				status: "fail",
				detail: "Server rejected the token (401). Run `vala login`.",
			});
		} else {
			checks.push({
				name: "api_reachable",
				status: "fail",
				detail: e instanceof Error ? e.message : String(e),
			});
		}
		report(checks, json);
		return;
	}

	// 4. Children visible (so commands that need a child won't be empty).
	try {
		const children = items(await client.getAllChildren());
		if (children.length === 0) {
			checks.push({
				name: "children",
				status: "warn",
				detail: "No children visible on this account.",
			});
		} else {
			checks.push({
				name: "children",
				status: "ok",
				detail: `${children.length} child${children.length === 1 ? "" : "ren"} visible: ${children.map((c) => c.name).join(", ")}`,
			});
		}
	} catch (e) {
		checks.push({
			name: "children",
			status: "warn",
			detail: e instanceof Error ? e.message : String(e),
		});
	}

	report(checks, json);
}

function report(checks: Check[], json: boolean): void {
	const overall: CheckStatus = checks.some((c) => c.status === "fail")
		? "fail"
		: checks.some((c) => c.status === "warn")
			? "warn"
			: "ok";

	if (json) {
		printJson({ status: overall, checks });
		if (overall === "fail") process.exit(2);
		return;
	}

	const icon: Record<CheckStatus, string> = {
		ok: color.green("✓"),
		warn: color.yellow("!"),
		fail: color.red("✗"),
	};
	for (const c of checks) {
		console.log(`  ${icon[c.status]} ${color.bold(c.name)}  ${color.dim(c.detail ?? "")}`);
	}
	console.log("");
	if (overall === "ok") console.log(color.green("All checks passed."));
	else if (overall === "warn") console.log(color.yellow("Some checks have warnings."));
	else {
		console.log(color.red("Checks failed."));
		process.exit(2);
	}
}
