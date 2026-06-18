import { TestBed } from '@angular/core/testing';
import { WaitingTipsService } from './waiting-tips.service';

describe('WaitingTipsService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses tips by ignoring blank lines and duplicate lines', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Not needed')));

    const service = TestBed.inject(WaitingTipsService);

    expect(service.parseTips('\nFirst tip\nFirst tip\n Second tip \n\n')).toEqual(['First tip', 'Second tip']);
  });

  it('loads tips and shows the first random tip', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('First tip\nSecond tip')));
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const service = TestBed.inject(WaitingTipsService);
    await service.loadTips();

    expect(service.currentTip()).toBe('Second tip');
  });

  it('cycles tips without repeating until the loaded set is exhausted', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('First tip\nSecond tip')));
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const service = TestBed.inject(WaitingTipsService);
    await service.loadTips();
    const firstTip = service.currentTip();

    service.nextTip();

    expect(service.currentTip()).not.toBe(firstTip);
  });

  it('hides tips when the file cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failed')));

    const service = TestBed.inject(WaitingTipsService);
    await service.loadTips();

    expect(service.currentTip()).toBeNull();
  });
});
