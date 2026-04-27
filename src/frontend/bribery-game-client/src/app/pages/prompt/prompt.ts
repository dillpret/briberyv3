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
  submittedPromptOwnerIds;
  promptText = '';
  playerId = localStorage.getItem('playerId') ?? '';

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.currentRound = this.gameState.currentRound;
    this.totalRounds = this.gameState.totalRounds;
    this.promptSubmittedCount = this.gameState.promptSubmittedCount;
    this.promptRequiredCount = this.gameState.promptRequiredCount;
    this.submittedPromptOwnerIds = this.gameState.submittedPromptOwnerIds;
  }

  async submitPrompt() {
    await this.signalr.submitPrompt(this.promptText);
  }

  hasSubmittedPrompt(): boolean {
    return this.submittedPromptOwnerIds().includes(this.playerId);
  }
}
