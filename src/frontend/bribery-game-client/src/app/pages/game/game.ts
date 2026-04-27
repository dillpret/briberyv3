import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { GamePhase } from '../../models/game-phase';
import { Lobby } from '../lobby/lobby';
import { Prompt } from '../prompt/prompt';
import { Submission } from '../submission/submission';
import { Voting } from '../voting/voting';
import { Results } from '../results/results';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, Lobby, Prompt, Submission, Voting, Results],
  templateUrl: './game.html',
})
export class Game implements OnInit {
  gameId = '';
  name = localStorage.getItem('playerName') ?? '';
  playerId = localStorage.getItem('playerId') ?? '';
  phase = signal<GamePhase>('NotSet');

  constructor(
    private route: ActivatedRoute,
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.phase = this.gameState.phase;
  }

  async ngOnInit(): Promise<void> {
    const gameId = this.route.snapshot.paramMap.get('gameId');

    if (!gameId) return;

    this.gameId = gameId;

    await this.signalr.start();
    await this.autoJoin();
  }

  private async autoJoin() {
    if (!this.name.trim() || !this.gameId.trim()) return;

    try {
      await this.signalr.joinLobby(this.gameId, this.playerId, this.name);
    } catch (err) {
      console.error('Join failed', err);
    }
  }
}
