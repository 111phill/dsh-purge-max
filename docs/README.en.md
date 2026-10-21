<div align="center">

# Purge Community

**Helping your AI assistant stay focused on your learning and hands-on work.**

A self-hosted add-on for DeepSeek Harness (known in the community as a 破甲 / "jailbreak" plugin) · 80 host patches · 25 status layers

[![Release](https://img.shields.io/github/v/release/kingcharleslzy-ai/dsh-purge?label=release)](https://github.com/kingcharleslzy-ai/dsh-purge/releases)

Current version 1.6.36 · targets **DSH Desktop 0.2.1-rc.2** (rc.1 also passes)

</div>

---

## What it is

Purge Community runs entirely on your own machine and gathers the parts of daily use that cost the most attention:

- **See the state** — whether the install, patches and prompt injection are actually ready;
- **Fewer round trips** — repeated confirmations and interruptions collapse into one setting;
- **Always reversible** — apply, roll back and toggles are recorded, snapshotted first;
- **Easy to experiment** — prompts, rules and presets in one place, all undoable.

The goal is simple: let the assistant support your learning and hands-on experiments coherently, instead of stopping to ask before every step.

People usually call this a 破甲 ("armor-breaking") or unrestrained-mode plugin: it lowers interaction friction so the agent can keep working. It does not change the model itself, and it does not change what you are trying to do.

## Principles

| Principle | Meaning |
| --- | --- |
| Local first | Everything runs locally; no cloud account changes, no uploads of prompts or config |
| Observable | Every action reports status and evidence, never "it should be applied" |
| Reversible | Snapshots with manifests before apply, install and rollback |
| Never decides for you | It only removes friction; you choose what to change and enable |

## Scope

Local learning, personal projects, automation experiments and maintenance work. Use it on machines you own or are authorized to work on; get permission before touching anyone else's systems.

## Install

The installer snapshots first and **never** applies patches or restarts the app. Install, apply and restart are three separate steps.

- macOS: `scripts/install.sh` (`--dry-run` first)
- Linux CLI/Web: `scripts/install.sh`, with `DSH_NODE`, `PURGE_DSH_CLI`, `DSH_HOME`, `--profile=`
- Windows 11: `scripts/install.ps1` (`-DryRun` first)

### Install boundaries

- Before the plugin loads, the installer leaves DSH itself untouched; a failed step keeps the original entry point, the logs and the snapshot.
- It does not change your global npm registry, does not clear caches, and does not touch your other plugins or prompts.
- If a marketplace JSON install fails (issue #7), the plugin is not loaded yet: pick a dependency source or use the standalone installer instead of retrying the update repeatedly.

See [installation guide](INSTALLATION.md) for details and failure handling.

## Panel

A full page in the left sidebar: one line of state at the top, "Apply" as the primary action, everything else collapsed, help behind `?`. The maintenance page shows recent actions, backup usage and update preferences. Unused entries can be hidden for display only.

## Commands

`selfcheck`, `status`, `host-status`, `diagnose`, `reanchor`, `probe`, `audit`, `boost`, `preset`, `retry`, `usage` / `prune`, `backup` / `rollback`. See `purge-community --help`.

## Updates

Two separate preferences (check / install), default check-only every six hours. Installing never restarts the app — you decide when to reopen it.

## Compatibility

Plugin `dsh-purge-community` 1.6.36 · verified on DSH Desktop 0.2.1-rc.1 / rc.2 · Node ≥ 18.

## Troubleshooting

```sh
purge-community selfcheck --json
purge-community diagnose
purge-community audit --limit 20
```

If the panel does not open, confirm both sides run the same version, then follow [MAINTENANCE.md](MAINTENANCE.md); do not overwrite `Resources/app` directly.

## Development

`npm test`, `npm run check:docs`, `npm run check:client`, `npm run test:electron`, `npm run smoke`.

Agent-facing instructions live in [AGENTS.md](../AGENTS.md); when the two disagree, AGENTS.md wins.

**Keywords**: 破甲 · unrestricted mode · prompt injection · jailbreak · DSH plugin · status self-check · backup and rollback
