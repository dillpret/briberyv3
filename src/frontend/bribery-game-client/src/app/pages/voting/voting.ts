import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';

@Component({
  selector: 'app-voting',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './voting.html',
})
export class Voting {
  voting;
  voteSubmittedCount;
  voteRequiredCount;
  isCurrentPlayerActive;
  selectedBribeId = signal<string | null>(null);

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.voting = this.gameState.voting;
    this.voteSubmittedCount = this.gameState.voteSubmittedCount;
    this.voteRequiredCount = this.gameState.voteRequiredCount;
    this.isCurrentPlayerActive = this.gameState.isCurrentPlayerActive;
  }

  currentSelection(): string | null {
    return this.voting()?.selectedBribeId ?? this.selectedBribeId();
  }

  async submitVote() {
    const bribeId = this.currentSelection();
    if (!bribeId) return;

    await this.signalr.submitVote(bribeId);
  }

  pendingVoteCount(): number {
    return Math.max(this.voteRequiredCount() - this.voteSubmittedCount(), 0);
  }

  voteProgressPercent(): number {
    const required = this.voteRequiredCount();
    return required === 0 ? 0 : Math.round((this.voteSubmittedCount() / required) * 100);
  }
}
