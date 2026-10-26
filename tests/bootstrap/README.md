# Bootstrap release smoke

This runner uses the real uninstrumented Windows executable and its bundled Node
engine through external `tauri-driver`. It never starts a dev server, substitutes
IPC, adds capabilities or treats missing tools/app as a pass. It is the bootstrap
unavailable/readiness and child-exit subset, not full TD-11 or UI qualification.

Run from the repository root after building the release app and staging its engine
resources beside the executable. The preparation script rebuilds the pinned
`tauri-driver`, selects the Microsoft WebDriver for the registered Evergreen
WebView2 runtime, and writes a per-run provenance manifest before the smoke starts:

```powershell
& tests/bootstrap/prepare-release-drivers.ps1
& apps/desktop/src-tauri/resources/engine/node.exe tests/bootstrap/release-smoke.mjs
```

`SPLYCE_SMOKE_APP` can select an installed release executable. The default is
`apps/desktop/src-tauri/target/release/splyce-desktop.exe`; testing that build is
packaged-resource evidence, not installer/uninstall evidence. Ports 4444 and 4445
must be free. Run in an interactive Windows desktop session. The runner closes
only its own app and driver process tree; its crash case terminates the confirmed
direct bundled Node child, never an ambient Node process. Screenshots, process
identities, artifact hashes, failures and driver logs remain under ignored
`apps/desktop/src-tauri/target/bootstrap-smoke/`.

The production DOM must expose `data-connection-state` and validated
`data-readiness-policy/store/receipts` on `[data-testid="app-shell"]`, an unavailable
banner, and the native lifecycle's disconnected state with **Engine stopped**.
These reflect real application state; no test-only IPC is required. The native
workspace dialog currently returns `POLICY_DENIED`; smoke checks this harmless
command remains denied and the app remains unavailable. This does not qualify
general filesystem/tool effects or native UIA accessibility.

CI hydrates Pi's generated provider data from the immutable revision in
`vendor/pi/nix/model-catalog.json`, verifies the downloaded bytes against that
SHA-256 revision, and uses Pi's existing hydrator before the offline build. It
does not refresh from the live models.dev catalog.

## Qualified tool inputs

The [official Tauri overview](https://v2.tauri.app/develop/tests/webdriver/) and
[manual setup](https://v2.tauri.app/develop/tests/webdriver/manual-setup/) allow a
custom W3C protocol harness. Node's standard `fetch` avoids another client package.
The locked embedded WebdriverIO route remains required separately; this external
release smoke does not replace it.

- Node **24.22.1**: the repository's packaged engine runtime.
- `tauri-driver` **2.1.0**, the stable 2.x crate from the
  [official Tauri repository](https://github.com/tauri-apps/tauri), licensed
  **Apache-2.0 OR MIT**. The source archive SHA-256 is pinned in
  `tauri-driver-inventory.json`. The helper installs it with the published crate
  lockfile and verifies the cached archive against that pin before recording the
  build's executable hash in `target/smoke-tools/driver-manifest.json`. Each run
  uses a new isolated Cargo home so Cargo cannot reuse an unpacked, locally
  modified source tree. CI runs archive-path and BOM-free manifest regression
  checks before preparing the drivers:

  ```powershell
  & tests/bootstrap/prepare-release-drivers.ps1 -TestOnly
  & tests/bootstrap/prepare-release-drivers.ps1
  ```

  `tauri-driver-inventory.json` records package versions, licenses, repositories
  and the selected crate checksum. Original crate licenses and lockfile remain in
  the Cargo registry install sources. The driver has no version flag, so the smoke
  binds its executable bytes to the verified source pin and per-run manifest.

- Microsoft Edge WebDriver is selected from the
  [official download page](https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver)
  for the registered Evergreen WebView2 runtime. Microsoft's
  [matching rule](https://learn.microsoft.com/en-us/microsoft-edge/webdriver-chromium/)
  requires the first three version components to match. The helper downloads the
  x64 archive, records its URL and SHA-256, and records the extracted executable
  SHA-256 in the per-run manifest. The smoke rechecks those bytes and versions,
  then confirms the packaged app starts the registered WebView2 runtime. Microsoft
  software terms apply to the driver; bundled third-party notices remain in the
  extracted directory and are not relabeled MIT.

The release runner checks driver archive and executable hashes before execution
and records the app hash and runtime version. No tool downloads occur inside a
smoke run.

Self-check the fail-closed readiness assertions:

```powershell
node --test tests/bootstrap/release-smoke.test.mjs
node --test tests/bootstrap/hydrate-pinned-model-data.test.mjs
```

The embedded route still needs exact compatible WebdriverIO/service/test-plugin
pins, a separate Cargo `e2e` feature and test-only capability/config, and proof
these are absent from the release. Their integration belongs to the build owner;
no guessed pins or broad automation permissions are added by this runner.
