import { afterEach, describe, expect, it } from "vitest";
import { questionManager } from "../src/question/manager.js";

afterEach(() => {
  questionManager.clear(1);
  questionManager.clear(2);
});

describe("question state", () => {
  it("keeps answers aligned with the request questions", () => {
    questionManager.start(
      1,
      [
        {
          questionId: "q-1",
          question: "First",
          options: [{ label: "Yes", value: "yes" }],
          multiple: false,
        },
        {
          questionId: "q-2",
          question: "Second",
          options: [{ label: "No", value: "no" }],
          multiple: false,
        },
      ],
      "request-1",
      "session-1",
    );

    questionManager.selectOption(1, 0, "yes");
    questionManager.setCustomAnswer(1, 1, "custom answer");

    expect(questionManager.getRequestId(1)).toBe("request-1");
    expect(questionManager.getAnswers(1)).toEqual([["yes"], ["custom answer"]]);
  });

  it("isolates active questions between conversations", () => {
    questionManager.start(
      1,
      [{ questionId: "q-1", question: "First", options: [], multiple: false }],
      "request-1",
      "session-1",
    );
    questionManager.start(
      2,
      [{ questionId: "q-2", question: "Second", options: [], multiple: false }],
      "request-2",
      "session-2",
    );

    questionManager.setCustomAnswer(1, 0, "answer one");
    questionManager.setCustomAnswer(2, 0, "answer two");

    expect(questionManager.getAnswers(1)).toEqual([["answer one"]]);
    expect(questionManager.getAnswers(2)).toEqual([["answer two"]]);
  });
});
