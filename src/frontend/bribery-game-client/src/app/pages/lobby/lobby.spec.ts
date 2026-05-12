import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';

import { Lobby } from './lobby';

describe('Lobby', () => {
  let component: Lobby;
  let fixture: ComponentFixture<Lobby>;
  let signalr: Pick<SignalrService, 'toggleReady' | 'startGame'>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('playerId', 'stale-player-id');
    signalr = {
      toggleReady: vi.fn().mockResolvedValue(undefined),
      startGame: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Lobby],
      providers: [{ provide: SignalrService, useValue: signalr }],
    }).compileComponents();

    const gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      phase: 'Lobby',
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
      players: [
        { id: 'p1', name: 'Player 1', connected: true, isReady: true, isActive: true, score: 0, phaseStatus: 'Ready', phaseStatusLabel: 'Ready' },
        { id: 'p2', name: 'Player 2', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Pending', phaseStatusLabel: 'Not ready' },
        { id: 'p3', name: 'Player 3', connected: false, isReady: false, isActive: true, score: 0, phaseStatus: 'None', phaseStatusLabel: 'Offline' },
      ],
    });

    fixture = TestBed.createComponent(Lobby);
    component = fixture.componentInstance;
    component.gameId = ' ab12 ';
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('calculates connected, ready, pending, and progress values', () => {
    expect(component.connectedCount()).toBe(2);
    expect(component.readyCount()).toBe(1);
    expect(component.pendingReadyCount()).toBe(1);
    expect(component.readyPercent()).toBe(50);
    expect(component.canStartHint()).toBe('Waiting for at least three connected players.');
  });

  it('updates the start hint when enough players are connected', () => {
    component.players.set([
      { id: 'p1', name: 'Player 1', connected: true, isReady: true, isActive: true, score: 0, phaseStatus: 'Ready', phaseStatusLabel: 'Ready' },
      { id: 'p2', name: 'Player 2', connected: true, isReady: true, isActive: true, score: 0, phaseStatus: 'Ready', phaseStatusLabel: 'Ready' },
      { id: 'p3', name: 'Player 3', connected: true, isReady: true, isActive: true, score: 0, phaseStatus: 'Ready', phaseStatusLabel: 'Ready' },
    ]);

    expect(component.canStartHint()).toBe('Everyone is ready.');
  });

  it('renders current-player ready state and host controls', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(component.isCurrentPlayerReady()).toBe(true);
    expect(element.textContent).toContain('I need a moment');
    expect(element.textContent).toContain('Start game');
  });

  it('renders waiting copy for non-host players', () => {
    component.hostPlayerId.set('p2');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('The host will start once everyone is ready.');
  });

  it('copies the normalized room code and link', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

    await component.copyCode();
    expect(writeText).toHaveBeenCalledWith('AB12');
    expect(component.copyMessage).toBe('Copied code');

    await component.copyLink();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/game/AB12`);
    expect(component.copyMessage).toBe('Copied link');

    vi.runOnlyPendingTimers();
    expect(component.copyMessage).toBe('');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows a copy failure message when clipboard access fails', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
    });

    await component.copyCode();

    expect(component.copyMessage).toBe('Copy failed');
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
