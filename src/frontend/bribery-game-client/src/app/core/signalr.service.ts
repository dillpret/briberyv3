import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { GameStateService } from '../state/game-state.service';
import { BribeMedia } from '../state/game-state.service';

export interface SubmitBribeRequest {
  targetPlayerId: string;
  text?: string;
  media?: BribeMedia;
}

@Injectable({
  providedIn: 'root',
})
export class SignalrService {
  private connection?: signalR.HubConnection;
  private pendingJoinResolve?: () => void;
  private pendingJoinReject?: (reason?: unknown) => void;

  constructor(private gameState: GameStateService) {}

  async start(): Promise<void> {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl("/hub/game")
      .withAutomaticReconnect()
      .build();

    this.connection.on('GameStateUpdated', (state) => {
      console.log('GAME STATE RECEIVED', state);
      this.gameState.setGameState(state);
      this.pendingJoinResolve?.();
      this.pendingJoinResolve = undefined;
      this.pendingJoinReject = undefined;
    });

    this.connection.on('JoinFailed', (message: string) => {
      console.error('Join failed:', message);
      this.pendingJoinReject?.(new Error(message));
      this.pendingJoinResolve = undefined;
      this.pendingJoinReject = undefined;
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
    return new Promise<void>((resolve, reject) => {
      this.pendingJoinResolve = resolve;
      this.pendingJoinReject = reject;

      this.connection!.invoke('JoinLobby', gameId, playerId, name)
        .then(() => {
          // Resolution happens when the server sends the personalized state update.
        })
        .catch((error) => {
          this.pendingJoinResolve = undefined;
          this.pendingJoinReject = undefined;
          reject(error);
        });
    });
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

  async submitBribe(request: SubmitBribeRequest): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('SubmitBribe', request);
  }

  async uploadBribeMedia(gameId: string, playerId: string, file: File): Promise<BribeMedia> {
    const body = new FormData();
    body.append('playerId', playerId);
    body.append('file', file);

    const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/media`, {
      method: 'POST',
      body,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Media upload failed' }));
      throw new Error(error.error ?? 'Media upload failed');
    }

    return await response.json();
  }

  async submitVote(bribeId: string): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('SubmitVote', bribeId);
  }

  async startNextRound(): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('StartNextRound');
  }

  async advancePhaseWithoutOfflinePlayers(): Promise<void> {
    await this.ensureConnection();
    await this.connection!.invoke('AdvancePhaseWithoutOfflinePlayers');
  }

  private async ensureConnection(): Promise<void> {
    if (!this.connection) {
      await this.start();
    }
  }
}
