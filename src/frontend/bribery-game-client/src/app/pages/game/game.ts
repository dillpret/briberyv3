import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { GamePhase } from '../../models/game-phase';
import { Lobby } from '../lobby/lobby';
import { Prompt } from '../prompt/prompt';
import { Submission } from '../submission/submission';
import { Voting } from '../voting/voting';
import { Appreciation } from '../appreciation/appreciation';
import { Scoreboard } from '../scoreboard/scoreboard';
import { PlayerPanel } from '../../components/player-panel/player-panel';
import { ErrorMessageService } from '../../core/error-message.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, FormsModule, Lobby, Prompt, Submission, Voting, Appreciation, Scoreboard, PlayerPanel],
  templateUrl: './game.html',
})
export class Game implements OnInit {
  readonly maxPlayerNameLength = 24;
  gameId = '';
  name = localStorage.getItem('playerName') ?? '';
  playerId = localStorage.getItem('playerId') ?? crypto.randomUUID();
  phase = signal<GamePhase>('NotSet');
  joinState = signal<'needs-name' | 'joining' | 'joined' | 'failed'>('joining');
  joinError = signal('');

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private signalr: SignalrService,
    private gameState: GameStateService,
    private errors: ErrorMessageService,
  ) {
    this.phase = this.gameState.phase;
    localStorage.setItem('playerId', this.playerId);
  }

  async ngOnInit(): Promise<void> {
    const gameId = this.route.snapshot.paramMap.get('gameId');

    if (!gameId) return;

    this.gameId = this.normalizeGameId(gameId);
    localStorage.setItem('gameId', this.gameId);

    await this.signalr.start();

    if (!this.name.trim()) {
      this.joinState.set('needs-name');
      return;
    }

    await this.autoJoin();
  }

  async submitNameAndJoin() {
    const normalizedName = this.normalizePlayerName(this.name);
    if (!normalizedName) return;

    this.name = normalizedName;
    localStorage.setItem('playerName', normalizedName);
    await this.autoJoin();
  }

  private async autoJoin() {
    const normalizedName = this.normalizePlayerName(this.name);
    if (!normalizedName || !this.gameId.trim()) return;

    try {
      this.joinState.set('joining');
      this.joinError.set('');
      this.name = normalizedName;
      localStorage.setItem('playerName', normalizedName);
      await this.signalr.joinLobby(this.gameId, this.playerId, normalizedName);
      const currentPlayerId = this.gameState.currentPlayerId();
      if (currentPlayerId) {
        this.playerId = currentPlayerId;
        localStorage.setItem('playerId', currentPlayerId);
      }
      this.joinState.set('joined');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to join this room.';
      if (message !== 'Game does not exist') {
        this.joinError.set(message);
        this.errors.show(message);
        this.joinState.set('needs-name');
        return;
      }

      this.joinState.set('failed');
      localStorage.removeItem('gameId');
      this.router.navigate(['/'], {
        state: {
          message: 'That room no longer exists.',
        },
      });
    }
  }

  private normalizeGameId(gameId: string): string {
    return gameId.trim().toUpperCase();
  }

  private normalizePlayerName(name: string): string {
    return name.trim().slice(0, this.maxPlayerNameLength);
  }
}
