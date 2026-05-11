import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Results } from './results';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';

describe('Results', () => {
  let fixture: ComponentFixture<Results>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Results],
      providers: [{
        provide: SignalrService,
        useValue: { startNextRound: vi.fn().mockResolvedValue(undefined) },
      }],
    }).compileComponents();

    const gameState = TestBed.inject(GameStateService);
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
    fixture.detectChanges();
  });

  it('renders winning media bribes', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Player 1');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('/api/media/m1');
  });
});
