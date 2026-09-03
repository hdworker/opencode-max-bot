export interface Question {
  questionId: string;
  question: string;
  header?: string;
  options: QuestionOption[];
  multiple: boolean;
  custom?: boolean;
}

export interface QuestionOption {
  label: string;
  description?: string;
  value: string;
}

interface ActiveQuestion {
  questions: Question[];
  currentIndex: number;
  selectedOptions: Map<number, string[]>;
  customAnswers: Map<number, string>;
  requestID: string;
  sessionId: string;
  messageIds: number[];
}

class QuestionManager {
  private active = new Map<number, ActiveQuestion>();

  start(chatId: number, questions: Question[], requestID: string, sessionId: string): void {
    this.active.set(chatId, {
      questions,
      currentIndex: 0,
      selectedOptions: new Map(),
      customAnswers: new Map(),
      requestID,
      sessionId,
      messageIds: [],
    });
  }

  isActive(chatId: number): boolean {
    return this.active.has(chatId);
  }

  getActive(chatId: number): ActiveQuestion | null {
    return this.active.get(chatId) ?? null;
  }

  getCurrentQuestion(chatId: number): Question | null {
    const active = this.active.get(chatId);
    return active?.questions[active.currentIndex] ?? null;
  }

  selectOption(chatId: number, questionIndex: number, optionValue: string): void {
    const active = this.active.get(chatId);
    if (!active) return;

    const existing = active.selectedOptions.get(questionIndex) ?? [];
    const question = active.questions[questionIndex];

    if (question?.multiple) {
      const idx = existing.indexOf(optionValue);
      if (idx >= 0) {
        existing.splice(idx, 1);
      } else {
        existing.push(optionValue);
      }
      active.selectedOptions.set(questionIndex, existing);
    } else {
      active.selectedOptions.set(questionIndex, [optionValue]);
    }
  }

  setCustomAnswer(chatId: number, questionIndex: number, answer: string): void {
    this.active.get(chatId)?.customAnswers.set(questionIndex, answer);
  }

  nextQuestion(chatId: number): boolean {
    const active = this.active.get(chatId);
    if (!active) return false;
    if (active.currentIndex < active.questions.length - 1) {
      active.currentIndex++;
      return true;
    }
    return false;
  }

  addMessageId(chatId: number, messageId: number): void {
    this.active.get(chatId)?.messageIds.push(messageId);
  }

  getMessageIds(chatId: number): number[] {
    return this.active.get(chatId)?.messageIds ?? [];
  }

  getSelectedOptions(chatId: number): Map<number, string[]> {
    return this.active.get(chatId)?.selectedOptions ?? new Map();
  }

  getCustomAnswers(chatId: number): Map<number, string> {
    return this.active.get(chatId)?.customAnswers ?? new Map();
  }

  getRequestId(chatId: number): string | null {
    return this.active.get(chatId)?.requestID ?? null;
  }

  getCurrentIndex(chatId: number): number {
    return this.active.get(chatId)?.currentIndex ?? 0;
  }

  getAnswers(chatId: number): string[][] {
    const active = this.active.get(chatId);
    if (!active) return [];

    return active.questions.map((_, index) => {
      const customAnswer = active.customAnswers.get(index);
      if (customAnswer !== undefined) return [customAnswer];
      return active.selectedOptions.get(index) ?? [];
    });
  }

  clear(chatId: number): void {
    this.active.delete(chatId);
  }
}

export const questionManager = new QuestionManager();
