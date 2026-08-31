import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Scoreboard } from './scoreboard';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { WaitingTipsService } from '../../components/waiting-tips/waiting-tips.service';

describe('Scoreboard', () => {
  let fixture: ComponentFixture<Scoreboard>;
  let component: Scoreboard;
  let gameState: GameStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Scoreboard],
      providers: [{
        provide: SignalrService,
        useValue: { startNextRound: vi.fn().mockResolvedValue(undefined) },
      }, {
        provide: WaitingTipsService,
        useValue: { currentTip: signal('Scoreboard waiting tip') },
      }],
    }).compileComponents();

    gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      phase: 'Scoreboard',
      currentRound: 1,
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
      players: [
        { id: 'p1', name: 'Charlie', connected: true, isReady: false, isActive: true, score: 11, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
        { id: 'p2', name: 'Alice', connected: true, isReady: false, isActive: true, score: 16, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
        { id: 'p3', name: 'Bob', connected: true, isReady: false, isActive: true, score: 5, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
      ],
      scoreboard: {
        roundScores: [
          score({ playerId: 'p1', playerName: 'Charlie', chosenBribeCount: 2, chosenBribePoints: 10, bonusCoinPoints: 1, totalRoundPoints: 11, cumulativeScore: 11 }),
          score({ playerId: 'p2', playerName: 'Alice', chosenBribeCount: 3, chosenBribePoints: 15, bonusCoinPoints: 1, totalRoundPoints: 16, cumulativeScore: 16 }),
          score({ playerId: 'p3', playerName: 'Bob', chosenBribeCount: 1, chosenBribePoints: 5, bonusCoinPoints: 0, totalRoundPoints: 5, cumulativeScore: 5 }),
        ],
        overallScores: [
          score({ playerId: 'p1', playerName: 'Charlie', cumulativeScore: 11 }),
          score({ playerId: 'p2', playerName: 'Alice', cumulativeScore: 16 }),
          score({ playerId: 'p3', playerName: 'Bob', cumulativeScore: 5 }),
        ],
      },
    });

    fixture = TestBed.createComponent(Scoreboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('sorts round scores and highlights the top three ranks', () => {
    expect(component.sortedRoundScores().map((score) => score.playerName)).toEqual(['Alice', 'Charlie', 'Bob']);
    expect(fixture.nativeElement.textContent).toContain('Gold');
    expect(fixture.nativeElement.textContent).toContain('Silver');
    expect(fixture.nativeElement.textContent).toContain('Bronze');
    expect(fixture.nativeElement.textContent).toContain('2 chosen bribes + 1 bonus coin');
  });

  it('assigns the same medal to tied scores', () => {
    gameState.scoreboard.set({
      roundScores: [
        score({ playerId: 'p1', playerName: 'Gold Player', totalRoundPoints: 25 }),
        score({ playerId: 'p2', playerName: 'Silver A', totalRoundPoints: 23 }),
        score({ playerId: 'p3', playerName: 'Silver B', totalRoundPoints: 23 }),
        score({ playerId: 'p4', playerName: 'Bronze Player', totalRoundPoints: 22 }),
        score({ playerId: 'p5', playerName: 'No Medal', totalRoundPoints: 21 }),
      ],
      overallScores: [
        score({ playerId: 'p1', playerName: 'Gold Player', cumulativeScore: 25 }),
        score({ playerId: 'p2', playerName: 'Silver A', cumulativeScore: 23 }),
        score({ playerId: 'p3', playerName: 'Silver B', cumulativeScore: 23 }),
        score({ playerId: 'p4', playerName: 'Bronze Player', cumulativeScore: 22 }),
        score({ playerId: 'p5', playerName: 'No Medal', cumulativeScore: 21 }),
      ],
    });

    const roundScores = component.sortedRoundScores();

    expect(roundScores.map((score) => score.totalRoundPoints)).toEqual([25, 23, 23, 22, 21]);
    expect(roundScores.map((score) => component.roundRankLabel(score))).toEqual(['Gold', 'Silver', 'Silver', 'Bronze', '']);
  });

  it('hides cumulative scores during round one and shows them from round two', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Overall');

    gameState.currentRound.set(2);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Overall');
    expect(component.sortedOverallScores().map((score) => score.playerName)).toEqual(['Alice', 'Charlie', 'Bob']);
  });

  it('summarizes long scoreboards with medal positions and the current player', () => {
    gameState.currentPlayerId.set('p6');
    gameState.scoreboard.set({
      roundScores: [
        score({ playerId: 'p1', playerName: 'Alpha', totalRoundPoints: 60 }),
        score({ playerId: 'p2', playerName: 'Bravo', totalRoundPoints: 50 }),
        score({ playerId: 'p3', playerName: 'Charlie', totalRoundPoints: 40 }),
        score({ playerId: 'p4', playerName: 'Delta', totalRoundPoints: 30 }),
        score({ playerId: 'p5', playerName: 'Echo', totalRoundPoints: 20 }),
        score({ playerId: 'p6', playerName: 'Foxtrot', totalRoundPoints: 10 }),
      ],
      overallScores: [],
    });

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;

    expect(component.visibleScores().map((score) => score.playerName)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Foxtrot']);
    expect(text).toContain('Show all scores');
    expect(text).toContain('Foxtrot');
    expect(text).not.toContain('Delta');
  });

  it('shows all summarized scores when requested', () => {
    gameState.scoreboard.set({
      roundScores: [
        score({ playerId: 'p1', playerName: 'Alpha', totalRoundPoints: 60 }),
        score({ playerId: 'p2', playerName: 'Bravo', totalRoundPoints: 50 }),
        score({ playerId: 'p3', playerName: 'Charlie', totalRoundPoints: 40 }),
        score({ playerId: 'p4', playerName: 'Delta', totalRoundPoints: 30 }),
        score({ playerId: 'p5', playerName: 'Echo', totalRoundPoints: 20 }),
        score({ playerId: 'p6', playerName: 'Foxtrot', totalRoundPoints: 10 }),
      ],
      overallScores: [],
    });

    component.showAllScores();
    fixture.detectChanges();

    expect(component.visibleScores().map((score) => score.playerName)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Echo',
      'Foxtrot',
    ]);
    expect(fixture.nativeElement.textContent).not.toContain('Show all scores');
  });

  it('switches between round and overall score views', () => {
    gameState.currentRound.set(2);
    fixture.detectChanges();

    expect(component.selectedView()).toBe('round');

    component.selectView('overall');
    fixture.detectChanges();

    expect(component.selectedView()).toBe('overall');
    expect(fixture.nativeElement.textContent).toContain('16 total points');
  });

  it('disables next round when fewer than three players are connected', () => {
    gameState.players.set([
      { id: 'p1', name: 'Player 1', connected: true, isReady: false, isActive: true, score: 1, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
      { id: 'p2', name: 'Player 2', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
      { id: 'p3', name: 'Player 3', connected: false, isReady: false, isActive: true, score: 0, phaseStatus: 'Done', phaseStatusLabel: 'Done' },
    ]);
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((candidate) => candidate.textContent?.includes('Start next round')) as HTMLButtonElement;

    expect(component.canStartNextRound()).toBe(false);
    expect(button.disabled).toBe(true);
  });

  it('uses the configured prompt count for the next-round minimum', () => {
    gameState.settings.update((settings) => ({ ...settings, promptsAnsweredPerPlayer: 3 }));
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((candidate) => candidate.textContent?.includes('Start next round')) as HTMLButtonElement;

    expect(component.minimumPlayersRequired()).toBe(4);
    expect(component.canStartNextRound()).toBe(false);
    expect(component.nextRoundHint()).toBe('At least 4 connected players are needed to start the next round.');
    expect(button.disabled).toBe(true);
  });
});

function score(overrides: any) {
  return {
    playerId: 'p',
    playerName: 'Player',
    chosenBribeCount: 0,
    chosenBribePoints: 0,
    bonusCoinPoints: 0,
    totalRoundPoints: 0,
    cumulativeScore: 0,
    ...overrides,
  };
}
