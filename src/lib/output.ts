// TTY-aware output helpers. JSON when piped or --json, human-readable otherwise.

export interface OutputFlags {
	json?: boolean;
	pretty?: boolean;
}

export function isJsonMode(flags: OutputFlags): boolean {
	if (flags.json) return true;
	if (flags.pretty) return false;
	return !process.stdout.isTTY;
}

export function printJson(value: unknown): void {
	console.log(JSON.stringify(value, null, 2));
}

const SUPPORTS_COLOR = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function wrap(code: number, s: string): string {
	if (!SUPPORTS_COLOR) return s;
	return `\x1b[${code}m${s}\x1b[0m`;
}

export const color = {
	bold: (s: string) => wrap(1, s),
	dim: (s: string) => wrap(2, s),
	red: (s: string) => wrap(31, s),
	green: (s: string) => wrap(32, s),
	yellow: (s: string) => wrap(33, s),
	blue: (s: string) => wrap(34, s),
	magenta: (s: string) => wrap(35, s),
	cyan: (s: string) => wrap(36, s),
};

export function die(message: string, code = 1, json = false): never {
	if (json) {
		console.error(JSON.stringify({ error: message }));
	} else {
		console.error(color.red(`Error: ${message}`));
	}
	process.exit(code);
}

/** Reason a command refused to continue due to auth state. */
export type AuthFailReason = "not_logged_in" | "expired";

const AUTH_FAIL_MSG: Record<AuthFailReason, string> = {
	not_logged_in: 'Not logged in. Run "vala login".',
	expired: 'Session expired. Run "vala login" to re-authenticate.',
};

export function dieAuth(reason: AuthFailReason = "not_logged_in", json = false): never {
	const msg = AUTH_FAIL_MSG[reason];
	if (json) {
		console.error(JSON.stringify({ error: msg, code: `auth_${reason}` }));
	} else {
		console.error(color.yellow(msg));
	}
	process.exit(2);
}
