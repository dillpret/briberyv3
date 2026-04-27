import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { CommonModule } from '@angular/common';
import { GamePhase } from '../../models/game-phase';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lobby.html',
})
export class Lobby implements OnInit {
  players;
  hostPlayerId;
  currentRound;
  totalRounds;
  promptSubmittedCount;
  promptRequiredCount;
  submittedPromptOwnerIds;
  gameId = '';
  name = localStorage.getItem('playerName') ?? '';
  playerId = localStorage.getItem('playerId') ?? '';
  promptText = '';
  phase = signal<GamePhase>('NotSet');

  constructor(
    private route: ActivatedRoute,
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.phase = this.gameState.phase;
    this.currentRound = this.gameState.currentRound;
    this.totalRounds = this.gameState.totalRounds;
    this.promptSubmittedCount = this.gameState.promptSubmittedCount;
    this.promptRequiredCount = this.gameState.promptRequiredCount;
    this.submittedPromptOwnerIds = this.gameState.submittedPromptOwnerIds;
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

  async submitPrompt() {
    await this.signalr.submitPrompt(this.promptText);
  }

  hasSubmittedPrompt(): boolean {
    return this.submittedPromptOwnerIds().includes(this.playerId);
  }
}
