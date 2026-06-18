import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class WaitingTipsService {
  readonly currentTip = signal<string | null>(null);
  private readonly cycleMs = 9000;
  private tips: string[] = [];
  private queue: string[] = [];
  private lastTip: string | null = null;
  private request: Promise<string[]> | null = null;
  private timer: ReturnType<typeof window.setInterval> | null = null;

  constructor() {
    void this.loadTips();
  }

  async loadTips(): Promise<string[]> {
    if (this.tips.length > 0) return this.tips;
    if (this.request) return this.request;

    this.request = this.fetchTips();
    return this.request;
  }

  nextTip() {
    if (this.tips.length === 0) return;

    if (this.queue.length === 0) {
      this.queue = this.shuffle(this.tips);
    }

    if (this.queue.length > 1 && this.queue[0] === this.lastTip) {
      const replacementIndex = this.queue.findIndex((tip) => tip !== this.lastTip);
      if (replacementIndex > 0) {
        [this.queue[0], this.queue[replacementIndex]] = [this.queue[replacementIndex], this.queue[0]];
      }
    }

    const selectedTip = this.queue.shift() ?? null;
    this.lastTip = selectedTip;
    this.currentTip.set(selectedTip);
  }

  parseTips(text: string): string[] {
    return Array.from(new Set(text
      .split(/\r?\n/)
      .map((tip) => tip.trim())
      .filter((tip) => tip.length > 0)));
  }

  private async fetchTips(): Promise<string[]> {
    try {
      const response = await fetch('/tips.txt');
      if (!response.ok) {
        this.request = null;
        return [];
      }

      this.tips = this.parseTips(await response.text());
      if (this.tips.length > 0) {
        this.nextTip();
        this.startTimer();
      }

      return this.tips;
    } catch {
      this.request = null;
      this.currentTip.set(null);
      return [];
    }
  }

  private startTimer() {
    if (this.timer) return;

    this.timer = window.setInterval(() => this.nextTip(), this.cycleMs);
  }

  private shuffle(values: string[]): string[] {
    const shuffled = [...values];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
  }
}
