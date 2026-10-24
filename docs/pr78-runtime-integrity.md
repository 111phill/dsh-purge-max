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

## Still required before approval

- Resolve the PR's broad Electron recognition: merely finding `app.asar` must not identify an unrelated application as DSH.
- Replace volume-wide discovery and additional branding guesses with explicit target selection and bounded evidence.
- Validate macOS executable metadata, including binary plists, path boundaries and malformed metadata; do not silently fall back to another executable.
- Test the actual loader/CLI with the architecture layout; file existence alone is insufficient.
- Published download/wrapper and Desktop UI acceptance remain distinct from the local candidate CLI route.

Do not infer that all PR changes or all DSH variants passed from the installation results. The outstanding target-identification and metadata issues still block approval; no merge, version bump or release is warranted by this report alone.
