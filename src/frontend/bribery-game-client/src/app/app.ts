import { Component, OnInit } from '@angular/core';
import { SignalrService } from './core/signalr.service';
import { GameStateService } from './state/game-state.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  players;
  name = localStorage.getItem('playerName') ?? '';
  playerId = localStorage.getItem('playerId') ?? crypto.randomUUID();
  isJoined = false;
  gameId = localStorage.getItem('gameId') ?? '';

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    localStorage.setItem('playerId', this.playerId);
    this.players = this.gameState.players;
  }

  async ngOnInit(): Promise<void> {
    await this.signalr.start();
    this.autoJoin();
  }

  async createGame() {
    const gameId = await this.signalr.createGame();

    this.gameId = gameId;
    localStorage.setItem('gameId', gameId);

    this.join();
  }

  join() {
    if (!this.name.trim() || !this.gameId.trim()) return;

    localStorage.setItem('playerName', this.name);
    localStorage.setItem('gameId', this.gameId);

    this.signalr.joinLobby(this.gameId, this.playerId, this.name);
    this.isJoined = true;
  }

  autoJoin() {
    if (!this.name.trim() || !this.gameId.trim()) return;

    this.signalr.joinLobby(this.gameId, this.playerId, this.name);
    this.isJoined = true;
  }
}
