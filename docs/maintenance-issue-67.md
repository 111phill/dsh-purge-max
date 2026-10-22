# #67: Windows Electron checkpoint cleanup follows Junction targets

## Confirmed cause and scope

With Electron 44.7.0 / Node 24.21.0 on Windows, a copied dependency checkpoint retains Junction targets, but native `fs.rmSync(folder, {recursive:true})` traverses those targets. A disposable fixture reproduced all three external package files disappearing without an exception. The explicit lstat/unlink/rmdir control preserved them. macOS Node 22 did not reproduce this particular native-rm behavior; that does not qualify every other runtime.

The checkpoint code was introduced in 1.6.29 and remains in 1.6.45. Both successful `Maintenance.install()` and `rollback()` call `finish()`. This can affect other local dependencies, not just Purge. Changing `file:` to `link:` does not fix it. A successful install/import check before cleanup is insufficient evidence of file preservation afterward.

## Fix and cleanup audit

`lib/remove-tree.js` walks entries using lstat, unlinks symlinks/Junctions, and recurses only into ordinary directories. Final directory removal is non-recursive. ENOENT is idempotent; other errors propagate. Existing bounded retries do not fall back to native recursive deletion or expand permissions. Filesystem roots are rejected. This is protection for the selected cleanup tree and its links, not a guarantee against an adversary concurrently replacing ancestor directories.

The same cleanup is used by checkpoints, backup pruning, update overlays/retired trees, extraction staging, uninstall, skill/preset temporary directories, official-update stale folders and local artifact removal. Archive-sensitive host paths retain the existing hostFs/original-fs adapter. Runtime acceptance scripts also avoid native recursive cleanup, so test teardown cannot delete sentinel targets before assertions.

Raw bootstrap and detached uninstall helpers embed the same self-contained sync function, checked byte-for-byte in tests; they must run without installed-package imports. The PowerShell wrapper deletes only its three owned files, then removes its directory non-recursively. POSIX shell `rm -rf` on its private bootstrap directory does not traverse directory symlinks; no shell restart behavior was changed.

After a verified installation or rollback, checkpoint/prune failure is returned as `cleanup_warnings` and shown in the maintenance notice. Partial cleanup does not cause rollback using an already-partially-removed checkpoint. Failed install/verification still restores the dependency checkpoint; recovery errors remain errors. Prompts, permission behavior, update preferences and restart policy are unchanged.

## Upgrade and recovery

On affected Windows versions, prefer the **new independent installer** (download the current `scripts/install.ps1` from this repository) to reach 1.6.46. The old running plugin may still execute its own unsafe cleanup even if it downloads a fixed archive; installing files does not replace code already loaded in that process. Do not claim that publishing a new package hot-fixes an old process, and do not trigger its old update/rollback path to test this.

Preserve the current profile, local dependency directories and available backups before recovery. Do not uninstall/reinstall everything, delete lockfiles, clear pnpm caches or change proxies. After safe installation, let the user manually quit/reopen when convenient. No automatic restart or patch application is required by this fix.

If files were already lost, this fix cannot recreate them. Identify the exact affected dependency and restore from its verified source or an appropriate backup, preserving later user data. A Purge plugin backup is not a backup of every third-party package or arbitrary local data directory. Ask only for redacted runtime versions, affected dependency type and error codes; never request prompts, credentials or full configuration.

## Validation

- Original-vs-fixed isolated Junction probe on the actual Windows DSH Electron runtime.
- Sync/async deletion tests: root and nested links, cycles, dangling targets, retries, permission/IO errors and root refusal.
- Actual CLI + pnpm integration (`scripts/check-linked-install-runtime.mjs`): new isolated profiles with file/link dependencies, explicit root/nested Junctions, baseline install, upgrade, rollback, re-upgrade, injected install and rollback verification failures. Assert external package file hashes and configuration/prompt bytes after every stage.
- Same acceptance is required in CI on Windows/macOS Electron and Linux Node; runtime versions are printed. This does not launch the desktop UI, restart the user's DSH, apply host patches or call a model.
