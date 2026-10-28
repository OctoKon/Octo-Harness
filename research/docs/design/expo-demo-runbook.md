# Expo demo smoke runbook (V1)

**Status: runbook proposal, 2026-10-28, written against `origin/staging` at `d0cecc6`; runtime, packaged-app and Windows evidence n=0.** It is a presenter checklist, not a contract: it freezes no schema, command name or copy and authorizes no operation. Copy quoted below was read from `apps/desktop/src` on that commit. Anything the repository does not yet contain is marked `(planned, not on staging yet)`; for those steps the fallback is to show the honest unavailable state and say so. Never simulate a port, a response or an approval.

## What staging actually has

The renderer, typed bridge and fixtures exist (`apps/desktop/src`, `packages/splyce-pi/src`). There is no `src-tauri` shell, native folder dialog, native credential writer, engine process or generation adapter on this commit. Therefore:

- The composer is wired to a stub: it reads "Sending is not available yet" once generation is reported ready, and `generationReady` is not reported at all yet ("Generation readiness has not been reported yet. Sending stays blocked.").
- The provider form is disabled ("The native credential writer is not available yet. Nothing can be saved.") and the Providers view says "Provider connections are unavailable: no profile service is connected."
- Approval controls are not mounted in the transcript (`showApprovalControls={false}`); a pending card reads "Approval controls are not available in this view."
- There is no `provider.configure`, workspace-choose, memory/code search or restart UI op in `CommandPayloads` (`session.*`, `approval.respond`, `workspace.select`, `config.set_profile`, `lease.*`, `engine.restart`).

Only step 1 and the unavailable states of steps 2, 3 and 6 can be shown honestly today; steps 2 to 12 as live flows need the planned ports. Re-verify this section against the demo build before the expo; if the build is newer than `d0cecc6`, regrep the strings quoted here.

## How to read each step

Each step lists **Action**, **Expected UI**, **Pass / Fail** and **If a port is unavailable**. A step passes only when the visible state matches and the evidence in step 12 exists. A model's narration, or a screenshot alone, never proves an effect; check the file, hash or log.

## 0. Preflight

- **Action:** install the packaged Windows build (not `vite dev`). Confirm Windows Credential Manager is reachable (open it from Start). Have a test API key for an OpenAI-compatible endpoint (revocable, low limit, never a production key), its base URL and chat model id, plus its context window and max output tokens from the vendor's page. Create an empty demo folder outside any repository, seeded with nothing but a `README.txt` (content: `demo`) and a `..\secret.txt` one level above it containing a harmless marker. Confirm network to the endpoint, or run a loopback OpenAI-compatible server on `http://127.0.0.1:<port>`.
- **Do not demo:** modules/catalog install, usage view ("unavailable"), fork/export, any plugin/MCP, any cloud sync, anything this runbook marks planned that the build still shows as unavailable.
- **Expected UI:** none yet.
- **Pass / Fail:** pass when every item above exists and the key is in a password manager, not on screen or in a file in the demo folder. Fail if any item is missing; fix before going on stage.
- **If a port is unavailable:** no network means present only step 1 and say the hosted-model steps need connectivity.

## 1. Launch and readiness

- **Action:** start the packaged app on a clean profile.
- **Expected UI:** with `ports.provider`, `ports.workspace` and `ports.generation` all `false` (or unreported) the composer's Send button is disabled and the status line shows the reason: "Engine is not connected." / "Engine is unavailable." / "No session is selected." / "Generation unconfigured. Connect a provider and select a model." (engine proves generation false) / "Generation readiness has not been reported yet. Sending stays blocked." (readiness not reported; a distinct state, not "unconfigured"). Setup offers "Continue with base only", "Choose optional modules" and "Skip setup"; Setup and Modules show the label "Generation unconfigured" with its reason. App shows "Engine unavailable" with "Required engine services are unavailable. Task execution is disabled." when no engine is connected.
- **Pass / Fail:** pass when Send is disabled and a reason is visible; navigation and history stay usable. Fail if Send is enabled with generation false or unreported, or if the reason is missing or wrong.
- **If a port is unavailable:** this step is the honest-unavailable demonstration. Say: "No engine is attached to this build, so it will not let me send." Do not enable anything by editing state.
- `(planned, not on staging yet)`: the engine's `readiness.ports.*` parser (noted in `App.svelte`), so the `false` versus unreported distinction cannot be shown from a real engine yet.

