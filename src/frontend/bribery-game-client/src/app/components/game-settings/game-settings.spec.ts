import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SignalrService } from '../../core/signalr.service';
import { GameSettings } from '../../state/game-state.service';
import { GameSettingsPanel } from './game-settings';

describe('GameSettingsPanel', () => {
  let fixture: ComponentFixture<GameSettingsPanel>;
  let component: GameSettingsPanel;
  let signalr: Pick<SignalrService, 'updateGameSettings'>;

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
      expect.objectContaining({ promptsAnsweredPerPlayer: 2, bribeFallbackMode: 'NoFallback' }),
    );
  });

  it('clamps timer durations and preserves the other settings', async () => {
    await component.updateTimer('promptTimer', { enabled: true, durationSeconds: 999 });

    expect(signalr.updateGameSettings).toHaveBeenCalledWith({
      ...settings(),
      promptTimer: { enabled: true, durationSeconds: 600 },
    });
  });
});
