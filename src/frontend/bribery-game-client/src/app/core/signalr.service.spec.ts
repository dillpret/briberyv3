import { TestBed } from '@angular/core/testing';
import { SignalrService } from './signalr.service';
import { GameStateService } from '../state/game-state.service';
import * as signalR from '@microsoft/signalr';

type Handler = (...args: any[]) => void;

let handlers: Record<string, Handler>;
let onReconnected: Handler | undefined;
let onClose: Handler | undefined;
let connection: {
  state: string;
  start: ReturnType<typeof vi.fn>;
  invoke: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  onreconnected: ReturnType<typeof vi.fn>;
  onclose: ReturnType<typeof vi.fn>;
};

vi.mock('@microsoft/signalr', () => {
  const states = {
    Connected: 'Connected',
    Connecting: 'Connecting',
    Disconnected: 'Disconnected',
    Reconnecting: 'Reconnecting',
  };

  class HubConnectionBuilder {
    withUrl() {
      return this;
    }

    withAutomaticReconnect() {
      return this;
    }

    withServerTimeout() {
      return this;
    }

    withKeepAliveInterval() {
      return this;
    }

    build() {
      return connection;
    }
  }

  return {
    HubConnectionState: states,
    HubConnectionBuilder,
  };
});

describe('SignalrService', () => {
  let service: SignalrService;

  beforeEach(() => {
    handlers = {};
    onReconnected = undefined;
    onClose = undefined;
    connection = {
      state: signalR.HubConnectionState.Disconnected,
      start: vi.fn().mockImplementation(() => {
        connection.state = signalR.HubConnectionState.Connected;
        return Promise.resolve();
      }),
      invoke: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((eventName: string, handler: Handler) => {
        handlers[eventName] = handler;
      }),
      onreconnected: vi.fn((handler: Handler) => {
        onReconnected = handler;
      }),
      onclose: vi.fn((handler: Handler) => {
        onClose = handler;
      }),
    };
    TestBed.configureTestingModule({
      providers: [SignalrService, GameStateService],
    });
    service = TestBed.inject(SignalrService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function joinAndReceiveState(playerId = 'p1', confirmedPlayerId = playerId) {
    const join = service.joinLobby('ABCD', playerId, 'Player 1');
    await vi.waitFor(() => {
      expect(connection.invoke).toHaveBeenCalledWith('JoinLobby', 'ABCD', playerId, 'Player 1');
    });

    handlers['GameStateUpdated']({ phase: 'Lobby', currentPlayerId: confirmedPlayerId });
    await join;
  }

  it('rejoins the last lobby after SignalR reconnects with a new connection id', async () => {
    await joinAndReceiveState('p-new', 'p1');

    connection.invoke.mockClear();
    await (onReconnected?.('new-connection-id') as unknown as Promise<void>);

    expect(connection.invoke).toHaveBeenCalledWith('JoinLobby', 'ABCD', 'p1', 'Player 1');
  });

  it('restarts and rejoins a stopped connection before sending player actions', async () => {
    await joinAndReceiveState();

    connection.invoke.mockClear();
    connection.start.mockClear();
    connection.state = signalR.HubConnectionState.Disconnected;

    await service.toggleReady();

    expect(connection.start).toHaveBeenCalledTimes(1);
    expect(connection.invoke).toHaveBeenNthCalledWith(1, 'JoinLobby', 'ABCD', 'p1', 'Player 1');
    expect(connection.invoke).toHaveBeenNthCalledWith(2, 'ToggleReady');
  });

  it('retries a closed connection without requiring a page refresh', async () => {
    await joinAndReceiveState();

    vi.spyOn(window, 'setTimeout').mockImplementation((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        handler();
      }

      return 0;
    });
    connection.invoke.mockClear();
    connection.start.mockClear();
    connection.state = signalR.HubConnectionState.Disconnected;
    onClose?.();

    expect(connection.start).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(connection.invoke).toHaveBeenCalledWith('JoinLobby', 'ABCD', 'p1', 'Player 1');
    });
  });
});
