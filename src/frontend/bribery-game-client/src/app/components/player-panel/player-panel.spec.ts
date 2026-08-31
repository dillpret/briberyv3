import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameStateService, Player } from '../../state/game-state.service';
import { PlayerPanel } from './player-panel';

describe('PlayerPanel', () => {
  let fixture: ComponentFixture<PlayerPanel>;
  let component: PlayerPanel;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('playerId', 'stale-player-id');
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');

    await TestBed.configureTestingModule({
      imports: [PlayerPanel],
    }).compileComponents();

    const gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      phase: 'Voting',
      currentPlayerId: 'p2',
      hostPlayerId: 'p1',
      players: [
        player({ id: 'p3', name: 'Charlie', score: 1, phaseStatus: 'Pending', phaseStatusLabel: 'Voting' }),
        player({ id: 'p1', name: 'Alice', score: 3, phaseStatus: 'Done', phaseStatusLabel: 'Done' }),
        player({ id: 'p2', name: 'Bob', score: 2, phaseStatus: 'Waiting', phaseStatusLabel: 'Waiting', isActive: false }),
        player({ id: 'p4', name: 'Dana', connected: false, score: 0, phaseStatus: 'None', phaseStatusLabel: 'Offline' }),
      ],
    });

    fixture = TestBed.createComponent(PlayerPanel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
  });

  it('sorts players by score and then by name', () => {
    expect(component.sortedPlayers().map((candidate) => candidate.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('renders host, disconnected, next-round, and current-player badges', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('(you)');
    expect(text).toContain('Host');
    expect(text).toContain('Disconnected');
    expect(text).toContain('Next round');
  });

  it('subtly highlights the current player row', () => {
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.player-list-item'));
    const currentPlayerRow = rows
      .find((row) => row.textContent?.includes('Bob')) as HTMLElement | undefined;

    expect(currentPlayerRow?.classList.contains('!border-pine/35')).toBe(true);
    expect(currentPlayerRow?.classList.contains('!bg-pine/10')).toBe(true);
    expect(currentPlayerRow?.classList.contains('ring-2')).toBe(true);
    expect(currentPlayerRow?.textContent).toContain('(you)');
  });

  it('maps player status classes', () => {
    expect(component.statusClasses(player({ connected: false }))).toContain('text-ink/60');
    expect(component.statusClasses(player({ phaseStatus: 'Done' }))).toContain('text-pine');
    expect(component.statusClasses(player({ phaseStatus: 'Pending' }))).toContain('text-ink');
    expect(component.statusClasses(player({ phaseStatus: 'Waiting' }))).toContain('text-plum');
  });

  it('opens and closes the mobile panel state', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back');

    expect(component.isOpen()).toBe(false);

    let buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Players'))?.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(true);
    expect(pushState).toHaveBeenCalled();

    buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Close'))?.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(false);
    expect(back).toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });

  it('locks page scroll while the mobile panel is open', () => {
    component.openMobilePanel();
    fixture.detectChanges();

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('fixed');

    component.closeMobilePanel();
    fixture.detectChanges();

    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.position).toBe('');
  });

  it('closes the mobile panel when browser back is pressed', () => {
    vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back');

    component.openMobilePanel();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(true);

    window.dispatchEvent(new PopStateEvent('popstate'));
    fixture.detectChanges();

    expect(component.isOpen()).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });

  function player(overrides: Partial<Player>): Player {
    return {
      id: 'p1',
      name: 'Player',
      connected: true,
      isReady: false,
      isActive: true,
      score: 0,
      phaseStatus: 'None',
      phaseStatusLabel: 'None',
      ...overrides,
    };
  }
});
