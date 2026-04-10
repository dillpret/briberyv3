import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { GameStateService, Player } from '../state/game-state.service';

@Injectable({
  providedIn: 'root',
})
export class SignalrService {
  private connection?: signalR.HubConnection;

  constructor(private gameState: GameStateService) {}

  async start(): Promise<void> {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:5066/hub/game')
      .withAutomaticReconnect()
      .build();

    this.connection.on('PlayerListUpdated', (players: Player[]) => {
      this.gameState.setPlayers(players);
    });

    try {
      await this.connection.start();
      console.log('SignalR connected');
    } catch (err) {
      console.error('SignalR error:', err);
      throw err;
    }
  }

  joinLobby(gameId: string, playerId: string, name: string): void {
    this.connection
      ?.invoke('JoinLobby', gameId, playerId, name)
      .catch((err) => console.error('JoinLobby error:', err));
  }

  async createGame(): Promise<string> {
    return await this.connection!.invoke<string>('CreateGame');
  }
}
