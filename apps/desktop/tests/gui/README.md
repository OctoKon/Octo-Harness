# TD-34 GUI fixture harness

Run browser-fixture GUI specifications with:

```sh
npm run test:gui --workspace=@splyce/desktop
```

`harness.ts` provides the shared interface:

- `mountFixture(page, caseId)` loads a canonical `tests/fixtures/gui/fui-*.json` event trace into the browser fixture renderer.
- `requireRole(page, role, name)` asserts a visible accessible role/name pair; removing the role or its accessible name makes the test fail.
- `pressKeys(page, ...keys)` drives keyboard interactions through the browser.
- `screenshot(page, state)` saves a stable state screenshot under `test-results/`.

This is browser-fixture evidence only. It does not establish packaged Windows, native-dialog, IME, screen-reader, engine, or provider behavior. Those require the bootstrap-owned packaged UIA suite.

Only canonical W3–W5 fixture files currently exist. W1 and W6–W10 stay unsupported until their owner supplies a canonical fixture; this harness deliberately does not invent fallback behavior for them.
