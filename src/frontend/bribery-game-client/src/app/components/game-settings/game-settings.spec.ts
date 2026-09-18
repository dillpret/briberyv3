import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SignalrService } from '../../core/signalr.service';
import { GameSettings, GameStateService } from '../../state/game-state.service';
import { GameSettingsPanel } from './game-settings';

describe('GameSettingsPanel', () => {
  let fixture: ComponentFixture<GameSettingsPanel>;
  let component: GameSettingsPanel;
  let signalr: Pick<SignalrService, 'updateGameSettings'>;
  let gameState: GameStateService;

  const settings = (): GameSettings => ({
    promptsAnsweredPerPlayer: 2,
    bribeFallbackMode: 'AutoFill',
    promptTimer: { enabled: false, durationSeconds: 120 },
    submissionTimer: { enabled: false, durationSeconds: 300 },
    votingTimer: { enabled: false, durationSeconds: 90 },
    appreciationTimer: { enabled: false, durationSeconds: 120 },
  });

  beforeEach(async () => {
    signalr = { updateGameSettings: vi.fn().mockResolvedValue(undefined) };
    await TestBed.configureTestingModule({
      imports: [GameSettingsPanel],
      providers: [{ provide: SignalrService, useValue: signalr }],
    }).compileComponents();

    gameState = TestBed.inject(GameStateService);
    fixture = TestBed.createComponent(GameSettingsPanel);
    component = fixture.componentInstance;
    component.settings = settings();
    component.editable = true;
    fixture.detectChanges();
  });

  it('renders editable controls for the host', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('2 prompts each · Auto-fill · Timers off');
    expect(element.querySelectorAll('select')).toHaveLength(2);
    expect(element.querySelectorAll('input[type="checkbox"]')).toHaveLength(4);
    expect(element.querySelectorAll('input[type="number"]')).toHaveLength(4);
  });

  it('renders summaries without controls for non-host players', () => {
    component.settings = {
      ...settings(),
      promptsAnsweredPerPlayer: 4,
      bribeFallbackMode: 'NoFallback',
      promptTimer: { enabled: true, durationSeconds: 45 },
    };
    component.editable = false;
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('4 prompts each · No fallback · 1 timer enabled');
    expect(element.textContent).toContain('45 seconds');
    expect(element.querySelectorAll('select, input')).toHaveLength(0);
  });

  it('sends complete prompt-count and fallback updates', async () => {
    await component.updatePromptsAnsweredPerPlayer(5);
    await component.updateBribeFallbackMode('NoFallback');

    expect(signalr.updateGameSettings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ promptsAnsweredPerPlayer: 5, bribeFallbackMode: 'AutoFill' }),
    );
    expect(signalr.updateGameSettings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ promptsAnsweredPerPlayer: 5, bribeFallbackMode: 'NoFallback' }),
    );
  });

  it('updates the connected-player requirement immediately when the prompt count changes', async () => {
    const selector = fixture.nativeElement.querySelector(
      'select[aria-label="Prompts answered per player"]',
    ) as HTMLSelectElement;

    for (const promptsAnsweredPerPlayer of [3, 4, 5]) {
      selector.value = String(promptsAnsweredPerPlayer);
      selector.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        `Requires at least ${promptsAnsweredPerPlayer + 1} connected players.`,
      );
      expect(gameState.settings().promptsAnsweredPerPlayer).toBe(promptsAnsweredPerPlayer);

      await fixture.whenStable();
      fixture.detectChanges();
    }
  });

  it('rolls back an optimistic prompt-count change when saving fails', async () => {
    vi.mocked(signalr.updateGameSettings).mockRejectedValueOnce(new Error('Connection lost'));

    await expect(component.updatePromptsAnsweredPerPlayer(5)).rejects.toThrow('Connection lost');
    fixture.detectChanges();

    expect(component.settings.promptsAnsweredPerPlayer).toBe(2);
    expect(gameState.settings().promptsAnsweredPerPlayer).toBe(2);
    expect(gameState.settingsUpdatePending()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Requires at least 3 connected players.');
  });

  it('clamps timer durations and preserves the other settings', async () => {
    await component.updateTimer('promptTimer', { enabled: true, durationSeconds: 999 });

    expect(signalr.updateGameSettings).toHaveBeenCalledWith({
      ...settings(),
      promptTimer: { enabled: true, durationSeconds: 600 },
    });
  });
});
