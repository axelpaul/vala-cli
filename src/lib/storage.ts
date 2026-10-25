// Auth + config persistence with 0600 perms.
//
// Directory: $VALA_CONFIG_DIR, else $XDG_CONFIG_HOME/vala, else ~/.config/vala.
// Resolved on every call so tests (and the MCP server) can point it elsewhere.

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

export function configDir(): string {
	if (process.env.VALA_CONFIG_DIR) return process.env.VALA_CONFIG_DIR;
	const xdg = process.env.XDG_CONFIG_HOME;
	return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".config"), "vala");
}
const authPath = () => join(configDir(), "auth.json");
const configPath = () => join(configDir(), "config.json");

function ensureDir(): void {
	const dir = configDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
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
	writeSecure(authPath(), state);
}

export function loadAuth(): AuthState | null {
	return readJson<AuthState>(authPath());
}

export function clearAuth(): void {
	const path = authPath();
	if (existsSync(path)) unlinkSync(path);
}

export function saveConfig(cfg: UserConfig): void {
	writeSecure(configPath(), cfg);
}

export function loadConfig(): UserConfig {
	return readJson<UserConfig>(configPath()) ?? {};
}

export const paths = {
	get dir() {
		return configDir();
	},
	get auth() {
		return authPath();
	},
	get config() {
		return configPath();
	},
};
