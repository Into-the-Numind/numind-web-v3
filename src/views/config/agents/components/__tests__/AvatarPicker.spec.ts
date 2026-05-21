import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import AvatarPicker from "../AvatarPicker.vue";

describe("AvatarPicker", () => {
  describe("clicking lucide tile", () => {
    it("emits update:modelValue with lucide: prefix when tile clicked", async () => {
      const wrapper = mount(AvatarPicker, {
        props: { modelValue: "lucide:Bot" },
      });
      const tiles = wrapper.findAll(".avatar-picker__tile");
      // First tile is Bot, second is User — click User
      await tiles[1].trigger("click");
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toBe("lucide:User");
    });

    it("marks selected tile with --selected class", () => {
      const wrapper = mount(AvatarPicker, {
        props: { modelValue: "lucide:Bot" },
      });
      const tiles = wrapper.findAll(".avatar-picker__tile");
      expect(tiles[0].classes()).toContain("avatar-picker__tile--selected");
      expect(tiles[1].classes()).not.toContain("avatar-picker__tile--selected");
    });

    it("renders 12 icon tiles", () => {
      const wrapper = mount(AvatarPicker, {
        props: { modelValue: "lucide:Bot" },
      });
      expect(wrapper.findAll(".avatar-picker__tile")).toHaveLength(12);
    });
  });

  describe("upload section", () => {
    beforeEach(() => {
      // Reset all mocks before each upload test
      vi.restoreAllMocks();
    });

    it("reads file as base64 and emits data URL", async () => {
      const wrapper = mount(AvatarPicker, {
        props: { modelValue: "lucide:Bot" },
      });

      // Mock FileReader using a proper class so `new FileReader()` works
      const mockResult = "data:image/png;base64,abc123";

      class MockFileReader {
        result: string | ArrayBuffer | null = mockResult;
        onload: (() => void) | null = null;
        readAsDataURL(_file: File): void {
          // Simulate async load by firing onload synchronously
          if (this.onload) this.onload();
        }
      }

      vi.stubGlobal("FileReader", MockFileReader);

      const file = new File(["content"], "avatar.png", { type: "image/png" });
      Object.defineProperty(file, "size", {
        value: 1024 * 1024,
        configurable: true,
      }); // 1 MB

      const fileInput = wrapper.find<HTMLInputElement>('input[type="file"]');
      Object.defineProperty(fileInput.element, "files", {
        value: [file],
        configurable: true,
      });

      await fileInput.trigger("change");

      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toBe(mockResult);

      vi.unstubAllGlobals();
    });

    it("rejects file larger than 2MB", async () => {
      const wrapper = mount(AvatarPicker, {
        props: { modelValue: "lucide:Bot" },
      });

      const file = new File(["x".repeat(100)], "big.png", {
        type: "image/png",
      });
      Object.defineProperty(file, "size", {
        value: 3 * 1024 * 1024,
        configurable: true,
      }); // 3 MB

      const fileInput = wrapper.find<HTMLInputElement>('input[type="file"]');
      Object.defineProperty(fileInput.element, "files", {
        value: [file],
        configurable: true,
      });

      await fileInput.trigger("change");

      // Should NOT emit
      expect(wrapper.emitted("update:modelValue")).toBeFalsy();
      // Should show error message
      expect(wrapper.find(".avatar-picker__upload-error").exists()).toBe(true);
      expect(wrapper.find(".avatar-picker__upload-error").text()).toContain(
        "2MB",
      );
    });
  });

  describe("readonly", () => {
    it("hides upload section when readonly=true", () => {
      const wrapper = mount(AvatarPicker, {
        props: { modelValue: "lucide:Bot", readonly: true },
      });
      expect(wrapper.find(".avatar-picker__upload").exists()).toBe(false);
    });

    it("disables all icon tiles when readonly=true", () => {
      const wrapper = mount(AvatarPicker, {
        props: { modelValue: "lucide:Bot", readonly: true },
      });
      const tiles = wrapper.findAll<HTMLButtonElement>(".avatar-picker__tile");
      tiles.forEach((tile) => {
        expect(tile.element.disabled).toBe(true);
      });
    });

    it("does not emit when clicking a tile in readonly mode", async () => {
      const wrapper = mount(AvatarPicker, {
        props: { modelValue: "lucide:Bot", readonly: true },
      });
      const tiles = wrapper.findAll(".avatar-picker__tile");
      await tiles[1].trigger("click");
      expect(wrapper.emitted("update:modelValue")).toBeFalsy();
    });
  });

  describe("preview", () => {
    it("shows img tag when modelValue is a data URL", () => {
      const dataUrl = "data:image/png;base64,abc123";
      const wrapper = mount(AvatarPicker, {
        props: { modelValue: dataUrl },
      });
      const img = wrapper.find(".avatar-picker__preview-img");
      expect(img.exists()).toBe(true);
      expect(img.attributes("src")).toBe(dataUrl);
    });

    it("shows lucide icon in preview when modelValue is lucide:X", () => {
      const wrapper = mount(AvatarPicker, {
        props: { modelValue: "lucide:Star" },
      });
      // The preview area should have an svg (lucide icon)
      expect(wrapper.find(".avatar-picker__preview svg").exists()).toBe(true);
    });
  });
});
