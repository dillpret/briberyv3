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
  selectedBribeId = signal<string | null>(null);

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.voting = this.gameState.voting;
    this.voteSubmittedCount = this.gameState.voteSubmittedCount;
    this.voteRequiredCount = this.gameState.voteRequiredCount;
  }

  currentSelection(): string | null {
    return this.voting()?.selectedBribeId ?? this.selectedBribeId();
  }

  async submitVote() {
    const bribeId = this.currentSelection();
    if (!bribeId) return;

    await this.signalr.submitVote(bribeId);
  }
}
