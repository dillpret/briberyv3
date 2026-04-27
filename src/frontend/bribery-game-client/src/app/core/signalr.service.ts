import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { GameStateService } from '../state/game-state.service';

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

    this.connection.on('GameStateUpdated', (state) => {
      console.log('GAME STATE RECEIVED', state);
      this.gameState.setGameState(state);
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

  async submitBribe(targetPlayerId: string, text: string): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('SubmitBribe', targetPlayerId, text);
  }

  async submitVote(bribeId: string): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('SubmitVote', bribeId);
  }

  async startNextRound(): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('StartNextRound');
  }

  private async ensureConnection(): Promise<void> {
    if (!this.connection) {
      await this.start();
    }
  }
}
