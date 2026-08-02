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
  private active: ActiveQuestion | null = null;

  start(
    questions: Question[],
    requestID: string,
    sessionId: string,
  ): void {
    this.active = {
      questions,
      currentIndex: 0,
      selectedOptions: new Map(),
      customAnswers: new Map(),
      requestID,
      sessionId,
      messageIds: [],
    };
  }

  isActive(): boolean {
    return this.active !== null;
  }

  getActive(): ActiveQuestion | null {
    return this.active;
  }

  getCurrentQuestion(): Question | null {
    if (!this.active) return null;
    return this.active.questions[this.active.currentIndex] ?? null;
  }

  selectOption(questionIndex: number, optionValue: string): void {
    if (!this.active) return;

    const existing = this.active.selectedOptions.get(questionIndex) ?? [];
    const question = this.active.questions[questionIndex];

    if (question?.multiple) {
      const idx = existing.indexOf(optionValue);
      if (idx >= 0) {
        existing.splice(idx, 1);
      } else {
        existing.push(optionValue);
      }
      this.active.selectedOptions.set(questionIndex, existing);
    } else {
      this.active.selectedOptions.set(questionIndex, [optionValue]);
    }
  }

  setCustomAnswer(questionIndex: number, answer: string): void {
    if (!this.active) return;
    this.active.customAnswers.set(questionIndex, answer);
  }

  nextQuestion(): boolean {
    if (!this.active) return false;
    if (this.active.currentIndex < this.active.questions.length - 1) {
      this.active.currentIndex++;
      return true;
    }
    return false;
  }

  addMessageId(messageId: number): void {
    this.active?.messageIds.push(messageId);
  }

  getMessageIds(): number[] {
    return this.active?.messageIds ?? [];
  }

  getSelectedOptions(): Map<number, string[]> {
    return this.active?.selectedOptions ?? new Map();
  }

  getCustomAnswers(): Map<number, string> {
    return this.active?.customAnswers ?? new Map();
  }

  clear(): void {
    this.active = null;
  }
}

export const questionManager = new QuestionManager();
