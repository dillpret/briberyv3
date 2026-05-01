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
  players;
  selectedBribeId = signal<string | null>(null);

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.voting = this.gameState.voting;
    this.voteSubmittedCount = this.gameState.voteSubmittedCount;
    this.voteRequiredCount = this.gameState.voteRequiredCount;
    this.isCurrentPlayerActive = this.gameState.isCurrentPlayerActive;
    this.players = this.gameState.players;
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

  waitingText(): string {
    const pendingPlayers = this.players().filter((player) => player.phaseStatus === 'Pending' && player.connected);
    if (pendingPlayers.length === 0) return 'Waiting for results.';
    if (pendingPlayers.length === 1) return `Waiting for ${pendingPlayers[0].name}.`;
    if (pendingPlayers.length === 2) return `Waiting for ${pendingPlayers[0].name} and ${pendingPlayers[1].name}.`;
    return `Waiting for ${pendingPlayers.length} players.`;
  }
}
