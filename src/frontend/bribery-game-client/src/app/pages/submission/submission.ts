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
  drafts = signal<Record<string, string>>({});

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.submission = this.gameState.submission;
    this.bribeSubmittedCount = this.gameState.bribeSubmittedCount;
    this.bribeRequiredCount = this.gameState.bribeRequiredCount;
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
}
