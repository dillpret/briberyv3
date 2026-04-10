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
    if (!this.name.trim() || !this.gameId.trim()) return;

    localStorage.setItem('playerName', this.name);
    localStorage.setItem('gameId', this.gameId);

    this.router.navigate(['/game', this.gameId]);
  }
}
