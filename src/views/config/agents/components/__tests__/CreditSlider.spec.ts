import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CreditSlider from "../CreditSlider.vue";

describe("CreditSlider", () => {
  describe("range and number inputs sync", () => {
    it("renders range and number inputs with modelValue", () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 800 },
      });
      const range = wrapper.find<HTMLInputElement>('input[type="range"]');
      const number = wrapper.find<HTMLInputElement>('input[type="number"]');
      expect(range.element.value).toBe("800");
      expect(number.element.value).toBe("800");
    });

    it("emits update:modelValue when range changes", async () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 800, min: 200, max: 2000, step: 100 },
      });
      const range = wrapper.find<HTMLInputElement>('input[type="range"]');
      range.element.value = "1200";
      await range.trigger("input");
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toBe(1200);
    });

    it("emits update:modelValue when number input changes", async () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 800, min: 200, max: 2000, step: 100 },
      });
      const number = wrapper.find<HTMLInputElement>('input[type="number"]');
      number.element.value = "1500";
      await number.trigger("input");
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toBe(1500);
    });
  });

  describe("out-of-range clamped", () => {
    it("clamps value below min to min on blur", async () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 800, min: 200, max: 2000, step: 100 },
      });
      const number = wrapper.find<HTMLInputElement>('input[type="number"]');
      number.element.value = "50";
      await number.trigger("blur");
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      const lastEmit = emitted![emitted!.length - 1][0] as number;
      expect(lastEmit).toBe(200);
    });

    it("clamps value above max to max on blur", async () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 800, min: 200, max: 2000, step: 100 },
      });
      const number = wrapper.find<HTMLInputElement>('input[type="number"]');
      number.element.value = "5000";
      await number.trigger("blur");
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      const lastEmit = emitted![emitted!.length - 1][0] as number;
      expect(lastEmit).toBe(2000);
    });

    it("handles NaN input by clamping to min", async () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 800, min: 200, max: 2000, step: 100 },
      });
      const number = wrapper.find<HTMLInputElement>('input[type="number"]');
      number.element.value = "abc";
      await number.trigger("blur");
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      const lastEmit = emitted![emitted!.length - 1][0] as number;
      expect(lastEmit).toBe(200);
    });
  });

  describe("readonly", () => {
    it("disables both inputs when readonly=true", () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 800, readonly: true },
      });
      const range = wrapper.find<HTMLInputElement>('input[type="range"]');
      const number = wrapper.find<HTMLInputElement>('input[type="number"]');
      expect(range.element.disabled).toBe(true);
      expect(number.element.disabled).toBe(true);
    });
  });

  describe("help text", () => {
    it("shows 适合简单问答 for value < 500", () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 300 },
      });
      expect(wrapper.find(".credit-slider__help").text()).toBe("适合简单问答");
    });

    it("shows 适合数据分析 for value between 500 and 1500", () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 800 },
      });
      expect(wrapper.find(".credit-slider__help").text()).toBe("适合数据分析");
    });

    it("shows 适合数据分析 for value exactly 500", () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 500 },
      });
      expect(wrapper.find(".credit-slider__help").text()).toBe("适合数据分析");
    });

    it("shows 适合复杂多步骤任务 for value > 1500", () => {
      const wrapper = mount(CreditSlider, {
        props: { modelValue: 1800 },
      });
      expect(wrapper.find(".credit-slider__help").text()).toBe(
        "适合复杂多步骤任务",
      );
    });
  });
});
