import { CommonModule } from '@angular/common';
import { Component, OnDestroy, effect, signal } from '@angular/core';
import { GameStateService } from '../../state/game-state.service';

@Component({
  selector: 'app-phase-countdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './phase-countdown.html',
})
export class PhaseCountdown implements OnDestroy {
  remainingSeconds = signal<number | null>(null);
  private serverOffsetMs = 0;
  private intervalId: number | null = null;

  constructor(public gameState: GameStateService) {
    effect(() => {
      const serverNowUtc = this.gameState.serverNowUtc();
      if (serverNowUtc) {
        this.serverOffsetMs = Date.parse(serverNowUtc) - Date.now();
      }

      this.gameState.phaseRevision();
      this.gameState.phaseEndsAtUtc();
      this.updateRemaining();
      this.ensureTicker();
    });
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
    }
  }

  isVisible(): boolean {
    return this.gameState.timerEnabled() && !!this.gameState.phaseEndsAtUtc();
  }

  isWarning(): boolean {
    const remaining = this.remainingSeconds();
    return remaining !== null && remaining <= 15;
  }

  displayTime(): string {
    const remaining = this.remainingSeconds();
    if (remaining === null) return '--';

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return minutes > 0
      ? `${minutes}:${seconds.toString().padStart(2, '0')}`
      : `${seconds}s`;
  }

  private ensureTicker() {
    if (!this.isVisible()) {
      if (this.intervalId !== null) {
        window.clearInterval(this.intervalId);
        this.intervalId = null;
      }
      return;
    }

    if (this.intervalId !== null) return;

    this.intervalId = window.setInterval(() => this.updateRemaining(), 250);
  }

  private updateRemaining() {
    const endsAt = this.gameState.phaseEndsAtUtc();
    if (!this.gameState.timerEnabled() || !endsAt) {
      this.remainingSeconds.set(null);
      return;
    }

    const serverNow = Date.now() + this.serverOffsetMs;
    const remainingMs = Math.max(Date.parse(endsAt) - serverNow, 0);
    this.remainingSeconds.set(Math.ceil(remainingMs / 1000));
  }
}
