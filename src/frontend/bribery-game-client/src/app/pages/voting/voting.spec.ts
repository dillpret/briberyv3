import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Voting } from './voting';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';

describe('Voting', () => {
  let fixture: ComponentFixture<Voting>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Voting],
      providers: [{
        provide: SignalrService,
        useValue: {
          submitVote: vi.fn().mockResolvedValue(undefined),
          advancePhaseWithoutOfflinePlayers: vi.fn().mockResolvedValue(undefined),
        },
      }],
    }).compileComponents();

    const gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      phase: 'Voting',
      currentPlayerId: 'p1',
      isCurrentPlayerActive: true,
      voteSubmittedCount: 0,
      voteRequiredCount: 1,
      voting: {
        selectedBribeId: null,
        bribes: [
          { bribeId: 'b1', kind: 'Text', text: 'A text bribe', media: null },
          {
            bribeId: 'b2',
            kind: 'Media',
            text: '',
            media: { mediaId: 'm1', url: '/api/media/m1', contentType: 'image/gif', byteSize: 12 },
          },
        ],
      },
    });

    fixture = TestBed.createComponent(Voting);
    fixture.detectChanges();
  });

  it('renders text and media bribes without submitter identity', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('A text bribe');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('/api/media/m1');
    expect(element.textContent).not.toContain('Player 2');
  });
});
