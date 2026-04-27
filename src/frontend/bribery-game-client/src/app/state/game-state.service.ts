import { Injectable, signal } from '@angular/core';
import { GamePhase } from '../models/game-phase';

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  isReady: boolean;
  isActive: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class GameStateService {
  players = signal<Player[]>([]);
  hostPlayerId = signal<string | null>(null);
  phase = signal<GamePhase>('Lobby');
  currentRound = signal(0);
  totalRounds = signal(1);
  promptSubmittedCount = signal(0);
  promptRequiredCount = signal(0);
  submittedPromptOwnerIds = signal<string[]>([]);

  setPlayers(players: Player[]) {
    this.players.set(players);
  }

  setLobbyState(state: any) {
    this.players.set(state.players);
    this.hostPlayerId.set(state.hostPlayerId);
    this.phase.set(state.phase);
    this.currentRound.set(state.currentRound ?? 0);
    this.totalRounds.set(state.totalRounds ?? 1);
    this.promptSubmittedCount.set(state.promptSubmittedCount ?? 0);
    this.promptRequiredCount.set(state.promptRequiredCount ?? 0);
    this.submittedPromptOwnerIds.set(state.submittedPromptOwnerIds ?? []);
  }
}
