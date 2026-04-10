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

  setPlayers(players: Player[]) {
    this.players.set(players);
  }
}
