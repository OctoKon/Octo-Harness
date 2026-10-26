import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { Setup, type SetupResult } from "./Setup";

describe("Setup", () => {
  it("renders base-only option by default", () => {
    const wrapper = mount(Setup, { props: { defaultOption: "base-only" } });
    expect(wrapper.element).toContain("Continue with base only");
    expect(wrapper.element).not.toContain("Skip Setup");
  });

  it("renders optional-modules option", () => {
    const wrapper = mount(Setup, { props: { defaultOption: "optional-modules" } });
    expect(wrapper.element).toContain("Choose optional modules");
  });

  it("renders skip-setup option", () => {
    const wrapper = mount(Setup, { props: { defaultOption: "skip-setup" } });
    expect(wrapper.element).toContain("Skip Setup");
    expect(wrapper.element).not.toContain("Continue with base only");
  });

  it("emits setup-option event with base-only detail", async () => {
    const wrapper = mount(Setup, { props: { defaultOption: "base-only" } });
    await wrapper.find("[data-testid='setup-base']").trigger("click");
    const event = wrapper.emitted("setup-option")[0][0];
    expect(event.option).toBe("base-only");
  });

  it("emits setup-option event with optional-modules detail", async () => {
    const wrapper = mount(Setup, { props: { defaultOption: "optional-modules" } });
    await wrapper.find("[data-testid='setup-modules']").trigger("click");
    const event = wrapper.emitted("setup-option")[0][0];
    expect(event.option).toBe("optional-modules");
  });

  it("emits setup-option event with skip-setup detail", async () => {
    const wrapper = mount(Setup, { props: { defaultOption: "skip-setup" } });
    await wrapper.find("[data-testid='setup-skip']").trigger("click");
    const event = wrapper.emitted("setup-option")[0][0];
    expect(event.option).toBe("skip-setup");
  });

  it("passes through custom defaultOption", () => {
    const wrapper = mount(Setup, { props: { defaultOption: "skip-setup" } });
    const title = wrapper.find("h3");
    expect(title.text()).toBe("Skip Setup");
  });
});