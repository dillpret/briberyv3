import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SignalrService } from '../../core/signalr.service';
import { BribeFallbackMode, GameSettings } from '../../state/game-state.service';

type TimerName = 'promptTimer' | 'submissionTimer' | 'votingTimer' | 'appreciationTimer';

@Component({
  selector: 'app-game-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-settings.html',
})
export class GameSettingsPanel {
  @Input({ required: true }) settings!: GameSettings;
  @Input() editable = false;

  readonly promptsAnsweredOptions = [2, 3, 4, 5];
  readonly timerNames: TimerName[] = [
    'promptTimer',
    'submissionTimer',
    'votingTimer',
    'appreciationTimer',
  ];

  constructor(private signalr: SignalrService) {}

  async updateTimer(
    timerName: TimerName,
    changes: Partial<{ enabled: boolean; durationSeconds: number }>,
  ) {
    const timer = this.settings[timerName];
    const nextDuration = changes.durationSeconds ?? timer.durationSeconds;
    await this.signalr.updateGameSettings({
      ...this.settings,
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
      ...this.settings,
      promptsAnsweredPerPlayer,
    });
  }

  async updateBribeFallbackMode(bribeFallbackMode: BribeFallbackMode) {
    await this.signalr.updateGameSettings({
      ...this.settings,
      bribeFallbackMode,
    });
  }

  bribeFallbackLabel(): string {
    return this.settings.bribeFallbackMode === 'NoFallback' ? 'No fallback' : 'Auto-fill';
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
    const timer = this.settings[timerName];
    return timer.enabled ? `${timer.durationSeconds} seconds` : 'Off';
  }

  enabledTimerCount(): number {
    return this.timerNames.filter((timerName) => this.settings[timerName].enabled).length;
  }

  settingsSummary(): string {
    const count = this.enabledTimerCount();
    const timerSummary = count === 0
      ? 'Timers off'
      : count === 1
        ? '1 timer enabled'
        : `${count} timers enabled`;
    return `${this.settings.promptsAnsweredPerPlayer} prompts each · ${this.bribeFallbackLabel()} · ${timerSummary}`;
  }

  timerDescription(timerName: TimerName): string {
    const descriptions: Record<TimerName, string> = {
      promptTimer: 'Uses a saved draft, or chooses a random prompt when blank.',
      submissionTimer: 'Uses saved drafts, then applies the selected bribe fallback.',
      votingTimer: 'Uses a saved eligible vote, otherwise prefers submitted bribes.',
      appreciationTimer: 'Locks in appreciation when time runs out.',
    };
    return descriptions[timerName];
  }

  timerStatusLabel(timerName: TimerName): string {
    return this.settings[timerName].enabled ? 'On' : 'Off';
  }

  timerInputClasses(timerName: TimerName): Record<string, boolean> {
    const enabled = this.settings[timerName].enabled;
    return {
      'border-ink/10 bg-ink/5 text-ink/45 shadow-none': !enabled,
      'cursor-not-allowed': !enabled,
    };
  }

  minimumPlayersRequired(): number {
    return this.settings.promptsAnsweredPerPlayer + 1;
  }

  private clampDuration(value: number): number {
    return Math.min(Math.max(Math.round(Number(value) || 1), 1), 600);
  }
}
