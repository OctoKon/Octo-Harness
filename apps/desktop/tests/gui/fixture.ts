import { mount } from "svelte";
import FixtureHarness from "./FixtureHarness.svelte";

const target = document.getElementById("app");
if (target) mount(FixtureHarness, { target });
