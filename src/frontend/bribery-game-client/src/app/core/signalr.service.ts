import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { GameStateService, Player } from '../state/game-state.service';

@Injectable({
  providedIn: 'root',
})
export class SignalrService {
  private connection?: signalR.HubConnection;

  constructor(private gameState: GameStateService) {}

  start(): void {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:5066/hub/game')
      .withAutomaticReconnect()
      .build();

    this.connection.on('PlayerListUpdated', (players: Player[]) => {
      console.log('PlayerListUpdated', players);
      this.gameState.setPlayers(players);
    });

    this.connection
      .start()
      .then(() => console.log('SignalR connected'))
      .catch((err) => console.error('SignalR error:', err));
  }

  joinLobby(playerId: string, name: string): void {
    this.connection
      ?.invoke('JoinLobby', playerId, name)
      .catch((err) => console.error('JoinLobby error:', err));
  }
}
