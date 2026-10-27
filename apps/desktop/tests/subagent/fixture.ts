import { mount } from "svelte";
import SubagentMergeFixture from "./SubagentMergeFixture.svelte";

const target = document.getElementById("app");
if (target) {
  mount(SubagentMergeFixture, { target });
}
