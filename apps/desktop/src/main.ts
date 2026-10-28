import "@fontsource-variable/geist";
import "@fontsource/crimson-text/400.css";
import "@fontsource/crimson-text/600.css";
import "@fontsource/crimson-text/700.css";
import "@fontsource/crimson-text/400-italic.css";
import "@fontsource/crimson-text/700-italic.css";
import "./workbench.css";
import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (target) {
  mount(App, { target });
}
