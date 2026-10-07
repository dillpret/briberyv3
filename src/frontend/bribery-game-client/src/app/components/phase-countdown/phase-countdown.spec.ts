import { TestBed } from '@angular/core/testing';
import { PhaseCountdown } from './phase-countdown';
import { GameStateService } from '../../state/game-state.service';

describe('PhaseCountdown', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('uses server time despite client clock skew, warns at 15 seconds, and clamps at zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T11:00:00Z'));
    const state = TestBed.inject(GameStateService);
    state.setGameState({ timerEnabled: true, phaseRevision: 1,
      serverNowUtc: '2026-01-01T12:00:00Z', phaseEndsAtUtc: '2026-01-01T12:01:00Z' });
    const fixture = TestBed.createComponent(PhaseCountdown);
    fixture.detectChanges();
    expect(fixture.componentInstance.displayTime()).toBe('1:00');
    vi.advanceTimersByTime(1000);
    expect(fixture.componentInstance.displayTime()).toBe('59s');
    vi.advanceTimersByTime(43000);
    expect(fixture.componentInstance.isWarning()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(fixture.componentInstance.isWarning()).toBe(true);
    vi.advanceTimersByTime(20000);
    expect(fixture.componentInstance.displayTime()).toBe('0s');
  });

  it('resets for a new phase and stops ticking when disabled or destroyed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const state = TestBed.inject(GameStateService);
    state.setGameState({ timerEnabled: true, phaseRevision: 1,
      serverNowUtc: '2026-01-01T12:00:00Z', phaseEndsAtUtc: '2026-01-01T12:00:10Z' });
    const fixture = TestBed.createComponent(PhaseCountdown);
    fixture.detectChanges();
    vi.advanceTimersByTime(5000);
    state.setGameState({ timerEnabled: true, phaseRevision: 2,
      serverNowUtc: '2026-01-01T12:00:05Z', phaseEndsAtUtc: '2026-01-01T12:02:05Z' });
    fixture.detectChanges();
    expect(fixture.componentInstance.displayTime()).toBe('2:00');
    expect(fixture.componentInstance.isWarning()).toBe(false);
    const clear = vi.spyOn(window, 'clearInterval');
    state.timerEnabled.set(false);
    fixture.detectChanges();
    expect(fixture.componentInstance.isVisible()).toBe(false);
    expect(fixture.componentInstance.remainingSeconds()).toBeNull();
    expect(clear).toHaveBeenCalledTimes(1);
    state.timerEnabled.set(true);
    fixture.detectChanges();
    fixture.destroy();
    expect(clear).toHaveBeenCalledTimes(2);
  });
});
