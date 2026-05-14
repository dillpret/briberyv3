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

  it('ignores blank lines in the idea file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('\n\nOnly idea\n\n')));
    vi.spyOn(Math, 'random').mockReturnValue(0.95);

    fixture = TestBed.createComponent(Prompt);
    component = fixture.componentInstance;
    fixture.detectChanges();

    await clickIdeaButton();

    expect(component.promptText).toBe('Only idea');
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

    expect(element.textContent).toContain('Write the thing other players will bribe you for');
    expect(element.textContent).toContain('The idea button replaces your draft');
    expect(element.textContent).toContain('Give me an idea');
    expect(element.querySelector('[aria-label="Give me an idea"]')).not.toBeNull();
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
