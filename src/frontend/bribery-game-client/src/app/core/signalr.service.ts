import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { GameStateService } from '../state/game-state.service';
import { BribeMedia } from '../state/game-state.service';

export interface SubmitBribeRequest {
  targetPlayerId: string;
  text?: string;
  media?: BribeMedia;
}

interface ActiveSession {
  gameId: string;
  playerId: string;
  name: string;
}

type ConnectionMode = 'not-connected' | 'reconnecting' | 'connected';

@Injectable({
  providedIn: 'root',
})
export class SignalrService {
  private connection?: signalR.HubConnection;
  private connectionMode: ConnectionMode = 'not-connected';
  private startPromise?: Promise<void>;
  private activeSession?: ActiveSession;
  private reconnectPromise?: Promise<void>;
  private resolveReconnect?: () => void;
  private rejectReconnect?: (reason?: unknown) => void;
  private pendingJoinResolve?: () => void;
  private pendingJoinReject?: (reason?: unknown) => void;

  constructor(private gameState: GameStateService) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.restoreConnectionAndSession().catch((err) =>
          console.error('SignalR reconnect failed:', err));
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void this.restoreConnectionAndSession().catch((err) =>
            console.error('SignalR reconnect failed:', err));
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
      this.beginReconnect();
      await this.reconnectPromise;
      return;
    }

    if (this.connection) {
      this.startPromise = this.connection.start()
        .then(() => {
          console.log('SignalR connected');
          this.connectionMode = 'connected';
        })
        .catch((err) => {
          this.connectionMode = 'not-connected';
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
      if (this.activeSession && state.currentPlayerId) {
        this.activeSession = {
          ...this.activeSession,
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

    this.connection.onreconnecting(() => {
      this.beginReconnect();
    });

    this.connection.onreconnected(() => {
      void this.completeReconnect();
    });

    this.connection.onclose(() => {
      this.connectionMode = 'not-connected';
      this.pendingJoinReject?.(new Error('Connection lost. Reconnecting...'));
      this.pendingJoinResolve = undefined;
      this.pendingJoinReject = undefined;
      this.rejectReconnect?.(new Error('Connection closed before reconnect completed.'));
      this.clearReconnectWaiters();
      window.setTimeout(() => {
        void this.restoreConnectionAndSession().catch((err) =>
          console.error('SignalR reconnect failed:', err));
      }, 1000);
    });

    try {
      this.startPromise = this.connection.start();
      await this.startPromise;
      console.log('SignalR connected');
      this.connectionMode = 'connected';
    } catch (err) {
      this.connectionMode = 'not-connected';
      console.error('SignalR error:', err);
      throw err;
    } finally {
      this.startPromise = undefined;
    }
  }

  async joinLobby(gameId: string, playerId: string, name: string): Promise<void> {
    await this.ensureTransportConnected();
    this.activeSession = { gameId, playerId, name };
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
    await this.ensureTransportConnected();
    return await this.connection!.invoke<string>('CreateGame');
  }

  async toggleReady(): Promise<void> {
    await this.ensureReadyForAction();
    await this.connection!.invoke('ToggleReady');
  }

  async startGame(): Promise<void> {
    await this.ensureReadyForAction();
    await this.connection!.invoke('StartGame');
  }

  async submitPrompt(text: string): Promise<void> {
    await this.ensureReadyForAction();
    await this.connection!.invoke('SubmitPrompt', text);
  }

  async submitBribe(request: SubmitBribeRequest): Promise<void> {
    await this.ensureReadyForAction();
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
    await this.ensureReadyForAction();
    await this.connection!.invoke('SubmitVote', bribeId);
  }

  async startNextRound(): Promise<void> {
    await this.ensureReadyForAction();
    await this.connection!.invoke('StartNextRound');
  }

  async advancePhaseWithoutOfflinePlayers(): Promise<void> {
    await this.ensureReadyForAction();
    await this.connection!.invoke('AdvancePhaseWithoutOfflinePlayers');
  }

  private async ensureReadyForAction(): Promise<void> {
    await this.restoreConnectionAndSession();

    if (this.connectionMode !== 'connected' || this.connection?.state !== signalR.HubConnectionState.Connected) {
      throw new Error('Connection is still reconnecting. Please try again in a moment.');
    }
  }

  private async ensureTransportConnected(): Promise<void> {
    await this.start();

    if (this.connectionMode !== 'connected' || this.connection?.state !== signalR.HubConnectionState.Connected) {
      throw new Error('Connection is still reconnecting. Please try again in a moment.');
    }
  }

  private async restoreConnectionAndSession(): Promise<void> {
    const wasReconnecting = this.connection?.state === signalR.HubConnectionState.Reconnecting;

    await this.start();

    if (wasReconnecting) {
      return;
    }

    await this.restoreActiveSession();
  }

  private async restoreActiveSession(): Promise<void> {
    if (!this.activeSession || this.connection?.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    await this.connection.invoke(
      'JoinLobby',
      this.activeSession.gameId,
      this.activeSession.playerId,
      this.activeSession.name,
    );
  }

  private beginReconnect(): void {
    this.connectionMode = 'reconnecting';

    if (this.reconnectPromise) {
      return;
    }

    this.reconnectPromise = new Promise<void>((resolve, reject) => {
      this.resolveReconnect = resolve;
      this.rejectReconnect = reject;
    });
  }

  private async completeReconnect(): Promise<void> {
    try {
      await this.restoreActiveSession();
      this.connectionMode = 'connected';
      this.resolveReconnect?.();
    } catch (err) {
      this.connectionMode = 'not-connected';
      this.rejectReconnect?.(err);
    } finally {
      this.clearReconnectWaiters();
    }
  }

  private clearReconnectWaiters(): void {
    this.reconnectPromise = undefined;
    this.resolveReconnect = undefined;
    this.rejectReconnect = undefined;
  }
}
