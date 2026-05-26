import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Appreciation } from './appreciation';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';

describe('Appreciation', () => {
  let fixture: ComponentFixture<Appreciation>;
  let component: Appreciation;
  let gameState: GameStateService;
  let signalr: Pick<SignalrService, 'toggleAppreciationCoin' | 'submitAppreciationDone' | 'advancePhaseWithoutOfflinePlayers'>;

  beforeEach(async () => {
    signalr = {
      toggleAppreciationCoin: vi.fn().mockResolvedValue(undefined),
      submitAppreciationDone: vi.fn().mockResolvedValue(undefined),
      advancePhaseWithoutOfflinePlayers: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Appreciation],
      providers: [{ provide: SignalrService, useValue: signalr }],
    }).compileComponents();

    gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      phase: 'Appreciation',
      currentRound: 1,
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
      isCurrentPlayerActive: true,
      canHostAdvanceWithoutOfflinePlayers: true,
      offlineBlockingPlayerNames: [],
      players: [
        { id: 'p1', name: 'Player 1', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Pending', phaseStatusLabel: 'Browsing' },
        { id: 'p2', name: 'Player 2', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Pending', phaseStatusLabel: 'Browsing' },
        { id: 'p3', name: 'Player 3', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Pending', phaseStatusLabel: 'Browsing' },
      ],
      appreciation: {
        donePlayerIds: [],
        doneCount: 0,
        requiredCount: 3,
        hasCurrentPlayerDone: false,
        roundResults: [
          result({ promptOwnerPlayerId: 'p2', promptOwnerName: 'Player 2', winningPlayerId: 'p1', winningPlayerName: 'Player 1', currentPlayerSubmittedBribe: true, currentPlayerSubmittedWinningBribe: true, canCurrentPlayerAwardCoin: false, coinDisabledReason: 'You cannot award a coin to your own bribe' }),
          result({ promptOwnerPlayerId: 'p3', promptOwnerName: 'Player 3', winningPlayerId: 'p2', winningPlayerName: 'Player 2', currentPlayerSubmittedBribe: true, canCurrentPlayerAwardCoin: true }),
          result({ promptOwnerPlayerId: 'p1', promptOwnerName: 'Player 1', winningPlayerId: 'p3', winningPlayerName: 'Player 3', isCurrentPlayersPrompt: true, canCurrentPlayerAwardCoin: false, coinDisabledReason: 'You already chose this winning bribe' }),
        ],
      },
    });

    fixture = TestBed.createComponent(Appreciation);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders submitted prompts first and own prompt last from the provided order', () => {
    const cards = Array.from(fixture.nativeElement.querySelectorAll('article')) as HTMLElement[];

    expect(cards[0].textContent).toContain('Your bribe won this one');
    expect(cards[0].textContent).toContain("Player 1's bribe");
    expect(cards[0].textContent).toContain('for this prompt');
    expect(cards[1].textContent).toContain("Player 2's bribe beat yours here");
    expect(cards[2].textContent).toContain('Your prompt, your pick');
  });

  it('renders coin selected and disabled states', () => {
    gameState.appreciation.update((state) => ({
      ...state!,
      roundResults: state!.roundResults.map((roundResult) =>
        roundResult.winningBribeId === 'bribe-p2'
          ? { ...roundResult, hasCurrentPlayerAwardedCoin: true, coinCount: 1 }
          : roundResult),
    }));
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const selectedCoin = buttons.find((button) => button.textContent?.includes('Coin given'));
    const disabledCoin = buttons.find((button) => button.textContent?.includes('+🪙') && button.disabled);

    expect(selectedCoin?.getAttribute('aria-pressed')).toBe('true');
    expect(disabledCoin).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('You cannot award a coin to your own bribe');
  });

  it('submits done and shows waiting controls', async () => {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((candidate) => candidate.textContent?.includes('Done appreciating')) as HTMLButtonElement;

    button.click();
    await fixture.whenStable();

    expect(signalr.submitAppreciationDone).toHaveBeenCalled();

    gameState.appreciation.update((state) => ({ ...state!, hasCurrentPlayerDone: true, doneCount: 1 }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Appreciation done');
  });
});

function result(overrides: any) {
  return {
    promptOwnerPlayerId: 'p',
    promptOwnerName: 'Player',
    promptText: 'A prompt',
    winningBribeKind: 'Text',
    winningBribeText: 'A winning bribe',
    winningBribeMedia: null,
    winningPlayerId: 'winner',
    winningPlayerName: 'Winner',
    winningBribeId: `bribe-${overrides.winningPlayerId ?? 'winner'}`,
    isCurrentPlayersPrompt: false,
    currentPlayerSubmittedBribe: false,
    currentPlayerSubmittedWinningBribe: false,
    canCurrentPlayerAwardCoin: true,
    hasCurrentPlayerAwardedCoin: false,
    coinCount: 0,
    coinDisabledReason: null,
    ...overrides,
  };
}
