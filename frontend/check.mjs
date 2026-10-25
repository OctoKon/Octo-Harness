import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
process.chdir(import.meta.dirname);
const listeners = {};
const elements = new Map();
const element = (id) => {
  if (!elements.has(id))
    elements.set(id, {
      innerHTML: "",
      textContent: "",
      value: "",
      classList: { add() {}, remove() {} },
      focus() {},
    });
  return elements.get(id);
};
const context = vm.createContext({
  console,
  URL,
  Blob,
  setTimeout: () => 1,
  clearTimeout() {},
  requestAnimationFrame: (fn) => fn(),
  location: { hash: "#home" },
  window: { scrollTo() {}, addEventListener() {} },
  document: {
    title: "",
    body: { classList: { remove() {}, toggle() {} } },
    documentElement: { style: {} },
    getElementById: element,
    querySelector: () => null,
    addEventListener: (t, fn) => (listeners[t] = fn),
  },
  localStorage: { getItem: () => null, setItem() {} },
  FormData: class {
    constructor(form) {
      this.values = form.values;
    }
    get(k) {
      return this.values[k];
    }
    has(k) {
      return Object.hasOwn(this.values, k);
    }
  },
});
vm.runInContext(fs.readFileSync("app.js", "utf8"), context);
assert.match(element("root").innerHTML, /A lot more building/);
assert.equal(
  vm.runInContext("esc('<script>\"&')", context),
  "&lt;script&gt;&quot;&amp;",
);
listeners.submit({
  preventDefault() {},
  target: { id: "run-form", values: { task: "short", profile: "Local" } },
});
assert.match(element("task-error").textContent, /at least 8/);
listeners.submit({
  preventDefault() {},
  target: {
    id: "run-form",
    values: {
      task: "<script>alert(1)</script> safely quoted task",
      profile: "Local",
    },
  },
});
assert.equal(vm.runInContext("state.runs.length", context), 4);
assert.equal(vm.runInContext("state.runs[0].status", context), "Review ready");
assert.match(vm.runInContext("detail()", context), /&lt;script&gt;/);
assert.doesNotMatch(vm.runInContext("detail()", context), /<script>alert/);
vm.runInContext("applyPreset('Balanced')", context);
for (const role of ["generation", "extraction", "embeddings", "reranking"])
  assert.equal(
    vm.runInContext(`state.settings.${role}`, context),
    "Local endpoint",
  );
for (const name of [
  "overview",
  "runs",
  "memoryPage",
  "modelsPage",
  "permissionsPage",
  "extensionsPage",
  "settingsPage",
  "researchPage",
  "detail",
])
  assert.ok(vm.runInContext(`${name}()`, context).length > 100);
context.location.hash = "#run/demo-103";
assert.equal(vm.runInContext("route()", context), "run");
assert.equal(vm.runInContext("state.selected", context), "demo-103");
assert.equal(
  vm.runInContext(
    "normalizeSettings({profile:'Local',generation:'Local endpoint'}).generation",
    context,
  ),
  "Local endpoint",
);
assert.equal(
  vm.runInContext(
    "normalizeSettings({theme:'injected',approval:'yes'}).theme",
    context,
  ),
  "Light",
);
assert.equal(vm.runInContext("resolvedDark('Dark')", context), true);
assert.equal(vm.runInContext("resolvedDark('Light')", context), false);
assert.equal(vm.runInContext("resolvedDark('System')", context), false);
context.window.matchMedia = () => ({ matches: true });
assert.equal(vm.runInContext("resolvedDark('System')", context), true);
assert.equal(
  vm.runInContext(
    "normalizeSettings({profile:'Cloud',generation:'Cloud endpoint'}).generation",
    context,
  ),
  "Local endpoint",
);
assert.match(vm.runInContext("settingsPage()", context), /value="System"/);
assert.match(
  vm.runInContext("settingsTabs('settings')", context),
  /Appearance & data/,
);
assert.doesNotMatch(
  vm.runInContext("shell('settings',settingsPage())", context),
  /local-status|advanced-nav/,
);
assert.match(vm.runInContext("home()", context), /Build what comes next/);
listeners.change({ target: { name: "reduceMotion", checked: true } });
assert.equal(vm.runInContext("state.settings.reduceMotion", context), true);
assert.equal(context.document.documentElement.style.scrollBehavior, "auto");
assert.equal(
  vm.runInContext(
    "normalizeSettings({reduceMotion:'yes'}).reduceMotion",
    context,
  ),
  false,
);
vm.runInContext("state.models.generation='<b>local-model</b>'", context);
assert.match(vm.runInContext("modelsPage()", context), /&lt;b&gt;local-model/);
assert.doesNotMatch(vm.runInContext("modelsPage()", context), /Cloud endpoint/);
vm.runInContext("state.draft='<script>draft</script>'", context);
assert.match(vm.runInContext("composer()", context), /&lt;script&gt;draft/);
listeners.submit({
  preventDefault() {},
  target: {
    id: "run-form",
    values: {
      task: "Check the task acceptance contract",
      profile: "Balanced",
      acceptanceCriteria: "<b>All checks pass</b>",
      verificationCommand: "npm test",
    },
  },
});
assert.equal(
  vm.runInContext("state.runs[0].verificationCommand", context),
  "npm test",
);
assert.match(vm.runInContext("detail()", context), /&lt;b&gt;All checks pass/);
assert.match(
  vm.runInContext("detail()", context),
  /Planned check · not executed/,
);
assert.equal(
  vm.runInContext("state.draftDetails.acceptanceCriteria", context),
  "",
);
assert.equal(vm.runInContext("findResearch().length", context), 22);
assert.equal(
  vm.runInContext(
    "findResearch('', 'All topics', 'Runtime tested').length",
    context,
  ),
  0,
);
assert.equal(
  vm.runInContext(
    "findResearch('', 'Capabilities', 'Proposed design').length",
    context,
  ),
  1,
);
assert.ok(
  vm.runInContext("findResearch('PI', 'Foundations').length", context) >= 2,
);
for (const doc of vm.runInContext("researchDocs", context))
  assert.ok(fs.existsSync("../" + doc.path), doc.path);
listeners.click({
  target: { closest: () => ({ dataset: { template: "3" } }) },
});
assert.match(vm.runInContext("state.draft", context), /prior session/);
assert.match(
  vm.runInContext("state.draftDetails.acceptanceCriteria", context),
  /uncertainty/,
);
vm.runInContext(
  "state.selected='demo-103';state.runs.find(r=>r.id==='demo-103').status='Needs approval'",
  context,
);
listeners.click({
  target: { closest: () => ({ dataset: { action: "cancel" } }) },
});
assert.equal(
  vm.runInContext("state.runs.find(r=>r.id==='demo-103').stopReason", context),
  "permission-denied",
);
assert.match(vm.runInContext("detail()", context), /Demo action denied/);
assert.ok(fs.existsSync("assets/harness-flow.svg"));
console.log(
  "PASS: task plans, escaping, local settings, run identity, research filters, template population and scoped denial.",
);
