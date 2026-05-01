import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SignalrService } from '../../core/signalr.service';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './landing.html',
})
export class Landing {
  name = localStorage.getItem('playerName') ?? '';
  gameId = localStorage.getItem('gameId') ?? '';
  playerId = localStorage.getItem('playerId') ?? crypto.randomUUID();
  errorMessage = history.state?.message ?? '';

  constructor(
    private signalr: SignalrService,
    private router: Router,
  ) {
    localStorage.setItem('playerId', this.playerId);
  }

  async createGame() {
    try {
      const gameId = await this.signalr.createGame();

      this.gameId = gameId;
      localStorage.setItem('gameId', gameId);

      this.join();
    } catch (err) {
      console.error('CreateGame failed', err);
    }
  }

  join() {
    const normalizedGameId = this.normalizeGameId(this.gameId);

    if (!this.name.trim() || !normalizedGameId) return;

    localStorage.setItem('playerName', this.name);
    localStorage.setItem('gameId', normalizedGameId);

    this.router.navigate(['/game', normalizedGameId]);
  }

  normalizeGameId(gameId: string): string {
    return gameId.trim().toUpperCase();
  }
}
