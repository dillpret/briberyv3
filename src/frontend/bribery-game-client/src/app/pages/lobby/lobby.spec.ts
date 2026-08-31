import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { WaitingTipsService } from '../../components/waiting-tips/waiting-tips.service';

import { Lobby } from './lobby';

describe('Lobby', () => {
  let component: Lobby;
  let fixture: ComponentFixture<Lobby>;
  let signalr: Pick<SignalrService, 'toggleReady' | 'startGame' | 'updateGameSettings'>;
  let gameState: GameStateService;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('playerId', 'stale-player-id');
    signalr = {
      toggleReady: vi.fn().mockResolvedValue(undefined),
      startGame: vi.fn().mockResolvedValue(undefined),
      updateGameSettings: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Lobby],
      providers: [
        { provide: SignalrService, useValue: signalr },
        { provide: WaitingTipsService, useValue: { currentTip: signal('Lobby waiting tip') } },
      ],
    }).compileComponents();

    gameState = TestBed.inject(GameStateService);
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
    expect(component.canStartHint()).toBe('Waiting for at least 3 connected players.');
    expect(component.canStart()).toBe(false);
  });

  it('updates the start hint when enough players are connected', () => {
    component.players.set([
      { id: 'p1', name: 'Player 1', connected: true, isReady: true, isActive: true, score: 0, phaseStatus: 'Ready', phaseStatusLabel: 'Ready' },
      { id: 'p2', name: 'Player 2', connected: true, isReady: true, isActive: true, score: 0, phaseStatus: 'Ready', phaseStatusLabel: 'Ready' },
      { id: 'p3', name: 'Player 3', connected: true, isReady: true, isActive: true, score: 0, phaseStatus: 'Ready', phaseStatusLabel: 'Ready' },
    ]);

    expect(component.canStartHint()).toBe('Everyone is ready.');
    expect(component.canStart()).toBe(true);
  });

  it('renders current-player ready state and host controls', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(component.isCurrentPlayerReady()).toBe(true);
    expect(element.textContent).toContain('I need a moment');
    expect(element.textContent).toContain('Start game');
    expect(element.textContent).toContain('Lobby waiting tip');
  });

  it('renders editable host timer controls with disabled duration inputs for off timers', () => {
    const element = fixture.nativeElement as HTMLElement;
    const timerToggles = element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const durationInputs = element.querySelectorAll<HTMLInputElement>('input[type="number"]');

    expect(element.textContent).toContain('Game settings');
    expect(element.textContent).toContain('2 prompts each · Timers off');
    expect(element.textContent).toContain('Round format');
    expect(element.textContent).toContain('Prompts answered per player');
    expect(element.textContent).toContain('Requires at least 3 connected players');
    expect(element.textContent).toContain('Round timers');
    expect(element.textContent).toContain('Time limit');
    expect(timerToggles).toHaveLength(4);
    expect(durationInputs).toHaveLength(4);
    expect(Array.from(durationInputs).every((input) => input.disabled)).toBe(true);
    expect(Array.from(durationInputs).map((input) => input.value)).toEqual(['120', '300', '90', '120']);
    expect(element.querySelector<HTMLSelectElement>('select[aria-label="Prompts answered per player"]')?.value).toBe('2');
  });

  it('updates prompts answered per player through SignalR', async () => {
    await component.updatePromptsAnsweredPerPlayer(5);

    expect(signalr.updateGameSettings).toHaveBeenCalledWith(
      expect.objectContaining({ promptsAnsweredPerPlayer: 5 }),
    );
  });

  it('uses the configured prompt count for the start requirement', () => {
    gameState.settings.update((settings) => ({ ...settings, promptsAnsweredPerPlayer: 3 }));
    component.players.set([
      { id: 'p1', name: 'Player 1', connected: true, isReady: true, isActive: true, score: 0, phaseStatus: 'Ready', phaseStatusLabel: 'Ready' },
      { id: 'p2', name: 'Player 2', connected: true, isReady: true, isActive: true, score: 0, phaseStatus: 'Ready', phaseStatusLabel: 'Ready' },
      { id: 'p3', name: 'Player 3', connected: true, isReady: true, isActive: true, score: 0, phaseStatus: 'Ready', phaseStatusLabel: 'Ready' },
    ]);
    fixture.detectChanges();

    const startButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.includes('Start game'))!;

    expect(component.minimumPlayersRequired()).toBe(4);
    expect(component.canStartHint()).toBe('Waiting for at least 4 connected players.');
    expect(startButton.disabled).toBe(true);
  });

  it('enables the seconds input and avoids duplicate duration text when a host timer is on', async () => {
    gameState.settings.set({
      promptsAnsweredPerPlayer: 2,
      promptTimer: { enabled: true, durationSeconds: 120 },
      submissionTimer: { enabled: false, durationSeconds: 300 },
      votingTimer: { enabled: false, durationSeconds: 90 },
      appreciationTimer: { enabled: false, durationSeconds: 120 },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const durationInputs = element.querySelectorAll<HTMLInputElement>('input[type="number"]');

    expect(component.settingsSummary()).toBe('2 prompts each · 1 timer enabled');
    expect(durationInputs[0].disabled).toBe(false);
    expect(durationInputs[0].value).toBe('120');
    expect(element.textContent).not.toContain('120 seconds');
  });

  it('sends clamped timer updates through SignalR', async () => {
    await component.updateTimer('promptTimer', { enabled: true, durationSeconds: 999 });

    expect(signalr.updateGameSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTimer: { enabled: true, durationSeconds: 600 },
      }),
    );
  });

  it('renders waiting copy for non-host players', () => {
    component.hostPlayerId.set('p2');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('The host will start once everyone is ready.');
  });

  it('renders read-only timer summaries for non-host players', () => {
    gameState.settings.set({
      promptsAnsweredPerPlayer: 4,
      promptTimer: { enabled: true, durationSeconds: 120 },
      submissionTimer: { enabled: false, durationSeconds: 300 },
      votingTimer: { enabled: false, durationSeconds: 90 },
      appreciationTimer: { enabled: false, durationSeconds: 120 },
    });
    component.hostPlayerId.set('p2');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('120 seconds');
    expect(element.textContent).toContain('4 prompts');
    expect(element.textContent).toContain('Off');
    expect(element.querySelectorAll('select')).toHaveLength(0);
    expect(element.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(element.querySelectorAll('input[type="number"]')).toHaveLength(0);
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
