// API response shapes. Best-effort from the Hermes bundle — refined as we see live responses.

export interface LoginInitResponse {
	// POST /app-authentication/login returns a long server-side polling token.
	// The user does NOT see this — they just approve the Auðkenni push on their phone,
	// and the CLI polls /app-authentication/check-login with this token.
	successful?: boolean;
	oneTimeKey?: string;
	[k: string]: unknown;
}

export interface CheckLoginResponse {
	// POST /app-authentication/check-login — server long-polls and returns when
	// the user has approved (or failed). Confirmed shape (flat, not wrapped in `data`):
	//   {
	//     successful: true,
	//     token: "<bearer>",
	//     ssn: "1234567890",
	//     name: "Full Name",
	//     child_count: "2",
	//     first_child_name: "…",
	//     first_child_ssn: "…",
	//     valid_to: "2026-05-20T19:10:48Z"
	//   }
	// On failure the bundle reads `error` from the top-level response.
	successful?: boolean;
	token?: string;
	ssn?: string;
	name?: string;
	child_count?: string | number;
	first_child_name?: string;
	first_child_ssn?: string;
	valid_to?: string;
	error?: string;
	[k: string]: unknown;
}

export interface User {
	user_id?: number;
	name?: string;
	ssn?: string;
	email?: string;
	phone?: string;
	language?: string;
	see_all_notifications?: string;
	sound_notifications?: string;
	events_to_phone_calendar?: string;
	[k: string]: unknown;
}

/** Oracle REST Data Services (ORDS) standard envelope.
 * Every list-shaped response wraps results in this. Single-record GETs come
 * back as a list of length 1. */
export interface OrdsEnvelope<T> {
	items: T[];
	hasMore?: boolean;
	limit?: number;
	offset?: number;
	count?: number;
	links?: Array<{ rel: string; href: string }>;
}

export interface Child {
	child_id: number;
	name: string;
	ssn?: string;
	placement_id?: number;
	school_id?: number;
	school_name?: string;
	hour_from?: string;
	hour_to?: string;
	isresidentchild?: 0 | 1;
	image_link?: string;
	[k: string]: unknown;
}

/** A single attendance segment for one day. A child can have multiple per day
 * (e.g., arrived → went to nap → woke → left). */
export interface AttendanceSegment {
	time_from: string; // ISO
	time_to: string | null;
	attendance_comment: string | null;
	sleep: string | null;
	sleep_from: string | null;
	sleep_to: string | null;
	sleeping_minutes: number | null;
	eat: EatRating | null;
	type: string; // "Mæting", "Starfsmannaekla", etc.
	is_absence: 0 | 1;
}

/** One row per child in the attendance response. */
export interface AttendanceChild {
	child_id: number;
	child_name: string;
	school_name: string;
	attendance: AttendanceSegment[];
}

/** One row per school in the menu response. */
export interface MenuSchool {
	school_id: number;
	school: string;
	menu: MenuDay[];
}

export interface MenuDay {
	menu_date: string; // ISO
	breakfast: string | null;
	lunch: string | null;
	afternoon: string | null;
}

export type EatRating = "didnot" | "average" | "good" | "verygood";

export interface CalendarEvent {
	calendar_event_id: number;
	child_name: string;
	school_name: string;
	department_name: string | null;
	group_name: string | null;
	start_date: string; // ISO
	end_date: string; // ISO
	title: string;
	information: string | null;
	location: string | null;
	checklist: unknown;
}

export interface ChatMessage {
	id: number;
	created: string; // "DD.MM.YYYY HH:MM"
	app_user_id: number;
	app_user_name: string;
	school_opened: string | null; // "DD.MM.YYYY HH:MM"
	user_opened: string | null;
	message: string;
}

/** Decoded enum values from /app/absence-types (server may extend; check at runtime). */
export interface AbsenceType {
	absence_type_id: number;
	absence_type: string; // "Veikindi" | "Frí" | ...
}

export interface PostAbsenceBody {
	child_id: number;
	placement_id: number;
	date: string; // DD.MM.YYYY
	absence_comment: string | null;
	absence_type_id: number;
}

/** Icelandic labels for `eat` values, sourced from the app's i18n bundle. */
export const EAT_LABELS_IS: Record<EatRating, string> = {
	didnot: "Ekki neitt",
	average: "Lítið",
	good: "Vel",
	verygood: "Mjög vel",
};

export interface AuthState {
	token: string;
	user?: User;
	loggedInAt: string; // ISO
	validTo?: string; // ISO — when the token expires (from `valid_to` in check-login response)
}

export interface UserConfig {
	defaultChildId?: number;
	defaultChildName?: string;
}
