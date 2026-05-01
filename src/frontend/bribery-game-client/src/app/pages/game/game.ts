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
import { Results } from '../results/results';
import { PlayerPanel } from '../../components/player-panel/player-panel';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, FormsModule, Lobby, Prompt, Submission, Voting, Results, PlayerPanel],
  templateUrl: './game.html',
})
export class Game implements OnInit {
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
    if (!this.name.trim()) return;

    localStorage.setItem('playerName', this.name.trim());
    await this.autoJoin();
  }

  private async autoJoin() {
    if (!this.name.trim() || !this.gameId.trim()) return;

    try {
      this.joinState.set('joining');
      await this.signalr.joinLobby(this.gameId, this.playerId, this.name.trim());
      this.joinState.set('joined');
    } catch (err) {
      console.error('Join failed', err);
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
}
