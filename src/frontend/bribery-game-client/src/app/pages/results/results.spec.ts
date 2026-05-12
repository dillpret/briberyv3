import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Results } from './results';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';

describe('Results', () => {
  let fixture: ComponentFixture<Results>;
  let component: Results;
  let gameState: GameStateService;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('playerId', 'stale-player-id');

    await TestBed.configureTestingModule({
      imports: [Results],
      providers: [{
        provide: SignalrService,
        useValue: { startNextRound: vi.fn().mockResolvedValue(undefined) },
      }],
    }).compileComponents();

    gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      phase: 'Results',
      currentRound: 1,
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
      players: [
        { id: 'p1', name: 'Player 1', connected: true, isReady: false, isActive: true, score: 1, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
        { id: 'p2', name: 'Player 2', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
        { id: 'p3', name: 'Player 3', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
      ],
      results: {
        roundResults: [{
          promptOwnerPlayerId: 'p2',
          promptOwnerName: 'Player 2',
          promptText: 'A prompt',
          winningBribeKind: 'Media',
          winningBribeText: '',
          winningBribeMedia: { mediaId: 'm1', url: '/api/media/m1', contentType: 'image/png', byteSize: 10 },
          winningPlayerId: 'p1',
          winningPlayerName: 'Player 1',
        }],
      },
    });

    fixture = TestBed.createComponent(Results);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders winning media bribes', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Player 1');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('/api/media/m1');
  });

  it('sorts the scoreboard by score and then player name', () => {
    gameState.players.set([
      { id: 'p1', name: 'Charlie', connected: true, isReady: false, isActive: true, score: 2, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
      { id: 'p2', name: 'Alice', connected: true, isReady: false, isActive: true, score: 2, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
      { id: 'p3', name: 'Bob', connected: true, isReady: false, isActive: true, score: 4, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
    ]);

    expect(component.sortedPlayers().map((player) => player.name)).toEqual(['Bob', 'Alice', 'Charlie']);
  });

  it('disables the next round when fewer than three players are connected', () => {
    gameState.players.set([
      { id: 'p1', name: 'Player 1', connected: true, isReady: false, isActive: true, score: 1, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
      { id: 'p2', name: 'Player 2', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
      { id: 'p3', name: 'Player 3', connected: false, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
    ]);
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const button = buttons.find((candidate) => candidate.textContent?.includes('Start next round')) as HTMLButtonElement;

    expect(component.canStartNextRound()).toBe(false);
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('At least three connected players are needed');
  });
});
