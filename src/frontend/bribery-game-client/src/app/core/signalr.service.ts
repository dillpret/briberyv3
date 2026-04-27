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

    this.connection.on('LobbyUpdated', (state) => {
      console.log('LOBBY UPDATE RECEIVED', state);
      this.gameState.setLobbyState(state);
    });

    this.connection.on('JoinFailed', (message: string) => {
      console.error('Join failed:', message);
      alert(message); // TODO: Proper error handling
    });

    this.connection.on('ActionFailed', (message: string) => {
      console.error('Action failed:', message);
      alert(message); // TODO: Proper error handling
    });

    try {
      await this.connection.start();
      console.log('SignalR connected');
    } catch (err) {
      console.error('SignalR error:', err);
      throw err;
    }
  }

  async joinLobby(gameId: string, playerId: string, name: string): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('JoinLobby', gameId, playerId, name);
  }

  async createGame(): Promise<string> {
    await this.ensureConnection();
    return await this.connection!.invoke<string>('CreateGame');
  }

  async toggleReady(): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('ToggleReady');
  }

  async startGame(): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('StartGame');
  }

  async submitPrompt(text: string): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('SubmitPrompt', text);
  }

  private async ensureConnection(): Promise<void> {
    if (!this.connection) {
      await this.start();
    }
  }
}
