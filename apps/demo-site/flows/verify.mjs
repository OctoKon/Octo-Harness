// Run with: node apps/demo-site/flows/verify.mjs
// Pure layout/contract checks; test.html additionally exercises real browser rendering.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const names = ["architecture", "turn-flow", "safety", "memory", "subagents"];
// The diagrams are classic scripts (so file:// works); evaluate them as a browser would.
for (const name of ["diagram", ...names])
  vm.runInThisContext(await readFile(new URL(`./${name}.js`, import.meta.url), "utf8"), { filename: `${name}.js` });
const modules = names.map((name) => globalThis.SplyceFlows[name]);

function points(path) {
  const tokens = path.match(/[MHV]|-?\d+(?:\.\d+)?/g);
  const result = [];
  let x = 0;
  let y = 0;
  while (tokens.length) {
    const operation = tokens.shift();
    if (operation === "M") {
      x = Number(tokens.shift());
      y = Number(tokens.shift());
    } else if (operation === "H") x = Number(tokens.shift());
    else if (operation === "V") y = Number(tokens.shift());
    else throw new Error(`Unsupported SVG command: ${operation}`);
    assert(Number.isFinite(x) && Number.isFinite(y), "Finite SVG points");
    result.push([x, y]);
  }
  return result;
}

function onBoundary([x, y], [left, top, w, h]) {
  return (
    ((x === left || x === left + w) && y >= top && y <= top + h) ||
    ((y === top || y === top + h) && x >= left && x <= left + w)
  );
}

for (const { mount, specification: spec } of modules) {
  test(`${spec.id}: exported mount and complete semantic description`, () => {
    assert.equal(typeof mount, "function");
    assert.throws(() => mount(null), TypeError);
    assert.throws(() => mount({}), TypeError);
    assert(spec.title.length > 10);
    assert(spec.description.length > 100);
    assert(spec.note.length > 40);
    const ids = new Set(spec.nodes.map((node) => node.id));
    assert.equal(ids.size, spec.nodes.length);
    for (const node of spec.nodes) {
      assert(node.at >= 0 && node.at + 0.12 <= 1);
      assert(node.kicker && node.title && node.lines.length);
    }
  });
  for (const [layout, key, labelKey] of [
    ["desktop", "d", "labelAt"],
    ["mobile", "m", "ml"],
  ]) {
    test(`${spec.id}: ${layout} cards, arrows, timing and bounds`, () => {
      const [width, height] = spec[layout];
      for (const node of spec.nodes) {
        const [x, y, w, h] = node[key];
        assert(
          x >= 0 && y >= 0 && x + w <= width && y + h <= height,
          `${node.id}: card exceeds viewBox`,
        );
        assert(w >= 210 && h >= 100, `${node.id}: card too small`);
        const lastBaseline = 82 + (node.lines.length - 1) * 19;
        assert(lastBaseline + 6 <= h - 8, `${node.id}: body exceeds card`);
        if (node.approval)
          assert(lastBaseline + 8 < h - 38, "Approval text overlaps controls");
        for (const other of spec.nodes) {
          if (other.id === node.id) continue;
          const [a, b, c, d] = other[key];
          assert(
            x + w <= a || a + c <= x || y + h <= b || b + d <= y,
            `${node.id}: overlaps ${other.id}`,
          );
        }
      }
      for (const edge of spec.edges) {
        const from = spec.nodes.find((node) => node.id === edge.from);
        const to = spec.nodes.find((node) => node.id === edge.to);
        assert(from && to, "Unknown edge endpoint");
        assert(
          edge.at >= 0 && edge.at + (edge.duration ?? 0.14) <= 1,
          "Unreachable edge completion",
        );
        const route = points(edge[key]);
        assert(route.length >= 2, "Arrow needs a route");
        assert(
          onBoundary(route[0], from[key]),
          `${edge.from}: disconnected arrow`,
        );
        assert(
          onBoundary(route.at(-1), to[key]),
          `${edge.to}: disconnected arrow`,
        );
        for (const [x, y] of route)
          assert(
            x >= 0 && y >= 0 && x <= width && y <= height,
            "Arrow exceeds viewBox",
          );
        const [lx, ly] = edge[labelKey];
        assert(
          lx >= 0 && ly >= 0 && lx <= width && ly <= height,
          "Label exceeds viewBox",
        );
        // No line segment can cross an unrelated card's interior.
        for (let i = 1; i < route.length; i++) {
          const [ax, ay] = route[i - 1];
          const [bx, by] = route[i];
          for (const node of spec.nodes.filter(
            (node) => ![edge.from, edge.to].includes(node.id),
          )) {
            const [x, y, w, h] = node[key];
            const crosses =
              ax === bx
                ? ax > x &&
                  ax < x + w &&
                  Math.max(ay, by) > y &&
                  Math.min(ay, by) < y + h
                : ay > y &&
                  ay < y + h &&
                  Math.max(ax, bx) > x &&
                  Math.min(ax, bx) < x + w;
            assert(!crosses, `${edge.from} → ${edge.to}: crosses ${node.id}`);
          }
        }
      }
    });
  }
}

test("Local modules load without a build or remote assets", async () => {
  for (const name of [...names, "diagram"]) {
    const text = await readFile(
      new URL(`./${name}.js`, import.meta.url),
      "utf8",
    );
    assert(!/^\s*(import|export)\s/m.test(text), "Classic script: no module syntax");
    assert(
      !/@import|@font-face|https?:\/\//.test(
        text.replace("http://www.w3.org/2000/svg", ""),
      ),
      "No remote assets",
    );
  }
});
