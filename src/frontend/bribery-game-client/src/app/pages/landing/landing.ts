import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SignalrService } from '../../core/signalr.service';
import { CommonModule } from '@angular/common';
import { buildInfo } from '../../build-info.generated';

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
  deploymentLabel = this.buildDeploymentLabel();

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

    localStorage.setItem('playerName', this.name.trim());
    localStorage.setItem('gameId', normalizedGameId);

    this.router.navigate(['/game', normalizedGameId]);
  }

  normalizeGameId(gameId: string): string {
    return gameId.trim().toUpperCase();
  }

  private buildDeploymentLabel(): string {
    if (!buildInfo.deployedAt) return `local build ${buildInfo.shortCommitHash}`;

    return `deployed ${buildInfo.shortCommitHash} - ${this.formatUtcDate(buildInfo.deployedAt)}`;
  }

  private formatUtcDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return `${value} UTC`;

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hour}:${minute} UTC`;
  }
}
