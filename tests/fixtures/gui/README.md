# GUI Test Fixtures

Canonical synthetic test fixtures for the Splyce Windows desktop GUI test suite, conforming to [`research/docs/design/fixture-contract.md`](../../../research/docs/design/fixture-contract.md) and [`research/docs/design/client-contract.md`](../../../research/docs/design/client-contract.md).

## Manifests

| Fixture File                                                           | Case ID  | Focus Area                                              | Primary Target Task |
| :--------------------------------------------------------------------- | :------- | :------------------------------------------------------ | :------------------ |
| [`fui-w3-accessibility.json`](./fui-w3-accessibility.json)             | `FUI-W3` | Windows Accessibility, keyboard navigation & focus trap | TD-73 / TD-34       |
| [`fui-w4-stream-backpressure.json`](./fui-w4-stream-backpressure.json) | `FUI-W4` | Stream token rendering, tool cards & rAF batching       | TD-18 / TD-34       |
| [`fui-w5-approval-race.json`](./fui-w5-approval-race.json)             | `FUI-W5` | Approval dialog race resolution & stale action blocking | TD-02 / TD-34       |
