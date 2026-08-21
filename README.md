# vala-cli

Headless CLI for the [Vala Leikskóli](https://leikskoli.vala.is/) parent app.
Lunch ratings, attendance, school events, chat, and absence registration —
without ever opening the mobile app.

Built for Icelandic preschool parents who already live in the terminal.

## Install

Needs [Bun](https://bun.sh/) ≥ 1.3 and Auðkenni (rafræn skilríki) configured
on your phone.

```sh
git clone <repo> vala-cli && cd vala-cli
bun install
bun link              # exposes `vala` on your PATH
vala login --phone <phone-number>
```

## Auth

Authenticate with Auðkenni from a headless shell. Choose either the phone flow
or the Auðkennisappið flow initiated by kennitala; both wait for approval on
your phone.

```sh
vala login                  # interactive, asks for phone
vala login --phone <phone-number>
vala login --kennitala <10-digit-kennitala>
vala logout
vala whoami
```

`--phone` and `--kennitala` are mutually exclusive. Use `--kennitala` when
you prefer the **App** option in Auðkenni: the CLI starts Vala's parent-app
Signet flow, prints the Auðkenni confirmation code, and polls until approval
completes.

The session token is cached at `~/.config/vala/auth.json` (mode `0600`).
That file also contains your name, kennitala, and phone — fine for a single-user
machine, **not** something you want syncing to a public backup.

Sessions are short-lived (a few hours on paper, possibly much longer in
practice). Re-run `vala login` when commands start returning *Session expired*.

## Commands

```
vala kids [--set-default <name>]              list children; pick a default
vala today [--child NAME]                     arrival / lunch / departure / menu
vala attendance [--child NAME] [--date YYYY-MM-DD]
vala lunch [--child NAME] [--date YYYY-MM-DD] [--week]
vala events [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days N] [--child NAME]
vala chat [--child NAME] [--limit N]          recent messages from school
vala absent --type sick|vacation [--date YYYY-MM-DD] [--comment "..."] [--yes]
```

### Global flags

| Flag | Meaning |
|---|---|
| `--json` | Machine-readable output (always-on when stdout is piped). |
| `--pretty` | Force human output even when piped (useful for `vala today \| less`). |
| `--raw` | (where supported) Dump the raw API envelope for debugging. |

### Picking a child

Most commands work for both your kids at once if you don't filter.
Set a default once and you can drop `--child`:

```sh
vala kids --set-default <child-name>
```

The filter matches by `child_id` or a case-insensitive substring of the name.

### Examples

```sh
vala today                                     # what's happening right now
vala lunch --week                              # last week of lunch ratings, weekdays only
vala attendance --date 2026-05-15              # specific day
vala events --days 60                          # next 60 days of school calendar
vala chat --child <child-name> --limit 5        # last 5 messages
vala absent --type sick                        # register today as a sick day (asks to confirm)
vala absent --type sick --date 2026-05-21 --yes # non-interactive
```

## Environments

Defaults to production. Set `VALA_ENV=test` to talk to the test backend
(`leikskoli-test.vala.is`).

## Agent-friendly

JSON output is the primary interface. Stable shapes, predictable exit codes,
plus dedicated commands for agents:

```sh
vala doctor --json     # pre-flight: auth state, token expiry, server reachable
vala schema --json     # full response-shape catalog for all commands
vala schema today      # shape for one command
vala help --json       # command list (name, description, usage, flags)
vala version           # CLI version
```

### OpenClaw integration

This repo ships a `SKILL.md` at the root. To use it as an
[OpenClaw](https://github.com/openclaw/openclaw) skill:

```sh
mkdir -p ~/.openclaw/workspace/skills/vala
ln -s "$(pwd)/SKILL.md" ~/.openclaw/workspace/skills/vala/SKILL.md
```

OpenClaw will pick it up on the next workspace reload. The skill description
covers when to trigger, the data model, mutating-call safety, and the full
command surface.



| Exit code | Meaning |
|---|---|
| 0 | OK |
| 1 | Runtime / network error |
| 2 | Auth required or expired (run `vala login`) |
| 64 | Bad usage (missing/invalid flags) |

## Development

```sh
bun run check       # biome + tsc
bun test            # unit tests for pure helpers
bun run build       # standalone binary at ./vala
```

The API surface was reverse-engineered from the Android Hermes bundle of
`com.valaapp` v2.6.1 (Advania / Infomentor on Oracle REST Data Services).
See `src/lib/api.ts` for the typed client and the per-endpoint notes.

## Not yet implemented

- Photo / album download (`/app/albums/`, `/app/album-pictures/`)
- Notifications inbox (`/app/notifications`)
- Multi-guardian access management (`/app/give-user-access` etc.)
- Cancelling an absence (no documented endpoint found in the bundle)
