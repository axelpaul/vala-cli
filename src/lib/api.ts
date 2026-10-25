// ValaClient — typed wrapper around the private leikskoli.vala.is API.
//
// Endpoints discovered by decompiling the Hermes bundle of com.valaapp v2.6.1.
// Auth: the token returned by check-login is sent on every request in a custom
// `token` header (lowercase). No cookies, no Authorization: Bearer.

import pkg from "../../package.json" with { type: "json" };
import type {
	AbsenceType,
	AttendanceChild,
	AuthState,
	CalendarEvent,
	ChatMessage,
	CheckLoginResponse,
	Child,
	LoginInitResponse,
	MenuSchool,
	OrdsEnvelope,
	PostAbsenceBody,
	User,
} from "./types.ts";

/** Default per-request timeout. The `check-login` long-poll explicitly overrides
 * this with a longer value; everything else should fail fast if the server hangs. */
export const DEFAULT_TIMEOUT_MS = 30_000;

const PROD_URL = "https://leikskoli.vala.is/vala";
const TEST_URL = "https://leikskoli-test.vala.is/vala";

/** Pick the base URL based on $VALA_ENV (`test` opts in to the test backend). */
export function defaultBaseUrl(): string {
	return process.env.VALA_ENV === "test" ? TEST_URL : PROD_URL;
}

export const USER_AGENT = `vala-cli/${pkg.version} (+https://github.com/axelpaul/vala-cli)`;

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public body?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export class AuthError extends ApiError {
	constructor(message = "Authentication required") {
		super(message, 401);
		this.name = "AuthError";
	}
}

export interface ValaClientOptions {
	baseUrl?: string;
	token?: string;
	/** Per-request timeout in ms. 0 disables (used by `postCheckLogin`'s long-poll).
	 * Defaults to {@link DEFAULT_TIMEOUT_MS}. */
	timeoutMs?: number;
}

export class ValaClient {
	private baseUrl: string;
	private token: string | undefined;
	private timeoutMs: number;

	constructor(opts: ValaClientOptions = {}) {
		this.baseUrl = (opts.baseUrl ?? defaultBaseUrl()).replace(/\/$/, "");
		this.token = opts.token;
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	static fromAuth(auth: AuthState | null): ValaClient {
		return new ValaClient({ token: auth?.token });
	}

	getToken(): string | undefined {
		return this.token;
	}

	setToken(token: string | undefined): void {
		this.token = token;
	}

	private async request<T>(
		method: string,
		path: string,
		opts: { body?: unknown; timeoutMs?: number } = {},
	): Promise<T> {
		const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
		const headers: Record<string, string> = {
			Accept: "application/json",
			"User-Agent": USER_AGENT,
		};
		// Vala uses a custom `token` header — not Authorization: Bearer, not cookies.
		// The header is set to the empty string if no token (matches the app's behavior).
		headers.token = this.token ?? "";

		let body: string | undefined;
		if (opts.body !== undefined) {
			headers["Content-Type"] = "application/json";
			body = JSON.stringify(opts.body);
		}

		const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
		const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;

		const res = await fetch(url, { method, headers, body, redirect: "follow", signal });

		const text = await res.text();
		let parsed: unknown;
		if (text.length > 0) {
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = text;
			}
		}

		if (!res.ok) {
			if (res.status === 401 || res.status === 403) {
				throw new AuthError(`${method} ${path}: ${res.status}`);
			}
			throw new ApiError(
				`${method} ${path}: ${res.status} ${truncate(text, 200)}`,
				res.status,
				parsed,
			);
		}
		return parsed as T;
	}

	// --- Auth ---

	postLogin(phonenumber: string): Promise<LoginInitResponse> {
		return this.request<LoginInitResponse>("POST", "/app-authentication/login", {
			body: { phonenumber },
		});
	}

