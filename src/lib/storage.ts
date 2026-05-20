// Auth + config persistence in ~/.config/vala/ with 0600 perms.

import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuthState, UserConfig } from "./types.ts";

const CONFIG_DIR = join(homedir(), ".config", "vala");
const AUTH_PATH = join(CONFIG_DIR, "auth.json");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

function ensureDir(): void {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
	}
}

/** Atomic, 0600-permissioned write: write to a sibling .tmp file, then rename.
 * A crash mid-write leaves the previous file intact rather than truncated. */
function writeSecure(path: string, data: unknown): void {
	ensureDir();
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
	chmodSync(tmp, 0o600); // belt-and-suspenders: mode option is ignored if tmp pre-existed
	renameSync(tmp, path);
}

function readJson<T>(path: string): T | null {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

export function saveAuth(state: AuthState): void {
	writeSecure(AUTH_PATH, state);
}

export function loadAuth(): AuthState | null {
	return readJson<AuthState>(AUTH_PATH);
}

export function clearAuth(): void {
	if (existsSync(AUTH_PATH)) unlinkSync(AUTH_PATH);
}

export function saveConfig(cfg: UserConfig): void {
	writeSecure(CONFIG_PATH, cfg);
}

export function loadConfig(): UserConfig {
	return readJson<UserConfig>(CONFIG_PATH) ?? {};
}

export const paths = {
	dir: CONFIG_DIR,
	auth: AUTH_PATH,
	config: CONFIG_PATH,
};
