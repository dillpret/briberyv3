import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { GameStateService, Player } from '../../state/game-state.service';
import { SignalrService } from '../../core/signalr.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './results.html',
})
export class Results {
  players;
  results;
  hostPlayerId;
  currentRound;
  playerId = localStorage.getItem('playerId') ?? '';

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.players = this.gameState.players;
    this.results = this.gameState.results;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.currentRound = this.gameState.currentRound;
  }

  async startNextRound() {
    await this.signalr.startNextRound();
  }

  sortedPlayers(): Player[] {
    return [...this.players()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  isHost(): boolean {
    return this.playerId === this.hostPlayerId();
  }
}