	postCheckLogin(onetime: string, opts: { timeoutMs?: number } = {}): Promise<CheckLoginResponse> {
		// Long-poll: server holds the connection open until the user approves the
		// Auðkenni push (or fails / times out server-side). Caller can override timeout.
		return this.request<CheckLoginResponse>("POST", "/app-authentication/check-login", {
			body: { onetime },
			timeoutMs: opts.timeoutMs ?? 0,
		});
	}

	postLogout(): Promise<unknown> {
		return this.request<unknown>("POST", "/app-authentication/logout");
	}

	// --- User & children ---
	// All /app/* responses are ORDS envelopes: { items: [...], hasMore, count, links }.

	getUser(): Promise<OrdsEnvelope<User>> {
		return this.request<OrdsEnvelope<User>>("GET", "/app/user");
	}

	getAllChildren(): Promise<OrdsEnvelope<Child>> {
		return this.request<OrdsEnvelope<Child>>("GET", "/app/all-children");
	}

	// --- Day data ---
	// Both endpoints take (firstDay, lastDay) — a date RANGE, both inclusive — in
	// `DD.MM.YYYY` format. The child is implicit from the session; the response
	// has one row per child the user can see.

	getAttendance(firstDay: string, lastDay: string): Promise<OrdsEnvelope<AttendanceChild>> {
		return this.request<OrdsEnvelope<AttendanceChild>>(
			"GET",
			`/app/attendance/${encodeURIComponent(toValaDate(firstDay))}/${encodeURIComponent(toValaDate(lastDay))}`,
		);
	}

	getMenu(firstDay: string, lastDay: string): Promise<OrdsEnvelope<MenuSchool>> {
		return this.request<OrdsEnvelope<MenuSchool>>(
			"GET",
			`/app/menu/${encodeURIComponent(toValaDate(firstDay))}/${encodeURIComponent(toValaDate(lastDay))}`,
		);
	}

	getAbsenceTypes(): Promise<OrdsEnvelope<AbsenceType>> {
		return this.request<OrdsEnvelope<AbsenceType>>("GET", "/app/absence-types");
	}

	postAbsence(body: PostAbsenceBody): Promise<unknown> {
		return this.request<unknown>("POST", "/app/absence", { body });
	}

	// --- Calendar events ---
	// Same date-range shape as attendance/menu.

	getCalendarEvents(firstDay: string, lastDay: string): Promise<OrdsEnvelope<CalendarEvent>> {
		return this.request<OrdsEnvelope<CalendarEvent>>(
			"GET",
			`/app/calendar-events/${encodeURIComponent(toValaDate(firstDay))}/${encodeURIComponent(toValaDate(lastDay))}`,
		);
	}

	// --- Chat ---
	// NOTE: response is a bare array, not an ORDS envelope.

	getChatMessages(schoolId: number, childId: number): Promise<ChatMessage[]> {
		return this.request<ChatMessage[]>(
			"GET",
			`/app/chat-message/${encodeURIComponent(String(schoolId))}/${encodeURIComponent(String(childId))}`,
		);
	}
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Accepts `YYYY-MM-DD` (or already-formatted `DD.MM.YYYY`) and returns the
 * format the Vala server expects: `DD.MM.YYYY`. */
export function toValaDate(input: string): string {
	if (/^\d{2}\.\d{2}\.\d{4}$/.test(input)) return input;
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
	if (!m) throw new Error(`Invalid date: ${input} (use YYYY-MM-DD)`);
	return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Extract the `items` array from an ORDS envelope (or accept a bare array). */
export function items<T>(envelope: OrdsEnvelope<T> | T[] | undefined): T[] {
	if (!envelope) return [];
	if (Array.isArray(envelope)) return envelope;
	return Array.isArray(envelope.items) ? envelope.items : [];
}

/** First record from an ORDS envelope — what you want for single-row GETs like /app/user. */
export function first<T>(envelope: OrdsEnvelope<T> | T[] | undefined): T | undefined {
	return items(envelope)[0];
}
