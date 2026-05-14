import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Voting } from './voting';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';

describe('Voting', () => {
  let fixture: ComponentFixture<Voting>;
  let component: Voting;
  let signalr: Pick<SignalrService, 'submitVote' | 'advancePhaseWithoutOfflinePlayers'>;

  beforeEach(async () => {
    signalr = {
      submitVote: vi.fn().mockResolvedValue(undefined),
      advancePhaseWithoutOfflinePlayers: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Voting],
      providers: [{ provide: SignalrService, useValue: signalr }],
    }).compileComponents();

    const gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      phase: 'Voting',
      currentPlayerId: 'p1',
      isCurrentPlayerActive: true,
      voteSubmittedCount: 0,
      voteRequiredCount: 1,
      voting: {
        promptText: 'Convince me to pick your bribe',
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
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders text and media bribes without submitter identity', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('A text bribe');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('/api/media/m1');
    expect(element.textContent).not.toContain('Player 2');
  });

  it('submits the selected bribe id', async () => {
    component.selectedBribeId.set('b2');

    await component.submitVote();

    expect(signalr.submitVote).toHaveBeenCalledWith('b2');
  });

  it('does not submit without a selection', async () => {
    await component.submitVote();

    expect(signalr.submitVote).not.toHaveBeenCalled();
  });

  it('explains that voting picks the favourite bribe sent to your prompt', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('anonymous bribes were sent to win over your prompt');
    expect(element.textContent).toContain('Choose the one that makes the best case');
    expect(element.textContent).toContain('the player who sent it gets 1 point');
  });

  it('shows the current player prompt while choosing a bribe', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Your prompt');
    expect(element.textContent).toContain('Convince me to pick your bribe');
    expect(element.textContent).toContain("another player's anonymous attempt to answer this prompt");
  });
});
