import { Injectable, signal } from '@angular/core';

export interface Player {
  id: string;
  name: string;
  connected: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class GameStateService {
  players = signal<Player[]>([]);
  hostPlayerId = signal<string | null>(null);

  setPlayers(players: Player[]) {
    this.players.set(players);
  }

  setLobbyState(state: { players: Player[]; hostPlayerId: string | null }) {
    this.players.set(state.players);
    this.hostPlayerId.set(state.hostPlayerId);
  }
}
