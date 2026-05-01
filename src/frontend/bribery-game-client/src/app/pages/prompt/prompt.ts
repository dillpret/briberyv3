import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';

@Component({
  selector: 'app-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './prompt.html',
})
export class Prompt {
  currentRound;
  totalRounds;
  promptSubmittedCount;
  promptRequiredCount;
  isCurrentPlayerActive;
  prompt;
  promptText = '';

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.currentRound = this.gameState.currentRound;
    this.totalRounds = this.gameState.totalRounds;
    this.promptSubmittedCount = this.gameState.promptSubmittedCount;
    this.promptRequiredCount = this.gameState.promptRequiredCount;
    this.isCurrentPlayerActive = this.gameState.isCurrentPlayerActive;
    this.prompt = this.gameState.prompt;
  }

  async submitPrompt() {
    await this.signalr.submitPrompt(this.promptText);
  }

  hasSubmittedPrompt(): boolean {
    return this.prompt()?.hasSubmittedPrompt ?? false;
  }

  pendingPromptCount(): number {
    return Math.max(this.promptRequiredCount() - this.promptSubmittedCount(), 0);
  }

  promptProgressPercent(): number {
    const required = this.promptRequiredCount();
    return required === 0 ? 0 : Math.round((this.promptSubmittedCount() / required) * 100);
  }

  remainingCharacters(): number {
    return 200 - this.promptText.length;
  }
}
