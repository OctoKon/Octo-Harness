# Bootstrap release smoke

This runner uses the real uninstrumented Windows executable and its bundled Node
engine through external `tauri-driver`. It never starts a dev server, substitutes
IPC, adds capabilities or treats missing tools/app as a pass. It is the bootstrap
unavailable/readiness and child-exit subset, not full TD-11 or UI qualification.

Run from the repository root after building the release app and staging its engine
resources beside the executable:

```powershell
& apps/desktop/src-tauri/resources/engine/node.exe tests/bootstrap/release-smoke.mjs
```

`SPLYCE_SMOKE_APP` can select an installed release executable. The default is
`apps/desktop/src-tauri/target/release/splyce-desktop.exe`; testing that build is
packaged-resource evidence, not installer/uninstall evidence. Driver paths can be
selected using `SPLYCE_TAURI_DRIVER` and `SPLYCE_EDGE_DRIVER`, but must match the
qualified hashes. Ports 4444 and 4445 must be free. Run in an interactive Windows
desktop session. The runner closes only its own app and driver process tree; its
crash case terminates the confirmed direct bundled Node child, never an ambient
Node process. Screenshots, process identities, artifact hashes, failures and driver
logs remain under ignored `apps/desktop/src-tauri/target/bootstrap-smoke/`.

The production DOM must expose `data-connection-state` and validated
`data-readiness-policy/store/receipts` on `[data-testid="app-shell"]`, an unavailable
banner, and the native lifecycle's disconnected state with **Engine stopped**.
These reflect real application state; no test-only IPC is required. The native
workspace dialog currently returns `POLICY_DENIED`; smoke checks this harmless
command remains denied and the app remains unavailable. This does not qualify
general filesystem/tool effects or native UIA accessibility.

## Qualified tool inputs

The [official Tauri overview](https://v2.tauri.app/develop/tests/webdriver/) and
[manual setup](https://v2.tauri.app/develop/tests/webdriver/manual-setup/) allow a
custom W3C protocol harness. Node's standard `fetch` avoids another client package.
The locked embedded WebdriverIO route remains required separately; this external
release smoke does not replace it.

- Node **24.22.1**: the repository's packaged engine runtime.
- `tauri-driver` **2.1.0**, the stable 2.x crate from the
  [official Tauri repository](https://github.com/tauri-apps/tauri), licensed
  **Apache-2.0 OR MIT**. Crate SHA-256:
  `2f2e29bd6900fb718dfdc06f2e7a371d6087c085daaf83709847ef3e6b0c1953`.
  Built with Rust **1.99.1**, the published crate lockfile and this isolated command:

  ```powershell
  cargo +1.99.1 install tauri-driver --version 2.1.0 --locked --root apps/desktop/src-tauri/target/smoke-tools --target-dir apps/desktop/src-tauri/target/smoke-driver-build
  ```

  The runner binds the locally built executable hash; rebuilding requires explicit
  qualification of the new hash. `tauri-driver-inventory.json` records published
  package versions, licenses and source repositories from Cargo metadata. Original
  crate licenses and lockfile remain in the Cargo registry install sources.

- Microsoft Edge WebDriver **155.0.4283.62**, x64, matches the installed WebView2
  **155.0.4283.62**. Microsoft documents matching the first three version components
  in its [WebDriver guide](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/).
  Selected official archive:
  [Microsoft driver download](https://msedgedriver.microsoft.com/155.0.4283.62/edgedriver_win64.zip).
  Archive SHA-256:
  `00dd7fbc6fc4bd68e6e86badbe76e6570513414085f476e73d3787ba3410d562`.
  Extract to `target/smoke-tools/edge-155.0.4283.62/` beneath `src-tauri`, retaining
  `Driver_Notes/EULA`, `LICENSE` and `credits.html`. Microsoft software terms apply
  to the driver; bundled third-party notices are separate and are not relabeled MIT.

The release runner checks exact driver binary hashes before execution and records
the app hash and runtime version. No tool downloads occur inside a smoke run.

Self-check the fail-closed readiness assertions:

```powershell
node --test tests/bootstrap/release-smoke.test.mjs
```

The embedded route still needs exact compatible WebdriverIO/service/test-plugin
pins, a separate Cargo `e2e` feature and test-only capability/config, and proof
these are absent from the release. Their integration belongs to the build owner;
no guessed pins or broad automation permissions are added by this runner.
