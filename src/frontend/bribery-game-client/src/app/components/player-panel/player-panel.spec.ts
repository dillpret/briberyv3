import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameStateService, Player } from '../../state/game-state.service';
import { PlayerPanel } from './player-panel';

describe('PlayerPanel', () => {
  let fixture: ComponentFixture<PlayerPanel>;
  let component: PlayerPanel;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('playerId', 'stale-player-id');

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

  it('sorts the current player first and then other players by name', () => {
    expect(component.sortedPlayers().map((candidate) => candidate.id)).toEqual(['p2', 'p1', 'p3', 'p4']);
  });

  it('renders host, disconnected, next-round, and current-player badges', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('(you)');
    expect(text).toContain('Host');
    expect(text).toContain('Disconnected');
    expect(text).toContain('Next round');
  });

  it('maps player status classes', () => {
    expect(component.statusClasses(player({ connected: false }))).toContain('text-ink/60');
    expect(component.statusClasses(player({ phaseStatus: 'Done' }))).toContain('text-pine');
    expect(component.statusClasses(player({ phaseStatus: 'Pending' }))).toContain('text-ink');
    expect(component.statusClasses(player({ phaseStatus: 'Waiting' }))).toContain('text-plum');
  });

  it('opens and closes the mobile panel state', () => {
    expect(component.isOpen()).toBe(false);

    let buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Players'))?.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(true);

    buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Close'))?.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(false);
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
