/** Standalone installer, run with the selected DSH Desktop's Electron runtime. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
const exec = promisify(execFile);
const repo = "kingcharleslzy-ai/dsh-purge";
const hosts = new Set(["api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]);

async function get(url, limit, request) {
  for (let n = 0; n < 6; n++) {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || !hosts.has(u.hostname)) throw Error("Untrusted release URL");
    const response = await request(url, { redirect: "manual", signal: AbortSignal.timeout(60000), headers: { "user-agent": "purge-community-installer", accept: "application/vnd.github+json" } });
    if (response.status >= 300 && response.status < 400) {
      if (!response.headers.get("location")) throw Error("Invalid release redirect");
      url = new URL(response.headers.get("location"), u).href;
      continue;
    }
    if (!response.ok) throw Error(`Release download HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > limit) throw Error("Release file too large");
    const parts = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) throw Error("Release file too large");
      parts.push(chunk);
    }
    return Buffer.concat(parts);
  }
  throw Error("Too many release redirects");
}

export function verifyChecksum(bytes, text, filename) {
  const lines = text.trim().split(/\r?\n/).map(line => /^([a-f0-9]{64})\s+\*?([^\s]+)$/i.exec(line));
  const matches = lines.filter(row => row && row[2] === filename);
  if (matches.length !== 1 || matches[0][1].toLowerCase() !== createHash("sha256").update(bytes).digest("hex")) throw Error(`SHA256 verification failed: ${filename}`);
}

export function desktopCli(executable, platform = process.platform) {
  const resources = platform === "darwin"
    ? path.resolve(executable, "../../Resources")
    : path.join(path.dirname(executable), "resources");
  const relative = "dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js";
  const cli = ["app.asar", "app.asar.unpacked", "app"].map(layout => path.join(resources, layout, relative)).find(file => fs.existsSync(file));
  if (!cli) throw Error("Cannot find this DSH Desktop's CLI. Specify the installed DSH executable, not a different Node runtime.");
  return cli;
}

export async function bootstrapInstall(options = {}) {
  const { request = fetch, run = exec, log = console.log, executable = process.execPath, platform = process.platform,
    home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), profile = process.env.DSH_PROFILE || "desktop", dryRun = false } = options;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(profile)) throw Error("Invalid profile name");
  if (!fs.existsSync(path.join(home, "profiles", profile, "package.json"))) throw Error("Profile is not initialized; open DSH once first, or specify the correct home/profile.");
  const cli = options.cli || desktopCli(executable, platform);
  let version = options.version;
  if (!version) {
    const release = JSON.parse((await get(`https://api.github.com/repos/${repo}/releases/latest`, 1024 * 1024, request)).toString("utf8"));
    if (release.draft || release.prerelease) throw Error("Latest release is not stable");
    version = String(release.tag_name || "").replace(/^v/, "");
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Invalid release version");
  const filename = `dsh-purge-community-${version}.tgz`;
  const base = `https://github.com/${repo}/releases/download/v${version}`;
  log(`Downloading Purge Community ${version}...`);
  const archive = await get(`${base}/${filename}`, 50 * 1024 * 1024, request);
  const sums = (await get(`${base}/SHA256SUMS.txt`, 64 * 1024, request)).toString("utf8");
  verifyChecksum(archive, sums, filename);
  if (dryRun) { log("SHA256 verified; dry run, nothing installed."); return { version, dryRun: true }; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "purge-installer-"));
  try {
    const file = path.join(tmp, filename);
    fs.writeFileSync(file, archive, { mode: 0o600 });
    const tar = platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
    const listing = await run(tar, ["-tzf", file], { timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    if (!listing.stdout.trim() || listing.stdout.trim().split(/\r?\n/).some(name => !/^package\//.test(name) || name.includes("\\") || name.split("/").some(part => part === ".."))) throw Error("Invalid archive paths");
    await run(tar, ["-xzf", file, "-C", tmp], { timeout: 30000, windowsHide: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, "package/package.json"), "utf8"));
    if (manifest.name !== "dsh-purge-community" || manifest.version !== version || manifest.repository?.url !== `git+https://github.com/${repo}.git`) throw Error("Release package identity mismatch");
    const result = await run(executable, [path.join(tmp, "package/bin/community.js"), "migrate", file], {
      timeout: 600000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PURGE_DSH_CLI: cli, DSH_BASE: "", DSH_HOME: home, DSH_PROFILE: profile, PURGE_PROFILE_DIR: path.join(home, "profiles", profile) },
    });
    if (result.stdout?.trim()) log(result.stdout.trim());
    if (result.stderr?.trim()) log(result.stderr.trim());
    log("Installed. Settings preserved. Quit and reopen DSH manually when convenient; no restart or host patch was performed.");
    return { version, installed: true };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = {};
    for (const arg of process.argv.slice(2)) {
      if (arg === "--dry-run") options.dryRun = true;
      else if (arg.startsWith("--version=")) options.version = arg.slice(10);
      else if (arg.startsWith("--profile=")) options.profile = arg.slice(10);
      else throw Error(`Unknown argument: ${arg}`);
    }
    await bootstrapInstall(options);
  } catch (error) { console.error(error.stderr || error.message); process.exitCode = 1; }
}
