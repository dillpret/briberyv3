import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { CommonModule } from '@angular/common';
import { GamePhase } from '../../models/game-phase';

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lobby.html',
})
export class Lobby implements OnInit {
  players;
  hostPlayerId;
  gameId = '';
  name = localStorage.getItem('playerName') ?? '';
  playerId = localStorage.getItem('playerId') ?? '';
  phase = signal<GamePhase>('NotSet');

  constructor(
    private route: ActivatedRoute,
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.phase = this.gameState.phase;
  }

  async ngOnInit(): Promise<void> {
    const gameId = this.route.snapshot.paramMap.get('gameId');

    if (!gameId) return;

    this.gameId = gameId;

    await this.signalr.start();

    await this.autoJoin();
  }

  async autoJoin() {
    if (!this.name.trim() || !this.gameId.trim()) return;

    try {
      await this.signalr.joinLobby(this.gameId, this.playerId, this.name);
    } catch (err) {
      console.error('Join failed', err);
    }
  }

  async toggleReady() {
    await this.signalr.toggleReady();
  }

  async startGame() {
    await this.signalr.startGame();
  }
}
