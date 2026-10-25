---
name: vala
description: "Vala Leikskóli (Icelandic preschool) parent CLI. Use whenever the user asks about their kid's day at leikskóli — arrival, departure, lunch, what they ate, school menu, school events, school chat messages, or wants to register an absence (sick / vacation). Works for Icelandic parents whose preschool uses the Vala app (com.valaapp, by Advania / Infomentor). The CLI is headless (no browser), agent-friendly (JSON output, stable shapes, doctor + schema commands), and only touches a kid's own school data — read-only by default, with explicit confirmation on writes."
homepage: https://github.com/axelpaul/vala-cli
metadata:
  {
    "openclaw":
      {
        "emoji": "🧒",
        "requires": { "bins": ["vala", "bun"] },
        "install":
          [
            {
              "id": "bun",
              "kind": "manual",
              "label": "Install with Bun",
              "steps": ["bun add -g github:axelpaul/vala-cli"],
            },
          ],
      },
  }
---

# vala

Headless CLI wrapping the private API of the **Vala Leikskóli** Icelandic preschool app
(`com.valaapp`, by Advania, on InfoMentor / Oracle REST Data Services).

## What this is good for

Use it when the user wants to know anything about their kid's day at preschool from
a script or agent context — without opening the mobile app. Especially:

- **"How did my kid eat today?"** — `vala lunch` (or `vala today`).
- **"When did Jóna arrive at school?"** — `vala attendance` / `vala today`.
- **"What's on the school menu this week?"** — `vala lunch --week`.
- **"Any upcoming school events?"** — `vala events`.
- **"Did the school send me a message?"** — `vala chat`.
- **"My kid is sick today, register an absence."** — `vala absent --type sick`
  (mutating; requires `--yes` to skip confirmation).

## MCP alternative

The same functionality is available as an MCP server: `vala serve` (read-only tools
`whoami`, `kids`, `lunch`, `attendance`, `today`, `events`, `chat`, `doctor`;
`register_absence` only with `VALA_MCP_ENABLE_WRITES=1` and `confirm: true`).

## Before doing anything

Always start by checking the CLI is ready:

```bash
vala doctor --json
```

`status` is `ok` / `warn` / `fail`. On `fail` (most often "Not logged in"), tell the user
to run `vala login --phone <their-number>` themselves — login requires an Auðkenni
push approval on their phone, which only they can do. **Do not attempt `vala login` from
within an autonomous loop.**

If `doctor` returns `warn` about `token_expiry` but `api_reachable` is `ok`, the token
still works — `valid_to` is a soft hint that tends to extend with use. Proceed normally.

## Discovering response shapes

Every data command returns a stable JSON shape. To see it before parsing:

```bash
vala schema today --json          # full shape + example for one command
vala schema --json                # all commands
vala help --json                  # command catalog (name, description, usage, flags)
```

Use these for tool registration. The shape is hand-curated and matches what the
real command produces — treat it as the contract.

## Quick start

```bash
# verify
vala doctor --json

# read the kid's day
vala today --json
vala attendance --date 2026-05-15 --json
vala lunch --week --json          # weekdays only; weekends are filtered

# multi-child families
vala kids --json                  # list children + ids
vala kids --set-default Jóna      # one-time; subsequent commands default to her
vala today --child Siggi --json   # override for one call

# school
vala events --days 30 --json
vala chat --limit 10 --json

# write (mutating; needs --yes to bypass confirmation)
vala absent --type sick --json --yes
vala absent --type vacation --date 2026-06-10 --comment "Trip" --json --yes
```

## Output conventions

- **JSON by default when stdout is piped**, human-readable in a TTY. Pass `--json` to
  force JSON, `--pretty` to force human.
- **Errors are JSON when `--json` is set**: `{ "error": "...", "code": "...", "status": 401 }`.
- **Exit codes** are predictable:
  - `0` — success
  - `1` — runtime / network error
  - `2` — auth required or expired (run `vala login`)
  - `64` — bad usage (missing/invalid flags)
- **All data commands accept `--raw`** which dumps the underlying ORDS response envelope
  unchanged. Useful for debugging when shapes don't match what `schema` claims.

## The data model

A kid (`child_id`) belongs to a school (`school_id`, `school_name`) via a `placement_id`.
The user (the parent) sees all kids on their account via `vala kids`. Data commands return
one row per visible child — filter with `--child` (substring of name, or numeric id) if
you only want one.

Field naming is mixed: auth endpoints use **camelCase** (`oneTimeKey`, `successful`); data
objects use **snake_case** (`child_id`, `attendance_comment`, `time_from`). This matches
the upstream API — don't normalize.

Lunch rating enum (`eat`):
- `verygood` → Mjög vel (very well)
- `good` → Vel (well)
- `average` → Lítið (a little)
- `didnot` → Ekki neitt (nothing)
- `null` → no record (kid hasn't eaten yet today, weekend, etc.)

Absence type ids (from `/app/absence-types`):
- `2` → Veikindi (sick)
- `3` → Frí (vacation / time off)

The CLI accepts shorthand `--type sick` / `--type vacation` and looks up the id.

## What NOT to do

- **Don't call `vala login` autonomously.** It requires an Auðkenni push approval on
  the user's phone. Ask the user to run it.
- **Don't pass `--yes` to `vala absent` without confirming with the user first** —
  this actually registers an absence at the school. Always confirm date + reason +
  child first.
- **Don't store the contents of `~/.config/vala/auth.json` anywhere** — it contains
  the user's bearer token and kennitala in plaintext.
- **Don't poll `vala today` more than once a minute or so.** The API is run by a
  small Icelandic vendor; rate-limiting isn't aggressive but be polite.

## Environments

Defaults to production (`leikskoli.vala.is`). For testing, set `VALA_ENV=test` to point
at `leikskoli-test.vala.is`. The test environment is not generally useful for real data —
only use it for development.

## Edge cases the CLI handles

- **Multi-school families.** `vala lunch` keys menus by `school|date`, so kids at
  different leikskólar get the right menu each.
- **Multi-segment days.** A kid may have multiple attendance rows in one day
  (arrived → left for nap → returned → went home). `vala today` sorts by `time_from`
  and reports earliest arrival + last departure.
- **Weekends.** `vala lunch --week` skips Saturdays and Sundays since there's never data.
- **Not-yet-enrolled kids.** Kids visible to the user but without `placement_id` will
  appear in `vala kids` but `vala absent` will refuse with a clear error.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Session expired. Run "vala login"` (exit 2) | Token rejected by server | `vala login --phone <number>` (user must run) |
| `vala kids --json` returns empty `children` array | User has no placements OR token mismatch | Run `vala doctor` |
| `vala lunch` shows `(no menu)` for a kid | School hasn't published a menu via the API | Expected; not all leikskólar publish |
| `vala absent` returns 555 / ORDS-25001 | Date format wrong | Use `YYYY-MM-DD`; CLI converts internally |
| Hangs forever on a command other than `login` | Stalled connection | 30s default timeout should catch it; otherwise re-run |
