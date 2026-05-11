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
  players;
  hostPlayerId;
  canHostAdvanceWithoutOfflinePlayers;
  offlineBlockingPlayerNames;
  advanceWithoutOfflinePlayersBlockedReason;
  prompt;
  promptText = '';
  playerId = localStorage.getItem('playerId') ?? '';
  private promptIdeas: string[] | null = null;

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.currentRound = this.gameState.currentRound;
    this.totalRounds = this.gameState.totalRounds;
    this.promptSubmittedCount = this.gameState.promptSubmittedCount;
    this.promptRequiredCount = this.gameState.promptRequiredCount;
    this.isCurrentPlayerActive = this.gameState.isCurrentPlayerActive;
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.canHostAdvanceWithoutOfflinePlayers = this.gameState.canHostAdvanceWithoutOfflinePlayers;
    this.offlineBlockingPlayerNames = this.gameState.offlineBlockingPlayerNames;
    this.advanceWithoutOfflinePlayersBlockedReason = this.gameState.advanceWithoutOfflinePlayersBlockedReason;
    this.prompt = this.gameState.prompt;
  }

  async submitPrompt() {
    await this.signalr.submitPrompt(this.promptText);
  }

  async giveMeAnIdea() {
    const ideas = await this.loadPromptIdeas();
    if (ideas.length === 0) return;

    const randomIndex = Math.floor(Math.random() * ideas.length);
    this.promptText = ideas[randomIndex];
  }

  async advanceWithoutOfflinePlayers() {
    await this.signalr.advancePhaseWithoutOfflinePlayers();
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

  waitingText(): string {
    const offlineBlockers = this.offlineBlockingPlayerNames();
    if (offlineBlockers.length === 1) return `Waiting on ${offlineBlockers[0]}, who is offline.`;
    if (offlineBlockers.length === 2) return `Waiting on ${offlineBlockers[0]} and ${offlineBlockers[1]}, who are offline.`;
    if (offlineBlockers.length > 2) return `Waiting on ${offlineBlockers.length} offline players.`;

    const pendingPlayers = this.players().filter((player) => player.phaseStatus === 'Pending' && player.connected);
    if (pendingPlayers.length === 0) return 'Waiting for the next phase.';
    if (pendingPlayers.length === 1) return `Waiting for ${pendingPlayers[0].name}.`;
    if (pendingPlayers.length === 2) return `Waiting for ${pendingPlayers[0].name} and ${pendingPlayers[1].name}.`;
    return `Waiting for ${pendingPlayers.length} players.`;
  }

  isHost(): boolean {
    return this.playerId === this.hostPlayerId();
  }

  offlineBlockerText(): string {
    const names = this.offlineBlockingPlayerNames();
    if (names.length === 0) return '';
    if (names.length === 1) return `Waiting on offline player: ${names[0]}.`;
    if (names.length === 2) return `Waiting on offline players: ${names[0]} and ${names[1]}.`;
    return `Waiting on ${names.length} offline players.`;
  }

  private async loadPromptIdeas(): Promise<string[]> {
    if (this.promptIdeas !== null) return this.promptIdeas;

    try {
      const response = await fetch('/prompt-ideas.txt');
      if (!response.ok) {
        this.promptIdeas = [];
        return this.promptIdeas;
      }

      const text = await response.text();
      this.promptIdeas = text
        .split(/\r?\n/)
        .map((idea) => idea.trim())
        .filter((idea) => idea.length > 0);
      return this.promptIdeas;
    } catch {
      this.promptIdeas = [];
      return this.promptIdeas;
    }
  }
}
