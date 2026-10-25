// vala doctor — pre-flight health check. Useful for agents (and humans) to
// verify the CLI is ready to do real work before issuing data commands.

import { ValaClient } from "../lib/api.ts";
import { color, isJsonMode, printJson } from "../lib/output.ts";
import { type CheckStatus, runDoctor } from "../lib/queries.ts";

interface DoctorFlags {
	json?: boolean;
	pretty?: boolean;
}

export async function doctorCommand(flags: DoctorFlags): Promise<void> {
	const json = isJsonMode(flags);
	const report = await runDoctor((token) => new ValaClient({ token }));

	if (json) {
		printJson(report);
		if (report.status === "fail") process.exit(2);
		return;
	}

	const icon: Record<CheckStatus, string> = {
		ok: color.green("✓"),
		warn: color.yellow("!"),
		fail: color.red("✗"),
	};
	for (const c of report.checks) {
		console.log(`  ${icon[c.status]} ${color.bold(c.name)}  ${color.dim(c.detail ?? "")}`);
	}
	console.log("");
	if (report.status === "ok") console.log(color.green("All checks passed."));
	else if (report.status === "warn") console.log(color.yellow("Some checks have warnings."));
	else {
		console.log(color.red("Checks failed."));
		process.exit(2);
	}
}
