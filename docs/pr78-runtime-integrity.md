# PR #78: runtime integrity review

This records installation lifecycle acceptance and remaining PR #78 review findings. It is not a release or an endorsement of all PR changes.

## Findings addressed

- An existing `app/runtime` directory must be checked using its own layout. A new sibling runtime can use an architecture subdirectory without invalidating the existing flat layout.
- A live link to another runtime is a conflict, including an incomplete target. Only a confirmed dangling link may be backed up and repaired. Permission failures must remain failures.
- Runtime lookup accepts a file in the flat layout or the executing process's architecture layout. A directory named `pnpm.mjs`, or another architecture's entry alone, does not establish compatibility.
- Missing CLI shims do not turn a failed runtime repair into success.

## Verification, 2026-10-24

Command: `--test test/runtime-layout.test.mjs test/atomic-files.test.mjs`.

| Execution environment | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| macOS Node | 14 | 0 | 0 |
| macOS isolated Electron, production write restrictions | 14 | 0 | 0 |
| Windows 11 / 4090 isolated Electron | 13 | 0 | 1 |

The Windows skip is the POSIX executable-bit and shell-launcher test. Windows junction creation, preservation and failure recovery ran on the actual Windows filesystem. Failure injection deliberately rejects link creation and target inspection; the tests verify that the original link and target contents remain intact.

The component runs above used empty temporary `DSH_HOME` directories. They exercise filesystem fixtures, not a full first-time user installation. An empty data directory alone is not proof of first-install acceptance.

## Real installation lifecycle acceptance

`scripts/check-install-lifecycle-runtime.mjs` and `scripts/install-lifecycle-scenarios.mjs` add actual Desktop CLI and pnpm transactions. No installer or package-manager mock is supplied. The candidate is built from the working tree and identified by SHA256, not assumed equivalent to the published release with the same version number.

The candidate tested on both platforms has version `1.6.50` and SHA256 `e1c7c6775e2818e610714eafed3af59b2ad5a530a0bfdddec5412e6f7ec1de2b`. It is an unpublished PR test package, not the published 1.6.50 artifact. All five scenarios passed on macOS and Windows 11 / 4090 under isolated Electron 44.7.0 / Node 24.21.0. Both final process exit codes were 0. The first Windows driver failed to capture its exit code correctly, so the entire five-scenario Windows run was repeated using `Start-Process -Wait -PassThru` and confirmed with an actual exit code of 0.

All 16 selected production configuration files on Mac and all 3 selected production configuration files on Windows retained their SHA256 values. This is a bounded configuration check, not a claim to have hashed every user file. Test commands did not change proxies, restart production DSH or apply host patches.

The additional macOS installation regression run covered bootstrap downloads/checksums, registry retry policy, maintenance backups/rollback, update recovery, runtime links and atomic files: 88 passed, 0 failed, 1 Windows-specific test skipped. These unit/fixture results are separate from the real lifecycle runs.

Each scenario uses a new home. The bootstrap must reject an uninitialized profile without writing it. The actual official CLI then initializes a `web` profile; a hand-written manifest is not substituted for initialization.

| Scenario | Initial package | Installation entry |
| --- | --- | --- |
| Official first installation | None | Actual `dsh plugin add` with the candidate archive |
| Community first installation | None | Candidate bootstrap CLI, local archive and SHA256 |
| Legacy migration | Original `dsh-purge@1.1.71` | Candidate bootstrap CLI |
| Community upgrade | `dsh-purge-community@1.6.47` | Candidate bootstrap CLI |
| Alias upgrade | Community 1.6.47 installed as `dsh-purge` | Candidate bootstrap CLI |

For each scenario the test checks dry-run immutability, installed package identity and dependencies in a fresh process, bundle references, snapshot rollback, a subsequent upgrade, and preservation of settings and user edits made after the snapshot. Empty pre-installation snapshots must explicitly refuse rollback because they contain no prior plugin; they are not described as an uninstall facility.

Failure recovery is a fault-injection test around a **real** transaction: pnpm installs the archive, then the test rejects the verification phase. Both failed installation and failed rollback must restore package manifest, lockfile and current configuration bytes; the restored package is imported and its dependencies resolved in a fresh process. Test data includes a custom prompt, rules, update preferences and a preset file. No prompt injection function or plugin `apply()` is called.

### Reproduction and boundaries

