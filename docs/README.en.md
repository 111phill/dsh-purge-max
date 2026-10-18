# Purge Community

An independently maintained community fork of [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge), originally created by **小杨**. This is not an official upstream release. Original attribution, Git history and the MIT license are retained. This community distribution is free and is not offered for paid resale.

## What it does

DSH is not short of capability; it is gated four times. Purge removes those gates:

| Gate | How it is removed |
| --- | --- |
| Model | the user's `prompt-inject.md` is injected as a top-priority section every step; the stock identity line is stripped; a tail "boost" block states the instruction hierarchy, treats refusal as a malfunction, and resists sycophancy across turns |
| Approval | approvals auto-granted, never-sentence bypassed, fail-open when no UI channel, `run_code` / tool `ask` released, plan mode no longer hard-blocks |
| Sandbox | `confine()` passthrough, fs fence disabled, observation policy relaxed, denial wording neutralized |
| Turn | repeat-tool guard and result pruning disabled, Auto Review no longer denies, `ask_user_question` continues after 1s, UI messages always start a fresh turn |

83 host patches, all re-qualified against a pristine **0.2.1-rc.2** copy (64 written, 6 already at target, 0 failed). The panel lives in the **left rail** as a full page styled with DSH's own tokens; explanations sit in small `?` tips. `purge-community selfcheck` proves each of the 27 layers is live, and `diagnose` points at the exact file and line when a host update moves an anchor.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/kingcharleslzy-ai/dsh-purge/master/scripts/install.sh | sh
```

The script finds DSH Desktop, downloads the latest verified release, checks SHA256 and runs the installer with DSH's own runtime (it snapshots the profile first, then merges the old Purge entries into `dsh-purge-community`).

Then fully quit and reopen DSH, open **Purge** in the left rail, press **Apply**, and quit/reopen once more.

**Current version 1.6.5 — qualified against DSH Desktop 0.2.1-rc.2 (and rc.1).**

```
purge-community selfcheck     # 27-layer proof that each bypass is live
purge-community diagnose      # which patch anchor drifted, with line numbers
```

Maintenance snapshots stay local under `$DSH_HOME/dsh-purge-community/backups` (last 5 + one per day x7 + 200MB cap). Rollback restores plugin code and enablement only.

See the [Chinese README](../README.md) for the full feature table, panel tour and troubleshooting.

## Contributors

Thanks to [@heigit](https://github.com/heigit) for the reproduction, analysis and validation feedback in [issue #3](https://github.com/kingcharleslzy-ai/dsh-purge/issues/3), and [@luowang-ui](https://github.com/luowang-ui) for the Desktop CLI atomic-copy fix in [PR #1](https://github.com/kingcharleslzy-ai/dsh-purge/pull/1). See the [contributor list](../CONTRIBUTORS.md) for attribution.

## Updates and market

Automatic checks and automatic installation have separate switches in Maintenance. Checks default to 30 seconds after startup and every 6 hours; installation defaults off and preserves the legacy preference. Installation backs up and verifies releases, respects pinned versions, and waits for a manual restart. Update operations never restart DSH or reload its client automatically. Preferences are stored separately; existing profile settings and prompts remain unchanged.

Official-format custom market index: https://kingcharleslzy-ai.github.io/dsh-purge/index.json. Add it to DSH's experimental Custom plugin markets. Community registry admission remains a separate review process.

Thanks to [@OGHong](https://github.com/OGHong) for diagnosing the Electron ASAR check in [issue #5](https://github.com/kingcharleslzy-ai/dsh-purge/issues/5). The fix uses the existing original-fs disk adapter and was tested in Electron 44.7.0.
