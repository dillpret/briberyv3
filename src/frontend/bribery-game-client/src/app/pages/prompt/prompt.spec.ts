import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Prompt } from './prompt';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';

describe('Prompt', () => {
  let fixture: ComponentFixture<Prompt>;
  let component: Prompt;
  let gameState: GameStateService;
  let signalr: Pick<SignalrService, 'submitPrompt' | 'advancePhaseWithoutOfflinePlayers'>;

  beforeEach(async () => {
    localStorage.clear();

    signalr = {
      submitPrompt: vi.fn().mockResolvedValue(undefined),
      advancePhaseWithoutOfflinePlayers: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Prompt],
      providers: [{ provide: SignalrService, useValue: signalr }],
    }).compileComponents();

    gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      currentRound: 1,
      phase: 'Prompt',
      isCurrentPlayerActive: true,
      promptRequiredCount: 1,
      promptSubmittedCount: 0,
      prompt: { hasSubmittedPrompt: false },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('populates the prompt text from the idea file when the idea button is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('First idea\nSecond idea')));
    vi.spyOn(Math, 'random').mockReturnValue(0);

    fixture = TestBed.createComponent(Prompt);
    component = fixture.componentInstance;
    fixture.detectChanges();

    await clickIdeaButton();

    expect(component.promptText).toBe('First idea');
  });

  it('updates the textarea on the first idea button click', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('First idea\nSecond idea')));
    vi.spyOn(Math, 'random').mockReturnValue(0);

    fixture = TestBed.createComponent(Prompt);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[aria-label="Give me an idea"]',
    ) as HTMLButtonElement;
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    button.click();
    await fixture.whenStable();

    expect(textarea.value).toBe('First idea');
  });

  it('can replace the current draft with another random idea', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('First idea\nSecond idea')));
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.75);

    fixture = TestBed.createComponent(Prompt);
    component = fixture.componentInstance;
    component.promptText = 'Player typed this first';
    fixture.detectChanges();

    await clickIdeaButton();
    expect(component.promptText).toBe('First idea');

    await clickIdeaButton();
    expect(component.promptText).toBe('Second idea');
  });

  it('does not repeat the same idea twice in a row when another idea exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('First idea\nSecond idea')));
    vi.spyOn(Math, 'random').mockReturnValue(0);

    fixture = TestBed.createComponent(Prompt);
    component = fixture.componentInstance;
    fixture.detectChanges();

    await clickIdeaButton();
    expect(component.promptText).toBe('First idea');

    await clickIdeaButton();
    expect(component.promptText).toBe('Second idea');
  });

  it('prefetches and reuses the idea file across clicks', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('First idea\nSecond idea'));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    fixture = TestBed.createComponent(Prompt);
    component = fixture.componentInstance;
    fixture.detectChanges();

    await clickIdeaButton();
    await clickIdeaButton();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores blank lines in the idea file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('\n\nOnly idea\n\n')));
    vi.spyOn(Math, 'random').mockReturnValue(0.95);

    fixture = TestBed.createComponent(Prompt);
    component = fixture.componentInstance;
    fixture.detectChanges();

    await clickIdeaButton();

    expect(component.promptText).toBe('Only idea');
  });

  it('ignores duplicate lines in the idea file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('First idea\nFirst idea\nSecond idea')));
    vi.spyOn(Math, 'random').mockReturnValue(0);

    fixture = TestBed.createComponent(Prompt);
    component = fixture.componentInstance;
    fixture.detectChanges();

    await clickIdeaButton();
    expect(component.promptText).toBe('First idea');

    await clickIdeaButton();
    expect(component.promptText).toBe('Second idea');
  });

  it('leaves existing text untouched when the idea file cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failed')));

    fixture = TestBed.createComponent(Prompt);
    component = fixture.componentInstance;
    component.promptText = 'Keep my draft';
    fixture.detectChanges();

    await clickIdeaButton();

    expect(component.promptText).toBe('Keep my draft');
  });

  it('explains prompts and the idea button replacement behavior', () => {
    fixture = TestBed.createComponent(Prompt);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain("A prompt can be a question, a challenge, or something simple like asking for everyone's best dad joke");
    expect(element.textContent).toContain('Other players will answer it with anonymous bribes');
    expect(element.textContent).toContain('Stuck? Use Give me an idea.');
    expect(element.textContent).toContain('Give me an idea');
    expect(element.querySelector('textarea')?.getAttribute('placeholder')).toBe('Best excuse for being late');
    expect(element.querySelector('[aria-label="Give me an idea"]')).not.toBeNull();
  });

  it('keeps offline copy hidden while connected players are still pending', () => {
    gameState.setGameState({
      phase: 'Prompt',
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
      isCurrentPlayerActive: true,
      promptRequiredCount: 4,
      promptSubmittedCount: 1,
      players: [
        { id: 'p1', name: 'Host', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Submitted' },
        { id: 'p2', name: 'Alex', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Pending', phaseStatusLabel: 'Needs prompt' },
        { id: 'p3', name: 'Blair', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Pending', phaseStatusLabel: 'Needs prompt' },
      ],
      offlineBlockingPlayerNames: ['Casey'],
      prompt: { hasSubmittedPrompt: true },
    });

    fixture = TestBed.createComponent(Prompt);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(component.waitingText()).toBe('Waiting for 3 players.');
    expect(element.textContent).toContain('Waiting for 3 players.');
    expect(element.textContent).not.toContain('Offline player blocking progress');
    expect(element.textContent).not.toContain('Advance without offline players');
  });

  it('shows offline-only blocker messaging to normal players without the host action', () => {
    gameState.setGameState({
      phase: 'Prompt',
      currentPlayerId: 'p2',
      hostPlayerId: 'p1',
      isCurrentPlayerActive: true,
      promptRequiredCount: 2,
      promptSubmittedCount: 1,
      players: [
        { id: 'p1', name: 'Host', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Submitted' },
        { id: 'p2', name: 'Alex', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Submitted' },
      ],
      offlineBlockingPlayerNames: ['Casey'],
      prompt: { hasSubmittedPrompt: true },
    });

    fixture = TestBed.createComponent(Prompt);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(component.waitingText()).toBe('Waiting on offline player: Casey.');
    expect(element.textContent).toContain('Offline player blocking progress');
    expect(element.textContent).toContain('Waiting on offline player: Casey.');
    expect(element.textContent).not.toContain('Advance without offline players');
  });

  async function clickIdeaButton() {
    const button = fixture.nativeElement.querySelector(
      '[aria-label="Give me an idea"]',
    ) as HTMLButtonElement;

    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }
});
