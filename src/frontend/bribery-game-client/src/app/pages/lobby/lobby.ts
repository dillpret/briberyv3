import { Component, Input } from '@angular/core';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lobby.html',
})
export class Lobby {
  @Input() gameId = '';

  players;
  hostPlayerId;
  playerId = localStorage.getItem('playerId') ?? '';
  copyMessage = '';

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
  }

  async toggleReady() {
    await this.signalr.toggleReady();
  }

  async startGame() {
    await this.signalr.startGame();
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
    return this.players().find((player) => player.id === this.playerId)?.isReady ?? false;
  }

  canStartHint(): string {
    if (this.connectedCount() < 3) return 'Waiting for at least three connected players.';
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
}
