# vala-cli

CLI and MCP server for the [Vala Leikskóli](https://leikskoli.vala.is/) preschool parent app:
lunch ratings, attendance, school events, chat and absence registration from the terminal or
an AI assistant.

> Unofficial — not affiliated with Vala, Advania or InfoMentor. The API was reverse-engineered
> from the Android app and may change without notice.

## Install

Needs [Bun](https://bun.sh) ≥ 1.1 and Auðkenni (rafræn skilríki) on your phone.

```sh
bun add -g github:axelpaul/vala-cli     # install
bun add -g github:axelpaul/vala-cli     # update (re-run; pulls the latest main)
bun remove -g vala-cli                  # uninstall
```

This puts `vala` in `~/.bun/bin`. Check with `vala --version`.

**Prebuilt binaries:** standalone executables for Linux, macOS and Windows (x64/arm64) are
attached to each [GitHub release](https://github.com/axelpaul/vala-cli/releases), with a
`SHA256SUMS` file. Download `vala-<os>-<arch>`, `chmod +x` it and put it on your `PATH`. No
Bun needed.

## Authentication

Log in with Auðkenni from any shell. Either the phone flow or the Auðkennisappið flow
started by kennitala; both wait for you to approve on your phone.

```sh
vala login                              # interactive, asks for phone
vala login --phone <phone-number>
vala login --kennitala <10-digit-kennitala>
vala logout
vala whoami
```

`--phone` and `--kennitala` are mutually exclusive. Use `--kennitala` if you prefer the
**App** option in Auðkenni: the CLI starts Vala's parent-app Signet flow, prints the Auðkenni
confirmation code, and polls until approval completes.

The session token is stored in `~/.config/vala/auth.json` (mode `0600`, see
[Configuration](#configuration)). That file also contains your name, kennitala and phone —
fine on a single-user machine, not something to sync to a public backup.

Sessions are short-lived on paper (a few hours) but often last longer. Re-run `vala login`
when commands start returning *Session expired*. The MCP server never logs in by itself; log
in once in your own terminal.

## CLI usage

```
vala kids [--set-default <name>]              list children; pick a default
vala today [--child NAME]                     arrival / lunch / departure / menu
vala attendance [--child NAME] [--date YYYY-MM-DD]
vala lunch [--child NAME] [--date YYYY-MM-DD] [--week]
vala events [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days N] [--child NAME]
vala chat [--child NAME] [--limit N]          recent messages from school
vala absent --type sick|vacation [--date YYYY-MM-DD] [--child NAME] [--comment "..."] [--yes]
vala doctor                                   pre-flight check
vala schema [<command>]                       JSON response shapes
vala serve                                    MCP server on stdio
```

### Examples

```sh
vala today                                      # what's happening right now
vala lunch --week                               # last 7 days of lunch ratings, weekdays only
vala attendance --date 2026-05-15               # specific day
vala events --days 60                           # next 60 days of the school calendar
vala chat --child <child-name> --limit 5        # last 5 messages
vala absent --type sick                         # register today as a sick day (asks to confirm)
vala absent --type sick --date 2026-05-21 --yes # non-interactive
```

### Global flags

| Flag | Meaning |
|---|---|
| `--json` | Machine-readable output (always on when stdout is piped). |
| `--pretty` | Force human output even when piped (useful for `vala today \| less`). |
| `--raw` | (where supported) Dump the raw API envelope for debugging. |

### Picking a child

Without a filter, commands show all children on the account. Set a default once and you can
drop `--child`:

```sh
vala kids --set-default <child-name>
```

The filter matches `child_id` or a case-insensitive substring of the name.

### Agent-friendly output

JSON output has stable shapes and predictable exit codes:

```sh
vala doctor --json     # auth state, token expiry, server reachable
vala schema --json     # response-shape catalog for all commands
vala schema today      # shape for one command
vala help --json       # command list (name, description, usage, flags)
```

| Exit code | Meaning |
|---|---|
| 0 | OK |
| 1 | Runtime / network error |
| 2 | Auth required or expired (run `vala login`) |
| 64 | Bad usage (missing/invalid flags) |

### OpenClaw skill

This repo ships a `SKILL.md`. To use it as an [OpenClaw](https://github.com/openclaw/openclaw)
skill, symlink it into your workspace:

```sh
mkdir -p ~/.openclaw/workspace/skills/vala
ln -s /path/to/vala-cli/SKILL.md ~/.openclaw/workspace/skills/vala/SKILL.md
```

## MCP server

`vala serve` starts a [Model Context Protocol](https://modelcontextprotocol.io) server on
stdio. It uses the same code as the CLI and the login from `vala login`.

| Tool | Access | Description |
|---|---|---|
| `whoami` | read | Signed-in parent: name, email, language (kennitala and phone omitted). |
| `kids` | read | Children on the account with school and hours (kennitala omitted). |
| `lunch` | read | Menu and eat rating per child for a date, or the 7 days ending on it (`week`). |
| `attendance` | read | Arrival/departure, sleep, eat rating and comments for a day. |
| `today` | read | Today's attendance plus each school's menu. |
| `events` | read | School calendar events for a date range (default next 30 days). |
| `chat` | read | Latest chat messages per child (default 20). |
| `doctor` | read | Login state, token expiry, API reachable, children visible. |
| `register_absence` | **write** | Register a sick/vacation absence. Hidden unless writes are enabled. |

All read tools accept an optional `child` (id or name substring), like `--child`.

**Enabling writes.** `register_absence` is only listed when the server is started with
`VALA_MCP_ENABLE_WRITES=1`, and every call must include `"confirm": true`. It notifies the
school, so the assistant should confirm child, date and reason with you first.

**Not exposed over MCP:** `login`/`logout` (need an interactive Auðkenni approval on your
phone), `kids --set-default` (local preference; set it in the CLI), `schema` (MCP tools
already describe their inputs) and `--raw` dumps.

### Claude Code

```sh
claude mcp add vala -- vala serve
# with writes:
claude mcp add vala -e VALA_MCP_ENABLE_WRITES=1 -- vala serve
```

### Claude Desktop, Cursor and other JSON-configured clients

```json
{
  "mcpServers": {
    "vala": {
      "command": "vala",
      "args": ["serve"],
      "env": { "VALA_MCP_ENABLE_WRITES": "1" }
    }
  }
}
```

Leave out `env` to stay read-only. GUI apps often don't have `~/.bun/bin` on their `PATH`; if
the server fails to start, use the absolute path from `which vala` as `command`.

## Configuration

| Variable | Description |
|---|---|
| `VALA_MCP_ENABLE_WRITES` | Set to `1` to expose `register_absence` in the MCP server. |
| `VALA_ENV` | `test` talks to the test backend (`leikskoli-test.vala.is`). Default is production. |
| `VALA_CONFIG_DIR` | Override the config directory. |
| `XDG_CONFIG_HOME` | If set, config lives in `$XDG_CONFIG_HOME/vala/`. |
| `NO_COLOR` | Disable ANSI colours. |

Files, in `~/.config/vala/` by default (`0600`, directory `0700`):

- `auth.json` — session token and the user record from login.
- `config.json` — default child (`vala kids --set-default`).

## Development

```sh
bun install
bun run check       # biome + tsc + tests
bun test            # tests only (includes MCP tool-list tests)
bun run build       # standalone binary at ./vala
bun src/index.ts serve   # run the MCP server from source
```

Request and shaping logic lives in `src/lib/queries.ts` and is shared by the CLI commands
(`src/commands/`) and the MCP server (`src/mcp/server.ts`). Releases: pushing a `v*` tag runs
`.github/workflows/release.yml`, which builds the binaries and publishes a GitHub release.

The API was reverse-engineered from the Android Hermes bundle of `com.valaapp` v2.6.1
(Advania / InfoMentor on Oracle REST Data Services). See `src/lib/api.ts` for the typed
client and per-endpoint notes. Please be polite to the API: don't poll more than about once a
minute.

### Not yet implemented

- Photo / album download (`/app/albums/`, `/app/album-pictures/`)
- Notifications inbox (`/app/notifications`)
- Multi-guardian access management (`/app/give-user-access` etc.)
- Cancelling an absence (no documented endpoint found in the bundle)
