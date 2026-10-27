import { formatResults, runSmoke } from "./smoke-checks";

const url = process.argv.slice(2).find((arg) => arg !== "--");
if (!url) {
  console.error("usage: pnpm smoke <web url>");
  process.exit(2);
}

const results = await runSmoke(url);
console.log(formatResults(results));
process.exit(results.every((r) => r.ok) ? 0 : 1);