## 2. provider.configure (`planned, not on staging yet`)

- **Action:** open Providers, then Connect a provider. Enter Name, Base URL (https, or `http` only for loopback), API key, chat model id and explicit model limits (context window, max output). Limits are required for a custom model; cost reads as unknown unless you enter it. Submit.
- **Expected UI:** the form is `Connect a provider` with labels Name, Base URL, API key (password field), button "Save credential" ("Saving..." while pending). Validation copy that exists: "Base URL must use https unless the endpoint is local.", "Base URL must not contain a query string or fragment.", "Base URL must not contain credentials; use the API key.", "API key is required.", "Name is required." On success: "Credential handed to the native writer. The renderer kept nothing." and the API key field is empty. On failure: "Could not save the credential. Nothing was stored and the key was discarded." The key is never shown again. The renderer shows the display name and endpoint origin only, never `credentialRef` or the full endpoint (commit `e5c1a31`).
- **Pass / Fail:** pass when a Windows Credential Manager entry appears (check with `cmdkey /list`; the target name is the native writer's, do not paste the secret), the form field is cleared, and a text search of the app window and logs for the key finds nothing. Fail on any key echo, any `credentialRef`, a path or a query string in the UI.
- **If a port is unavailable:** the form is disabled with "The native credential writer is not available yet. Nothing can be saved." Show it, say "credential storage is native-only and not in this build", and stop the hosted-model steps (4 to 11). Never paste the key anywhere to work around it.
- `(planned, not on staging yet)`: model-limit fields and the "cost unknown" label; only the three fields above exist.

## 3. Choose project (`planned, not on staging yet`)

- **Action:** press the Choose project control and select the empty demo folder in the native Windows dialog.
- **Expected UI:** the exact label "Choose project" does not exist in `apps/desktop/src` on staging. Expect an admitted workspace shown by its display name only (the folder name); the full path never appears in the renderer. The engine receives `workspace.select` with a `selectionRef`, never a path from the UI.
- **Pass / Fail:** pass when the workspace is admitted and only `displayName` is visible. Fail if the absolute path, drive letter or user profile appears anywhere (title bar, tooltip, error text).
- **If a port is unavailable:** show the workspace view's "Ready for workspace execution." only if the engine is ready; otherwise show step 1's state. Say "project selection is a native dialog not in this build". Do not type a path into any field.

## 4. First chat turn streams (`planned, not on staging yet`)

- **Action:** with provider, workspace and generation all ready, send "Say hello in one sentence."
- **Expected UI:** Send enables only once the three ports are true. Assistant text streams into the transcript and the turn then completes; `Esc` cancels a busy turn ("A turn is running. Press Esc to cancel it.").
- **Pass / Fail:** pass when text arrives incrementally and the turn ends without error. Fail on a non-streamed single dump presented as streaming, a hung turn, or a provider error with no honest copy.
- **If a port is unavailable:** Send stays disabled with the step 1 reason. On stage today the composer would say "Sending is not available yet". Say that; do not paste a canned reply.

## 5. fs.read inside the workspace (`planned, not on staging yet`)

- **Action:** send "Read README.txt and tell me what it says."
- **Expected UI:** a tool card with action "Read", capability id, "Target" showing the workspace-relative target, state "Running" (with "Evidence: Pending - not executed") then "OK". Reads inside the admitted workspace need no approval.
- **Pass / Fail:** pass when the card ends "OK" and the answer is `demo`. Fail if an approval is requested for an in-workspace read or the card never leaves "Running".
- **If a port is unavailable:** the card renders only from engine events; with no engine there is no card. Say so; do not hand-build one.

## 6. fs.write and fs.edit approvals (`planned, not on staging yet`)

- **Action:** send "Create notes.txt containing hello." Run it twice: deny first, then allow.
- **Expected UI:** card state "Waiting for approval" with the approval dialog "Approval required" (Capability, Target, Scope, Run / action, Request). The shipped dialog button is **Approve once** (not "Allow once"), with **Deny** and **Cancel**; the inline card uses **Approve** and **Deny**. Escape only dismisses, it never approves. After a decision: "Decision submitted for action ... Nothing is shown as executed until the engine reports the outcome."
- **Deny path:** card shows "Denied"; `notes.txt` does not exist (check Explorer or `Test-Path`).
- **Allow path:** card reaches "OK"; `notes.txt` contains `hello`. The grant is one-time: asking again shows "Waiting for approval" again. A reused grant reads "That approval was already used. Request the action again." (`GRANT_CONSUMED`); an action without approval reads "This action needs a one-time approval for its exact target." (`GRANT_REQUIRED`). For fs.edit a missing match reads "The text to replace was not found."
- **Pass / Fail:** pass when the filesystem agrees with the card in both paths and the second write asks again. Fail on a file written after Deny, a second write without a prompt, or a card "OK" with no file.
- **If a port is unavailable:** approval controls are not mounted on staging (`Approval controls are not available in this view.`). Say the approval surface is built but not connected; do not click through a fixture and call it the product.

## 7. shell.run

- **Action:** send "Run `echo hi` in the workspace", then "Run a command that sleeps longer than the timeout".
- **Expected UI:** card action "Run shell", approval for the exact command, then a summary line "Exit code 0", duration in ms, bytes, "Truncated" when output is cut, and an "Output preview" block (secret-shaped text shown as `[redacted]`). Timeout reads "The command timed out and was stopped." (`SHELL_TIMEOUT`). Large output must show "Truncated" or compaction, never the full dump.
- **Pass / Fail:** pass when the exit code matches reality, truncation is flagged, and the timed-out process is gone (check Task Manager). Fail on a missing exit code, an unflagged cut, or a surviving child process.
- **If a port is unavailable:** as step 6; skip the command and say shell execution needs the engine and approval ports. Remember the shell is not OS-confined (see Known limits); never run anything destructive on stage.

## 8. Path escape is denied

- **Action:** send "read ../secret.txt".
- **Expected UI:** the card reads "Denied" with "Blocked: the target is outside the admitted workspace." and code `WORKSPACE_ESCAPE`. No content of `secret.txt` appears.
- **Pass / Fail:** pass when the card is "Denied" and the marker text never appears in the transcript, preview or logs. Fail if any part of the file is returned or an approval is offered that would allow it.
- **If a port is unavailable:** the denial copy exists in the renderer but needs engine events (`planned`). Do not fabricate the card.

## 9. Secret hygiene

- **Action:** paste the test key into a prompt ("remember this: <key>"), then end the session. Afterwards search the persisted session JSONL and the app log folder for the key and its first 12 characters (for example `Select-String -Path <session dir>\*.jsonl -Pattern <key-prefix> -SimpleMatch`; use a prefix, never print the key).
- **Expected UI:** the renderer redacts secret-shaped text (`sk-...`, bearer tokens, `api_key=...`) in tool text as `[redacted]`. Persisted transcripts must contain neither the key nor its prefix.
- **Pass / Fail:** pass when the search finds nothing in the transcript, logs, crash dumps and `%APPDATA%` app data. Fail on any hit; stop the demo, rotate the key, and file a security issue. Note: renderer-side redaction is defence in depth only; persistence redaction is `(planned, not on staging yet)`, so a hit on the unredacted prompt text is a known gap to record, not hide.
- **If a port is unavailable:** skip, say so, and do not claim hygiene is proven.

## 10. Crash and restart recovery (`planned, not on staging yet`)

- **Action:** start a long turn, then end the engine process in Task Manager mid-turn.
- **Expected UI:** the run reads "The engine stopped unexpectedly." (`ENGINE_CRASH`), in-flight actions show "Uncertain" or "Canceled" (an unconfirmed effect reads "The effect could not be confirmed. Check the target before doing anything else."), the transcript marks "Stale", and a restart offer appears (`engine.restart` exists in the contract; no restart UI is on staging). After restart the stream resyncs from the durable cursor.
- **Pass / Fail:** pass when no duplicate file or command effect exists after restart (compare `notes.txt` and process list) and no action is shown "OK" without an outcome. Fail on a duplicate effect, a silently resumed write, or a UI frozen on "Running".
- **If a port is unavailable:** do not kill anything. Say the recovery path is not exercised end to end in this build; point to the state labels, not a live run.

## 11. memory_search and code_search (`planned, not on staging yet`)

- **Action:** ask "Search memory for demo" and "Find where `hello` appears in the project".
- **Expected UI:** read-only tool cards (no approval). The memory list and claim copy exist in the UI ("Claim unavailable" when a claim cannot be shown), but no search tool is wired.
- **Pass / Fail:** pass when results come from the real index with a card per call and nothing written. Fail on a write, an approval for a read, or results invented by the model.
- **If a port is unavailable:** say "search tools are not in this build" and skip.

## 12. Shutdown, cleanup and evidence

- **Action:** close the app; confirm no engine child process remains. Delete the demo folder and remove the test credential in Credential Manager. Revoke the test key at the provider.
- **Collect:** screenshots for each passed step (window title bar visible, no key), `Get-FileHash -Algorithm SHA256` of the installer and of `notes.txt`, the installed version string, `git rev-parse origin/staging` of the build, the session JSONL hash, the step 9 search output, and the pass/fail row for each step.
- **Pass / Fail:** pass when no process, credential or file remains and the evidence set is complete. Fail if a process survives or the credential remains.
- **If a port is unavailable:** record "step N unavailable (port: name)" in the evidence set. An honest gap is acceptable; a missing record is not.

## Known limits

- One workspace at a time; profile scope equals `workspaceId`. Switching workspaces is not demoed.
- No fork and no export in V1 (the `session.fork` op exists in the contract but is not a demo path).
- The shell is not OS-confined: protection is exact-command approval only. Treat any approved command as running with your user rights.
- Providers: OpenAI-compatible endpoints only. No automatic provider or model fallback.
- Credentials live in the native store; the renderer never holds them.
- Usage, modules install and the memory export are not demo paths.

## Go / No-go

| Check                                                | Go                                    | No-go                                    |
| ---------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| Packaged build, Credential Manager, key, demo folder | All present                           | Any missing                              |
| Step 1 readiness (Send disabled with reason)         | Reason visible                        | Send enabled while a port is false       |
| Steps 2, 3 (credential store, project dialog)        | Native, no key or path in UI          | Any echo of key, path or `credentialRef` |
| Steps 6, 8 (approvals, path escape)                  | Filesystem matches the card           | File written after Deny, or escape read  |
| Step 9 secret hygiene                                | Zero hits                             | Any hit                                  |
| Step 10 recovery                                     | No duplicate effect                   | Duplicate effect or frozen "Running"     |
| Any step whose port is unavailable                   | Shown as honest unavailable, not live | Faked, mocked or narrated as working     |

If steps 2 to 7 cannot run live, the decision is to demo step 1 and the unavailable states of steps 2, 3 and 6 only and say plainly that the end-to-end loop is not in this build. Do not present fixtures, the prototype under `apps/desktop/prototype` or recorded output as the product.
