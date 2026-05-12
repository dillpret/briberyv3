import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { GameStateService } from '../state/game-state.service';
import { BribeMedia } from '../state/game-state.service';

export interface SubmitBribeRequest {
  targetPlayerId: string;
  text?: string;
  media?: BribeMedia;
}

interface LastJoin {
  gameId: string;
  playerId: string;
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class SignalrService {
  private connection?: signalR.HubConnection;
  private startPromise?: Promise<void>;
  private lastJoin?: LastJoin;
  private pendingJoinResolve?: () => void;
  private pendingJoinReject?: (reason?: unknown) => void;

  constructor(private gameState: GameStateService) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.reconnectAndRejoin());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void this.reconnectAndRejoin();
        }
      });
    }
  }

  async start(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    if (this.connection?.state === signalR.HubConnectionState.Connecting) {
      await this.startPromise;
      return;
    }

    if (this.connection?.state === signalR.HubConnectionState.Reconnecting) {
      return;
    }

    if (this.connection) {
      this.startPromise = this.connection.start()
        .then(() => {
          console.log('SignalR connected');
        })
        .catch((err) => {
          console.error('SignalR error:', err);
          throw err;
        })
        .finally(() => {
          this.startPromise = undefined;
        });

      await this.startPromise;
      return;
    }

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl("/hub/game")
      .withAutomaticReconnect([0, 2000, 5000, 10000, 15000, 30000])
      .withServerTimeout(120000)
      .withKeepAliveInterval(15000)
      .build();

    this.connection.on('GameStateUpdated', (state) => {
      console.log('GAME STATE RECEIVED', state);
      if (this.lastJoin && state.currentPlayerId) {
        this.lastJoin = {
          ...this.lastJoin,
          playerId: state.currentPlayerId,
        };
      }
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

    this.connection.onreconnected(() => {
      void this.rejoinLastLobby();
    });

    this.connection.onclose(() => {
      this.pendingJoinReject?.(new Error('Connection lost. Reconnecting...'));
      this.pendingJoinResolve = undefined;
      this.pendingJoinReject = undefined;
      window.setTimeout(() => void this.reconnectAndRejoin(), 1000);
    });

    try {
      this.startPromise = this.connection.start();
      await this.startPromise;
      console.log('SignalR connected');
    } catch (err) {
      console.error('SignalR error:', err);
      throw err;
    } finally {
      this.startPromise = undefined;
    }
  }

  async joinLobby(gameId: string, playerId: string, name: string): Promise<void> {
    await this.ensureConnection();
    this.lastJoin = { gameId, playerId, name };
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
      return;
    }

    if (this.connection.state === signalR.HubConnectionState.Disconnected) {
      await this.reconnectAndRejoin();
    }
  }

  private async reconnectAndRejoin(): Promise<void> {
    try {
      await this.start();
      await this.rejoinLastLobby();
    } catch (err) {
      console.error('SignalR reconnect failed:', err);
    }
  }

  private async rejoinLastLobby(): Promise<void> {
    if (!this.lastJoin || this.connection?.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    await this.connection.invoke(
      'JoinLobby',
      this.lastJoin.gameId,
      this.lastJoin.playerId,
      this.lastJoin.name,
    );
  }
}
