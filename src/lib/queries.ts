// Shared read/write operations used by both the CLI commands and the MCP server.
//
// Everything that talks to the API and shapes the result lives here so the two
// front-ends cannot drift. Functions throw (UsageError for bad input, Error for
// everything else) instead of exiting; callers decide how to report.

import { AuthError, first, items, toValaDate, type ValaClient } from "./api.ts";
import { matchChild } from "./child.ts";
import { addDays, dayKey, isoDate, parseValaDate, todayIso } from "./format.ts";
import { loadAuth, loadConfig } from "./storage.ts";
import type {
	AbsenceType,
	AttendanceChild,
	CalendarEvent,
	ChatMessage,
	Child,
	EatRating,
	MenuSchool,
	PostAbsenceBody,
} from "./types.ts";

/** Bad input from the caller (maps to exit code 64 in the CLI). */
export class UsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}

/** Row filter for multi-child responses: explicit value wins, else the saved default. */
export function childFilter(explicit: string | undefined): string | undefined {
	return explicit ?? loadConfig().defaultChildName;
}

// --- whoami ---------------------------------------------------------------

export async function fetchUser(client: ValaClient) {
	return first(await client.getUser()) ?? null;
}

// --- kids -----------------------------------------------------------------

export async function fetchChildren(client: ValaClient): Promise<Child[]> {
	return items(await client.getAllChildren());
}

/** Pick one child: explicit match → saved default → only child. */
export function pickOneChild(children: Child[], needle: string | undefined): Child {
	if (children.length === 0) throw new Error("No children registered on this account.");
	if (needle) {
		const match = children.find((c) => matchChild(c, needle));
		if (!match) throw new Error(`No child matches "${needle}".`);
		return match;
	}
	const cfg = loadConfig();
	if (cfg.defaultChildId) {
		const m = children.find((c) => c.child_id === cfg.defaultChildId);
		if (m) return m;
	}
	if (children.length === 1) return children[0] as Child;
	throw new UsageError(
		"Multiple children — pass a child (name or id) or set a default with `vala kids --set-default`.",
	);
}

// --- lunch ----------------------------------------------------------------

export interface LunchDay {
	date: string; // ISO YYYY-MM-DD
	menu: string | null;
	eat: EatRating | null;
	child_name: string;
	school_name: string;
}

export interface LunchResult {
	firstDay: string;
	lastDay: string;
	items: LunchDay[];
}

export function buildLunchDays(
	dates: string[],
	attendance: AttendanceChild[],
	menus: MenuSchool[],
): LunchDay[] {
	// Menu lookup keyed by `${school}|${date}` so multi-school families
	// (kids at different leikskólar) don't get one menu overwriting the other.
	const menuByKey = new Map<string, string | null>();
	for (const school of menus) {
		for (const day of school.menu) {
			menuByKey.set(`${school.school}|${dayKey(day.menu_date)}`, day.lunch);
		}
	}
	const out: LunchDay[] = [];
	for (const child of attendance) {
		for (const date of dates) {
			const seg = child.attendance.find((s) => dayKey(s.time_from) === date && s.eat);
			out.push({
				date,
				menu: menuByKey.get(`${child.school_name}|${date}`) ?? null,
				eat: seg?.eat ?? null,
				child_name: child.child_name,
				school_name: child.school_name,
			});
		}
	}
	return out;
}

/** Weekdays in [first, last]; leikskóli is closed on weekends so there is never data. */
export function weekdaysBetween(firstDay: string, lastDay: string): string[] {
	const dates: string[] = [];
	for (let d = firstDay; d <= lastDay; d = addDays(d, 1)) {
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow === 0 || dow === 6) continue;
		dates.push(d);
	}
	return dates;
}

export async function fetchLunch(
	client: ValaClient,
	opts: { date?: string; week?: boolean; child?: string },
): Promise<{ result: LunchResult; raw: unknown }> {
	const baseDate = opts.date ? isoDate(opts.date) : todayIso();
	const firstDay = opts.week ? addDays(baseDate, -6) : baseDate;
	const lastDay = baseDate;
	const [attEnv, menuEnv] = await Promise.all([
		client.getAttendance(firstDay, lastDay),
		client.getMenu(firstDay, lastDay),
	]);
	let attendance = items(attEnv);
	const filter = childFilter(opts.child);
	if (filter) attendance = attendance.filter((r) => matchChild(r, filter));
	return {
		result: {
			firstDay,
			lastDay,
			items: buildLunchDays(weekdaysBetween(firstDay, lastDay), attendance, items(menuEnv)),
		},
		raw: { firstDay, lastDay, attendance: attEnv, menu: menuEnv },
	};
}

