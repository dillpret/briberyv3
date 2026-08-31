import { Component, Input } from '@angular/core';
import { SignalrService } from '../../core/signalr.service';
import { GameSettings, GameStateService } from '../../state/game-state.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WaitingTips } from '../../components/waiting-tips/waiting-tips';

type TimerName = 'promptTimer' | 'submissionTimer' | 'votingTimer' | 'appreciationTimer';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, WaitingTips],
  templateUrl: './lobby.html',
})
export class Lobby {
  @Input() gameId = '';

  players;
  hostPlayerId;
  currentPlayerId;
  settings;
  copyMessage = '';
  readonly promptsAnsweredOptions = [2, 3, 4, 5];
  timerNames: TimerName[] = [
    'promptTimer',
    'submissionTimer',
    'votingTimer',
    'appreciationTimer',
  ];

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.currentPlayerId = this.gameState.currentPlayerId;
    this.settings = this.gameState.settings;
  }

  async toggleReady() {
    await this.signalr.toggleReady();
  }

  async startGame() {
    await this.signalr.startGame();
  }

  async updateTimer(
    timerName: TimerName,
    changes: Partial<{ enabled: boolean; durationSeconds: number }>,
  ) {
    const current = this.settings();
    const timer = current[timerName];
    const nextDuration = changes.durationSeconds ?? timer.durationSeconds;
    await this.signalr.updateGameSettings({
      ...current,
      [timerName]: {
        ...timer,
        ...changes,
        durationSeconds: this.clampDuration(nextDuration),
      },
    });
  }

  async updatePromptsAnsweredPerPlayer(value: number) {
    const promptsAnsweredPerPlayer = Math.min(Math.max(Math.round(Number(value) || 2), 2), 5);
    await this.signalr.updateGameSettings({
      ...this.settings(),
      promptsAnsweredPerPlayer,
    });
  }

  timerLabel(timerName: TimerName): string {
    const labels: Record<TimerName, string> = {
      promptTimer: 'Prompt',
      submissionTimer: 'Submission',
      votingTimer: 'Voting',
      appreciationTimer: 'Appreciation',
    };
    return labels[timerName];
  }

  timerSummary(timerName: TimerName): string {
    const timer = this.settings()[timerName];
    return timer.enabled ? `${timer.durationSeconds} seconds` : 'Off';
  }

  enabledTimerCount(): number {
    return this.timerNames.filter((timerName) => this.settings()[timerName].enabled).length;
  }

  settingsSummary(): string {
    const count = this.enabledTimerCount();
    const timerSummary = count === 0
      ? 'Timers off'
      : count === 1
        ? '1 timer enabled'
        : `${count} timers enabled`;
    return `${this.settings().promptsAnsweredPerPlayer} prompts each · ${timerSummary}`;
  }

  timerDescription(timerName: TimerName): string {
    const descriptions: Record<TimerName, string> = {
      promptTimer: 'Auto-submits the prompt draft when time runs out.',
      submissionTimer: 'Auto-submits saved bribe drafts when time runs out.',
      votingTimer: 'Auto-submits the saved vote when time runs out.',
      appreciationTimer: 'Locks in appreciation when time runs out.',
    };
    return descriptions[timerName];
  }

  timerStatusLabel(timerName: TimerName): string {
    return this.settings()[timerName].enabled ? 'On' : 'Off';
  }

  timerInputClasses(timerName: TimerName): Record<string, boolean> {
    const enabled = this.settings()[timerName].enabled;
    return {
      'border-ink/10 bg-ink/5 text-ink/45 shadow-none': !enabled,
      'cursor-not-allowed': !enabled,
    };
  }

  connectedCount(): number {
    return this.players().filter((player) => player.connected).length;
  }

  readyCount(): number {
    return this.players().filter((player) => player.connected && player.isReady).length;
  }

  pendingReadyCount(): number {
    return Math.max(this.connectedCount() - this.readyCount(), 0);
  }

  readyPercent(): number {
    const connected = this.connectedCount();
    return connected === 0 ? 0 : Math.round((this.readyCount() / connected) * 100);
  }

  isCurrentPlayerReady(): boolean {
    return this.players().find((player) => player.id === this.currentPlayerId())?.isReady ?? false;
  }

  isHost(): boolean {
    return this.currentPlayerId() === this.hostPlayerId();
  }

  minimumPlayersRequired(): number {
    return this.settings().promptsAnsweredPerPlayer + 1;
  }

  canStart(): boolean {
    return this.connectedCount() >= this.minimumPlayersRequired() && this.pendingReadyCount() === 0;
  }

  canStartHint(): string {
    if (this.connectedCount() < this.minimumPlayersRequired()) {
      return `Waiting for at least ${this.minimumPlayersRequired()} connected players.`;
    }
    if (this.pendingReadyCount() > 0) return `Waiting for ${this.pendingReadyCount()} player(s) to ready up.`;
    return 'Everyone is ready.';
  }

  async copyCode() {
    await this.copyText(this.normalizedGameId(), 'Copied code');
  }

  async copyLink() {
    await this.copyText(`${window.location.origin}/game/${this.normalizedGameId()}`, 'Copied link');
  }

  normalizedGameId(): string {
    return this.gameId.trim().toUpperCase();
  }

  private async copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.copyMessage = successMessage;
    } catch {
      this.copyMessage = 'Copy failed';
    }

    window.setTimeout(() => {
      this.copyMessage = '';
    }, 1800);
  }

  private clampDuration(value: number): number {
    return Math.min(Math.max(Math.round(Number(value) || 1), 1), 600);
  }
}