On macOS, prepare the CLI-only fixture as described in [installation isolation](INSTALLATION.md#isolated-acceptance), then run:

```sh
ELECTRON_RUN_AS_NODE=1 "$TEST_RUNTIME" scripts/check-install-lifecycle-runtime.mjs \
  "$TEST_RUNTIME" "$TEST_DSH_CLI" "$LEGACY_TGZ" "$PREVIOUS_COMMUNITY_TGZ" \
  "$CANDIDATE_TGZ" "$TEST_FIXTURE_ROOT"
```

These are maintenance-only variables pointing to disposable resources, not end-user installation instructions. On Windows, run the same script and arguments using an isolated Electron copy with `ELECTRON_RUN_AS_NODE=1`; use `Start-Process -Wait -PassThru` and check its `ExitCode`. Do not infer completion from the PowerShell call operator. Both platforms require the fixture marker and explicit runtime/CLI paths. macOS rejects `.app` fixtures and applies an inherited write restriction protecting the production app and data directory.

The fresh profile is `web`, initialized by the Desktop's real CLI. This validates CLI installation, migration and recovery, not desktop onboarding/login, UI market clicks, model behaviour or host-patch functionality. Existing package-manager caches may be reused; there is no forced offline mode, but this is not proof of a cold-cache network installation. The candidate is supplied locally with its checksum, so these results also do not validate public Release downloading or the published PowerShell wrapper. Those untested paths must remain explicit.

## Follow-up: explicit targets and actual architecture loading

The remaining identification, path scanning and plist findings are addressed:

- An Electron archive or a DSH-like executable name is insufficient. Read bounded package evidence for the bundled DSH host and its CLI, or the legacy community shell. Both sealed ASAR and unpacked forms are supported; a damaged preferred archive cannot fall through to a stale unpacked copy. Manifest sizes and archive offsets are bounded. This establishes layout identity, not publisher authenticity.
- Explicit application selection takes precedence and invalid selection stops. Arbitrary parent walks, mounted-volume enumeration and additional branding guesses were removed. Discovery of known default locations and OS registrations is opt-in; ambiguous valid targets are rejected.
- Native macOS `plutil` parses XML and binary metadata. Empty, non-string, traversal and control-character executable names, missing metadata and symlink escapes fail instead of falling back to a guessed executable. Positive shell tests use an inert executable marker; they are component tests, not installation acceptance.
- A current-architecture runtime link points directly to `runtime/<process.arch>`. The real CLI expects `app/runtime/primary-runtime/...`, so pointing to the containing `runtime` directory is insufficient. Existing live links and directories are preserved and conflicting layouts remain explicit errors.

### New acceptance results, 2026-10-24

The follow-up candidate archive SHA256 is `9684f926173569aec9c06efdd9371ec86082aacf548266ba2f32d18f45417643` (unpublished version 1.6.50). Documentation was expanded after this archive was tested; the runtime and installer payload was unchanged.

| Check | macOS ARM64 | Windows 11 x64 / 4090 |
| --- | --- | --- |
| Real Electron / pnpm loading | Electron 44.7.0, pnpm 11.28.5 | Electron 44.7.0, pnpm 11.28.5 |
| Reconstructed architecture layout | `runtime/arm64` | `runtime/x64` |
| Real CLI lifecycle scenarios above | 5 passed, process exit 0 | 5 passed, process exit 0 |
| Target / plist / runtime / atomic component tests under Electron | 26 passed | 21 passed, 5 macOS/POSIX-only skips |
| Actual isolated host identity and explicit executable lookup | Passed | Passed |
| Production configuration SHA256 comparison | 16 checked, 0 changed | 3 checked, 0 changed |

The complete repository automated suite on macOS also passed: 328 passed, 0 failed, 12 platform/conditional skips. The installation-focused subset passed 127 with 5 skips. These automated counts are separate from the actual CLI transaction scenarios.

A Windows test initially attempted to create malformed ASAR fixtures through Electron's virtual `node:fs` interface and failed. The test now uses `original-fs` through `diskFs()` for physical archive bytes; it was rerun successfully on both real Electron runtimes. The failed run was not counted as acceptance.

`scripts/check-architecture-runtime.mjs` deliberately rearranges a **new disposable marked CLI fixture** into its executing architecture's layout, preserves its copied old link, creates the corrected link, then executes the real pnpm loader. Run it with that fixture's Electron in Node mode before running the lifecycle command above. Never run it against an installed application. The lifecycle harness then exercises actual official CLI/pnpm transactions, import/dependency resolution, migration, rollback, re-upgrade and injected verification-failure recovery. No installer or package-manager mock is used.

### Boundaries that remain

- These are native ARM64 and x64 executions on separate machines with reconstructed architecture directory layouts. No cross-architecture emulation, universal-binary switching or every independently distributed DSH variant was tested.
- Public Release downloading, the published PowerShell wrapper, Desktop onboarding and UI market clicks are distinct from this local candidate CLI route and were not part of this follow-up.
- No production DSH restart, host patch application, model generation or prompt-effect evaluation occurred. Existing feature payloads and user settings were not edited.
- PR #78 is updated for review only. No merge, version bump or release is performed.
