// Dev-only wrapper for the History content pipeline (run by "predev").
//
// This is the ONLY reader of HISTORY_INCLUDE_UNPUBLISHED in the repo.
// When the flag is "1", the dev server's content build includes
// unpublished records so an author can preview a draft locally; otherwise
// it builds published-only. Production builds never run this script and
// never read the flag (see build-history-content.js, which takes an
// explicit --include-unpublished CLI flag instead).
//
//   HISTORY_INCLUDE_UNPUBLISHED=1 npm run dev

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const args = process.env.HISTORY_INCLUDE_UNPUBLISHED === "1"
    ? ["--include-unpublished"]
    : [];
execFileSync(process.execPath, ["scripts/build-history-content.js", ...args], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    stdio: "inherit",
});
