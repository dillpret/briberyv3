import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService, SubmissionTarget } from '../../state/game-state.service';

@Component({
  selector: 'app-submission',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './submission.html',
})
export class Submission {
  submission;
  bribeSubmittedCount;
  bribeRequiredCount;
  isCurrentPlayerActive;
  players;
  drafts = signal<Record<string, string>>({});

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.submission = this.gameState.submission;
    this.bribeSubmittedCount = this.gameState.bribeSubmittedCount;
    this.bribeRequiredCount = this.gameState.bribeRequiredCount;
    this.isCurrentPlayerActive = this.gameState.isCurrentPlayerActive;
    this.players = this.gameState.players;
  }

  hasSubmitted(targetPlayerId: string): boolean {
    return this.submission()?.submittedTargetPlayerIds.includes(targetPlayerId) ?? false;
  }

  draftFor(targetPlayerId: string): string {
    return this.drafts()[targetPlayerId] ?? '';
  }

  setDraft(targetPlayerId: string, value: string) {
    this.drafts.update((drafts) => ({
      ...drafts,
      [targetPlayerId]: value,
    }));
  }

  async submitBribe(target: SubmissionTarget) {
    await this.signalr.submitBribe(target.playerId, this.draftFor(target.playerId));
  }

  pendingBribeCount(): number {
    return Math.max(this.bribeRequiredCount() - this.bribeSubmittedCount(), 0);
  }

  bribeProgressPercent(): number {
    const required = this.bribeRequiredCount();
    return required === 0 ? 0 : Math.round((this.bribeSubmittedCount() / required) * 100);
  }

  remainingCharacters(targetPlayerId: string): number {
    return 500 - this.draftFor(targetPlayerId).length;
  }

  waitingText(): string {
    const pendingPlayers = this.players().filter((player) => player.phaseStatus === 'Pending' && player.connected);
    if (pendingPlayers.length === 0) return 'Waiting for the next phase.';
    if (pendingPlayers.length === 1) return `Waiting for ${pendingPlayers[0].name}.`;
    if (pendingPlayers.length === 2) return `Waiting for ${pendingPlayers[0].name} and ${pendingPlayers[1].name}.`;
    return `Waiting for ${pendingPlayers.length} players.`;
  }
}
