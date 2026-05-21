import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChipInput from "../ChipInput.vue";

describe("ChipInput", () => {
  describe("Enter commits chip", () => {
    it("emits update:modelValue with new chip on Enter", async () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: [] },
      });
      const input = wrapper.find<HTMLInputElement>("input");
      await input.setValue("Hello world");
      await input.trigger("keydown", { key: "Enter" });
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toEqual(["Hello world"]);
    });

    it("clears input after Enter commit", async () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: [] },
      });
      const input = wrapper.find<HTMLInputElement>("input");
      await input.setValue("Hello world");
      await input.trigger("keydown", { key: "Enter" });
      expect(input.element.value).toBe("");
    });
  });

  describe("blur commits chip", () => {
    it("emits update:modelValue on blur when input has value", async () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: [] },
      });
      const input = wrapper.find<HTMLInputElement>("input");
      await input.setValue("Blur commit");
      await input.trigger("blur");
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toEqual(["Blur commit"]);
    });

    it("does not emit on blur when input is empty", async () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: [] },
      });
      const input = wrapper.find<HTMLInputElement>("input");
      await input.setValue("");
      await input.trigger("blur");
      expect(wrapper.emitted("update:modelValue")).toBeFalsy();
    });
  });

  describe("delete chip", () => {
    it("emits update:modelValue without removed chip when delete button clicked", async () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: ["chip one", "chip two"] },
      });
      const removeButtons = wrapper.findAll(".chip-input__chip-remove");
      expect(removeButtons).toHaveLength(2);
      await removeButtons[0].trigger("click");
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toEqual(["chip two"]);
    });
  });

  describe("max limit", () => {
    it("hides input when modelValue.length >= max", () => {
      const wrapper = mount(ChipInput, {
        props: {
          modelValue: ["a one", "b two", "c three", "d four"],
          max: 4,
        },
      });
      expect(wrapper.find("input").exists()).toBe(false);
    });

    it("shows input when modelValue.length < max", () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: ["a one", "b two"], max: 4 },
      });
      expect(wrapper.find("input").exists()).toBe(true);
    });
  });

  describe("length validation", () => {
    it("rejects chip shorter than minLen", async () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: [], minLen: 5, maxLen: 50 },
      });
      const input = wrapper.find<HTMLInputElement>("input");
      await input.setValue("abc"); // 3 chars — too short
      await input.trigger("keydown", { key: "Enter" });
      // Should not emit
      expect(wrapper.emitted("update:modelValue")).toBeFalsy();
      // Input is cleared after rejection
      expect(input.element.value).toBe("");
    });

    it("rejects chip longer than maxLen", async () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: [], minLen: 5, maxLen: 10 },
      });
      const input = wrapper.find<HTMLInputElement>("input");
      await input.setValue("this is way too long for maxLen"); // > 10
      await input.trigger("keydown", { key: "Enter" });
      expect(wrapper.emitted("update:modelValue")).toBeFalsy();
    });

    it("accepts chip exactly at minLen boundary", async () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: [], minLen: 5, maxLen: 50 },
      });
      const input = wrapper.find<HTMLInputElement>("input");
      await input.setValue("hello"); // exactly 5 chars
      await input.trigger("keydown", { key: "Enter" });
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toEqual(["hello"]);
    });
  });

  describe("readonly", () => {
    it("hides input when readonly=true", () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: ["hello world"], readonly: true },
      });
      expect(wrapper.find("input").exists()).toBe(false);
    });

    it("hides delete buttons when readonly=true", () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: ["hello world", "second chip"], readonly: true },
      });
      expect(wrapper.findAll(".chip-input__chip-remove")).toHaveLength(0);
    });

    it("shows chips in readonly mode", () => {
      const wrapper = mount(ChipInput, {
        props: { modelValue: ["hello world"], readonly: true },
      });
      expect(wrapper.findAll(".chip-input__chip")).toHaveLength(1);
    });
  });
});
