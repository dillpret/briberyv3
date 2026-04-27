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

  setPlayers(players: Player[]) {
    this.players.set(players);
  }

  setLobbyState(state: any) {
    this.players.set(state.players);
    this.hostPlayerId.set(state.hostPlayerId);
    this.phase.set(state.phase);
  }
}
