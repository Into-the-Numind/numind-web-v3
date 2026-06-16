import { describe, it, expect } from "vitest";
import {
  validateQ1,
  validateQ3,
  validateQ4,
  validateQ5,
  validateQ6,
  validateQ7,
  validateQ8,
  validateQ9,
  validateQ10,
  validateQ11,
  validateQ12,
  validateForm,
} from "../validation";
import { initialFormState } from "@/types/agentBuilder";

describe("validation.ts — 12 question validators", () => {
  describe("validateQ1 (name)", () => {
    it("empty → error", () => expect(validateQ1("")).toBeTruthy());
    it("1 char too short → error", () =>
      expect(validateQ1("a")).toBe("名字应为 2-20 字"));
    it("21 char too long → error", () =>
      expect(validateQ1("a".repeat(21))).toBe("名字应为 2-20 字"));
    it("all digits → error", () =>
      expect(validateQ1("12345")).toBe("名字不能全是数字"));
    it("valid name → empty", () => expect(validateQ1("爆款分析师")).toBe(""));
  });

  describe("validateQ3 (description)", () => {
    it("empty → error", () => expect(validateQ3("")).toBeTruthy());
    it("9 chars → error", () =>
      expect(validateQ3("a".repeat(9))).toBe("描述应为 10-20 字"));
    it("21 chars → error", () =>
      expect(validateQ3("a".repeat(21))).toBe("描述应为 10-20 字"));
    it("valid → empty", () =>
      expect(validateQ3("分析你的小红书笔记找出爆款规律")).toBe(""));
  });

  describe("validateQ4 (welcome)", () => {
    it("empty → error", () => expect(validateQ4("")).toBeTruthy());
    it("19 chars → error", () =>
      expect(validateQ4("a".repeat(19))).toBe("欢迎语应为 20-500 字"));
    it("501 chars → error", () =>
      expect(validateQ4("a".repeat(501))).toBe("欢迎语应为 20-500 字"));
    it("valid → empty", () => expect(validateQ4("a".repeat(50))).toBe(""));
  });

  describe("validateQ5 (starters)", () => {
    it("empty list → empty (optional)", () => expect(validateQ5([])).toBe(""));
    it("5 chips → error", () =>
      expect(validateQ5(["aaaaa", "bbbbb", "ccccc", "ddddd", "eeeee"])).toBe(
        "最多 4 个快速开始按钮",
      ));
    it("4-char chip → error", () =>
      expect(validateQ5(["abcd"])).toBe("每条快速开始按钮应为 5-50 字"));
    it("51-char chip → error", () =>
      expect(validateQ5(["a".repeat(51)])).toBe(
        "每条快速开始按钮应为 5-50 字",
      ));
    it("4 valid chips → empty", () =>
      expect(validateQ5(["aaaaa", "bbbbb", "ccccc", "ddddd"])).toBe(""));
  });

  describe("validateQ6 (task types) — required (agent-from-scratch-q6q7)", () => {
    it("empty array → error", () =>
      expect(validateQ6([])).toBe("请至少选择一种任务类型"));
    it("one selected → empty", () =>
      expect(validateQ6(["analyze_data"])).toBe(""));
    it("free-text only → empty", () =>
      expect(validateQ6(["自定义任务"])).toBe(""));
  });

  describe("validateQ7 (materials) — required (agent-from-scratch-q6q7)", () => {
    it("empty → error", () =>
      expect(validateQ7([])).toBe("请至少选择一种材料类型"));
    it("one → empty", () => expect(validateQ7(["text"])).toBe(""));
    it("'none' counts as a selection → empty", () =>
      expect(validateQ7(["none"])).toBe(""));
  });

  describe("validateQ8 (credit cap)", () => {
    it("NaN → error (P1-6 fix)", () =>
      expect(validateQ8(NaN)).toBe("积分上限应在 200-2000"));
    it("Infinity → error", () =>
      expect(validateQ8(Infinity)).toBe("积分上限应在 200-2000"));
    it("199 → error", () =>
      expect(validateQ8(199)).toBe("积分上限应在 200-2000"));
    it("2001 → error", () =>
      expect(validateQ8(2001)).toBe("积分上限应在 200-2000"));
    it("800 default → empty", () => expect(validateQ8(800)).toBe(""));
    it("200 boundary → empty", () => expect(validateQ8(200)).toBe(""));
    it("2000 boundary → empty", () => expect(validateQ8(2000)).toBe(""));
  });

  describe("validateQ9 (web search)", () => {
    it("empty → empty", () => expect(validateQ9("")).toBe(""));
    it("invalid → empty", () => expect(validateQ9("random")).toBe(""));
  });

  describe("validateQ10 (sensitive topics, optional)", () => {
    it("empty → empty (optional)", () => expect(validateQ10("")).toBe(""));
    it("501 → empty", () =>
      expect(validateQ10("a".repeat(501))).toBe(""));
  });

  describe("validateQ11 (over-scope wording, optional)", () => {
    it("empty → empty (optional)", () => expect(validateQ11("")).toBe(""));
    it("4 chars → empty", () =>
      expect(validateQ11("abcd")).toBe(""));
  });

  describe("validateQ12 (style)", () => {
    it("empty → empty", () => expect(validateQ12("")).toBe(""));
    it("invalid → empty", () => expect(validateQ12("rude")).toBe(""));
  });

  describe("validateForm (whole form)", () => {
    it("empty initial form → multiple errors (required Q's empty)", () => {
      const form = initialFormState();
      const errors = validateForm(form);
      // name/description/welcome_message are required and empty in initial
      expect(errors.name).toBeTruthy();
      expect(errors.description).toBeTruthy();
      expect(errors.welcome_message).toBeTruthy();
      // q6/q7 are required again (agent-from-scratch-q6q7): initial defaults are []
      expect(errors.q6).toBeTruthy();
      expect(errors.q7).toBeTruthy();
    });

    it("complete valid form → no errors", () => {
      const form = initialFormState();
      form.name = "爆款分析师";
      form.description = "分析小红书笔记找爆款";
      form.welcome_message = "你好我是爆款分析师，可以分析你的笔记内容找规律。";
      form.questionnaire_answers.q6 = ["answer_questions"];
      form.questionnaire_answers.q7 = ["text"];
      const errors = validateForm(form);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it("partial completion → only relevant errors", () => {
      const form = initialFormState();
      form.name = "Bot";
      const errors = validateForm(form);
      expect(errors.name).toBeFalsy(); // name valid
      expect(errors.description).toBeTruthy(); // still empty
    });
  });
});
