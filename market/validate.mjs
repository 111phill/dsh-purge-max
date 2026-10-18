import fs from "node:fs";
import { parseMarketIndex, marketInstallTarget } from "@deepseek-ai/dsh-plugin-market-index";
const index = parseMarketIndex(JSON.parse(fs.readFileSync(process.argv[2] || "market-dist/index.json", "utf8")), "https://kingcharleslzy-ai.github.io/dsh-purge/index.json");
for (const plugin of index.plugins) for (const version of plugin.versions) {
  console.log(`${plugin.name} ${version.version}: ${marketInstallTarget(plugin.name, version).spec}`);
}
console.log("Official DSH format-1 validation passed");
