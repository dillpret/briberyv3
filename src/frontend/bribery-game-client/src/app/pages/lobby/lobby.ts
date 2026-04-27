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
}