// --- attendance -----------------------------------------------------------

export async function fetchAttendance(
	client: ValaClient,
	opts: { date?: string; child?: string },
): Promise<{ result: { date: string; items: AttendanceChild[] }; raw: unknown }> {
	const date = opts.date ? isoDate(opts.date) : todayIso();
	const envelope = await client.getAttendance(date, date);
	const all = items(envelope);
	const filter = childFilter(opts.child);
	return {
		result: { date, items: filter ? all.filter((r) => matchChild(r, filter)) : all },
		raw: envelope,
	};
}

// --- today ----------------------------------------------------------------

export async function fetchToday(
	client: ValaClient,
	opts: { child?: string },
): Promise<{
	result: { date: string; children: AttendanceChild[]; menus: MenuSchool[] };
	raw: unknown;
}> {
	const date = todayIso();
	const [attEnv, menuEnv] = await Promise.all([
		client.getAttendance(date, date),
		client.getMenu(date, date),
	]);
	let children = items(attEnv);
	const filter = childFilter(opts.child);
	if (filter) children = children.filter((r) => matchChild(r, filter));
	return {
		result: { date, children, menus: items(menuEnv) },
		raw: { date, attendance: attEnv, menu: menuEnv },
	};
}

// --- events ---------------------------------------------------------------

export async function fetchEvents(
	client: ValaClient,
	opts: { from?: string; to?: string; days?: number; child?: string },
): Promise<{ result: { from: string; to: string; items: CalendarEvent[] }; raw: unknown }> {
	const from = opts.from ? isoDate(opts.from) : todayIso();
	const days = opts.days ?? 30;
	if (!Number.isInteger(days) || days < 1) throw new UsageError("Invalid days value");
	const to = opts.to ? isoDate(opts.to) : addDays(from, days - 1);
	const envelope = await client.getCalendarEvents(from, to);
	let events = items(envelope);
	const filter = childFilter(opts.child);
	if (filter) events = events.filter((e) => matchChild(e, filter));
	events.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
	return { result: { from, to, items: events }, raw: envelope };
}

// --- chat -----------------------------------------------------------------

export interface ChatThread {
	child: { id: number; name: string; school: string | undefined };
	messages: ChatMessage[];
}

/** Chat messages per child, oldest first, trimmed to the latest `limit` (default 20). */
export async function fetchChat(
	client: ValaClient,
	opts: { child?: string; limit?: number },
): Promise<{ result: { items: ChatThread[] }; raw: unknown }> {
	const limit = opts.limit ?? 20;
	if (!Number.isInteger(limit) || limit < 1) throw new UsageError("Invalid limit value");
	const allChildren = await fetchChildren(client);
	let targets = allChildren;
	if (opts.child) {
		const needle = opts.child;
		targets = allChildren.filter((c) => matchChild(c, needle));
	} else {
		const cfg = loadConfig();
		const m = cfg.defaultChildId
			? allChildren.find((c) => c.child_id === cfg.defaultChildId)
			: undefined;
		if (m) targets = [m];
	}
	const fetched = await Promise.all(
		targets
			.filter((c) => c.school_id)
			.map(async (child) => {
				try {
					return {
						child,
						messages: await client.getChatMessages(child.school_id as number, child.child_id),
					};
				} catch (e) {
					if (e instanceof AuthError) throw e;
					return { child, messages: [] as ChatMessage[] };
				}
			}),
	);
	const time = (m: ChatMessage) => parseValaDate(m.created)?.getTime() ?? 0;
	return {
		result: {
			items: fetched.map(({ child, messages }) => ({
				child: { id: child.child_id, name: child.name, school: child.school_name },
				messages: [...messages].sort((a, b) => time(a) - time(b)).slice(-limit),
			})),
		},
		raw: fetched,
	};
}

// --- absence (mutating) ---------------------------------------------------

/** Each row says: "if the user typed something matching this pattern, find a
 * server-side absence type whose name starts with this prefix." This lets us
 * accept English aliases ("sick", "holiday") and short Icelandic forms ("veik",
 * "frí") while still matching the localized names returned by the API. */
const TYPE_ALIASES: Array<{ inputs: RegExp; nameStartsWith: string }> = [
	{ inputs: /^(sick|veik|sjuk)/i, nameStartsWith: "veik" },
	{ inputs: /^(vacation|holiday|leyfi|fri|frí)/i, nameStartsWith: "frí" },
];

