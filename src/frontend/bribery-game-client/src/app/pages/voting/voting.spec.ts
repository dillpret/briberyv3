import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Voting } from './voting';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { WaitingTipsService } from '../../components/waiting-tips/waiting-tips.service';

describe('Voting', () => {
  let fixture: ComponentFixture<Voting>;
  let component: Voting;
  let gameState: GameStateService;
  let signalr: Pick<SignalrService, 'submitVote' | 'saveVoteDraft' | 'advancePhaseWithoutOfflinePlayers'>;

  beforeEach(async () => {
    signalr = {
      submitVote: vi.fn().mockResolvedValue(undefined),
      saveVoteDraft: vi.fn().mockResolvedValue(undefined),
      advancePhaseWithoutOfflinePlayers: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Voting],
      providers: [
        { provide: SignalrService, useValue: signalr },
        { provide: WaitingTipsService, useValue: { currentTip: signal('Voting waiting tip') } },
      ],
    }).compileComponents();

    gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      phase: 'Voting',
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
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

  it('renders five incoming voting choices', () => {
    gameState.voting.update((voting) => ({
      ...voting!,
      bribes: Array.from({ length: 5 }, (_, index) => ({
        bribeId: `b${index + 1}`,
        kind: 'Text' as const,
        text: `Bribe ${index + 1}`,
        media: null,
      })),
    }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('label.soft-card')).toHaveLength(5);
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

    expect(element.textContent).toContain('Pick your favourite bribe');
    expect(element.textContent).toContain('Pick the anonymous answer you like most');
  });

  it('shows the submit vote action only after a bribe is selected', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Submit vote');

    component.selectBribe('b1');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Submit vote');
  });

  it('shows the current player prompt while choosing a bribe', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Your prompt');
    expect(element.textContent).toContain('Convince me to pick your bribe');
    expect(element.textContent).toContain('Pick the bribe you like most');
  });

  it('counts offline blockers without showing the offline advance panel while connected voters are pending', () => {
    gameState.setGameState({
      phase: 'Voting',
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
      isCurrentPlayerActive: true,
      voteSubmittedCount: 1,
      voteRequiredCount: 4,
      players: [
        { id: 'p1', name: 'Host', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Voted' },
        { id: 'p2', name: 'Alex', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Pending', phaseStatusLabel: 'Needs vote' },
        { id: 'p3', name: 'Blair', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Pending', phaseStatusLabel: 'Needs vote' },
      ],
      offlineBlockingPlayerNames: ['Casey'],
      voting: {
        promptText: 'Convince me to pick your bribe',
        selectedBribeId: 'b1',
        bribes: [{ bribeId: 'b1', kind: 'Text', text: 'A text bribe', media: null }],
      },
    });

    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(component.waitingText()).toBe('Waiting for 3 players.');
    expect(element.textContent).toContain('Waiting for 3 players.');
    expect(element.textContent).toContain('Voting waiting tip');
    expect(element.textContent).not.toContain('Offline player blocking progress');
    expect(element.textContent).not.toContain('Advance without offline players');
  });

  it('shows the host offline advance action only when offline players are the only blockers', () => {
    gameState.setGameState({
      phase: 'Voting',
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
      isCurrentPlayerActive: true,
      voteSubmittedCount: 1,
      voteRequiredCount: 2,
      canHostAdvanceWithoutOfflinePlayers: true,
      players: [
        { id: 'p1', name: 'Host', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Voted' },
      ],
      offlineBlockingPlayerNames: ['Casey'],
      voting: {
        promptText: 'Convince me to pick your bribe',
        selectedBribeId: 'b1',
        bribes: [{ bribeId: 'b1', kind: 'Text', text: 'A text bribe', media: null }],
      },
    });

    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(component.waitingText()).toBe('Waiting on offline player: Casey.');
    expect(element.textContent).toContain('Offline player blocking progress');
    expect(element.textContent).toContain('Waiting on offline player: Casey.');
    expect(element.textContent).toContain('Advance without offline players');
  });
});
