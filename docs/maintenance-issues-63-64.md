# Issues #63 / #64: compatibility evidence and honest apply diagnostics

## #64: confirmed reporting defect

The incomplete response previously exposed `failed` and `cmd_flash` but omitted two inputs to the completion decision: host writes and configuration restoration. When neither exposed field supplied a failure, the frontend fabricated `CMD silence not pinned (unknown)`. Thus even `cmd_flash.ok: true` could be displayed as a CMD failure. This is reproducible without touching a host installation.

The response now includes `host_written` and `hook_restore_failed`. The UI reports those conditions, actual failed items, CLI runtime failure and explicit terminal-check failure independently. An older backend without these fields displays “specific cause not returned”. It remains an error and does not turn into success or a restart request. The banner no longer asserts that a prompt was persisted when the response does not prove that.

This fixes the diagnostic message, not every possible cause of incomplete application. The screenshot also reports an unknown host version and low write counts. Obtain the client distribution/name, client and underlying DSH versions, OS, and the redacted diagnostic state before concluding why that user's host operation was incomplete. Do not request full prompts, environment variables, credentials or settings.

Completion predicates, host modifications, prompts, permission configuration and restart behavior are unchanged. Six new tests cover older responses, actual failure signals, combined failures, translations and the real React Apply interaction using a mocked HTTP boundary. The full panel and repository suites must pass. No live apply or restart is part of these tests.

## #63: third-party layout investigation, not qualification

Inspected `anywhere-labs/dsh-desktop` at commit `06446375d9e2b6fcbe468a902d45696893de26fd`:

- `dsh-desktop-next/package.json`: package `dsh-desktop-next`, version `2.0.19-next`, product `DSH NEXT`.
- `dsh-desktop-next/src/main.ts:119`: primary runtime is selected under `runtime/<process.arch>/primary-runtime`.
- `dsh-desktop-next/src/desktop-runtime.ts:287`: host entry is `lib/host.js` in the application root.

A disposable filesystem fixture with that package/entry shape reproduces `detectSurface() -> web` and `currentHost() -> empty` in Purge 1.6.44, even when the fixture contains an `@deepseek-ai` directory. This supports the reporter's discovery mismatch, but is not a test of their packaged binary and does not establish complete compatibility.

The attached repair script was read as text only, not executed. Its backup failure path logs an error and still writes; its `--verify-only` path can invoke the runtime-link repair; its fallback runtime search may select a different architecture. Do not distribute it as a verified read-only diagnostic or drop-in supported adapter. Do not use paths from the reporter's machine on another computer.

#63 remains open. Standard DSH Desktop and DSH NEXT are distinct targets; ask for the exact release and OS before runtime qualification. Nothing in the diagnostic fix establishes support for host-policy modifications on a new distribution. #64 must not be closed merely because the misleading banner is gone: the reporter's underlying condition still needs confirmation.