export function pickAbsenceType(input: string, types: AbsenceType[]): AbsenceType | undefined {
	if (/^\d+$/.test(input)) {
		return types.find((t) => t.absence_type_id === Number(input));
	}
	for (const { inputs, nameStartsWith } of TYPE_ALIASES) {
		if (inputs.test(input)) {
			return types.find((t) => t.absence_type.toLowerCase().startsWith(nameStartsWith));
		}
	}
	const lc = input.toLowerCase();
	return types.find((t) => t.absence_type.toLowerCase().includes(lc));
}

export interface PreparedAbsence {
	child: Child;
	date: string; // ISO
	type: AbsenceType;
	body: PostAbsenceBody;
}

/** Resolve child + absence type and build the POST body. Does not write anything. */
export async function prepareAbsence(
	client: ValaClient,
	opts: { type?: string; date?: string; child?: string; comment?: string },
): Promise<PreparedAbsence> {
	if (!opts.type) throw new UsageError("Missing absence type. Examples: sick, vacation");
	const date = opts.date ? isoDate(opts.date) : todayIso();
	const [childrenEnv, typesEnv] = await Promise.all([
		client.getAllChildren(),
		client.getAbsenceTypes(),
	]);
	const child = pickOneChild(items(childrenEnv), opts.child);
	if (!child.placement_id) {
		throw new Error(
			`Cannot register absence for ${child.name}: missing placement_id (child may not be actively enrolled).`,
		);
	}
	const types = items(typesEnv);
	const type = pickAbsenceType(opts.type, types);
	if (!type) {
		const available = types.map((t) => `${t.absence_type} (id=${t.absence_type_id})`).join(", ");
		throw new UsageError(`Unknown absence type "${opts.type}". Available: ${available}`);
	}
	return {
		child,
		date,
		type,
		body: {
			child_id: child.child_id,
			placement_id: child.placement_id,
			date: toValaDate(date),
			absence_comment: opts.comment ?? null,
			absence_type_id: type.absence_type_id,
		},
	};
}

export async function submitAbsence(client: ValaClient, prepared: PreparedAbsence) {
	const response = await client.postAbsence(prepared.body);
	return { registered: true as const, body: prepared.body, response };
}

// --- doctor ---------------------------------------------------------------

export type CheckStatus = "ok" | "warn" | "fail";
export interface Check {
	name: string;
	status: CheckStatus;
	detail?: string;
}

export async function runDoctor(
	makeClient: (token: string | undefined) => ValaClient,
): Promise<{ status: CheckStatus; checks: Check[] }> {
	const checks: Check[] = [];
	const done = () => ({
		status: (checks.some((c) => c.status === "fail")
			? "fail"
			: checks.some((c) => c.status === "warn")
				? "warn"
				: "ok") as CheckStatus,
		checks,
	});

	const auth = loadAuth();
	if (!auth) {
		checks.push({ name: "auth", status: "fail", detail: "Not logged in. Run `vala login`." });
		return done();
	}
	checks.push({
		name: "auth",
		status: "ok",
		detail: `Token cached, user: ${auth.user?.name ?? "?"}`,
	});

	if (auth.validTo) {
		const exp = Date.parse(auth.validTo);
		if (Number.isFinite(exp)) {
			const remainingMs = exp - Date.now();
			if (remainingMs < 0) {
				checks.push({
					name: "token_expiry",
					status: "warn",
					detail: `valid_to (${auth.validTo}) has passed; token may still work in practice — see api_reachable.`,
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

	const client = makeClient(auth.token);
	try {
		const user = first(await client.getUser());
		checks.push({
			name: "api_reachable",
			status: "ok",
			detail: user?.name ? `Got /app/user as ${user.name}` : "Got /app/user (empty record)",
		});
	} catch (e) {
		checks.push({
			name: "api_reachable",
			status: "fail",
			detail:
				e instanceof AuthError
					? "Server rejected the token (401). Run `vala login`."
					: e instanceof Error
						? e.message
						: String(e),
		});
		return done();
	}

	try {
		const children = await fetchChildren(client);
		checks.push(
			children.length === 0
				? { name: "children", status: "warn", detail: "No children visible on this account." }
				: {
						name: "children",
						status: "ok",
						detail: `${children.length} child${children.length === 1 ? "" : "ren"} visible: ${children.map((c) => c.name).join(", ")}`,
					},
		);
	} catch (e) {
		checks.push({
			name: "children",
			status: "warn",
			detail: e instanceof Error ? e.message : String(e),
		});
	}
	return done();
}
