import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { Game } from './game';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { SplashService } from '../../components/help/splash.service';

describe('Game', () => {
  let fixture: ComponentFixture<Game>;
  let component: Game;
  let signalr: Pick<SignalrService, 'start' | 'joinLobby'>;
  let router: Pick<Router, 'navigate'>;
  let splash: Pick<SplashService, 'showFirstVisitSplash'>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('playerName', 'Player 2');
    localStorage.setItem('playerId', 'p-new');

    signalr = {
      start: vi.fn().mockResolvedValue(undefined),
      joinLobby: vi.fn(),
    };
    router = {
      navigate: vi.fn(),
    };
    splash = {
      showFirstVisitSplash: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [Game],
      providers: [
        { provide: SignalrService, useValue: signalr },
        { provide: Router, useValue: router },
        { provide: SplashService, useValue: splash },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ gameId: 'test' }),
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('does not block a first-time game link with the splash', async () => {
    localStorage.removeItem('playerName');
    vi.mocked(signalr.joinLobby).mockResolvedValue(undefined);

    fixture = TestBed.createComponent(Game);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.joinState()).toBe('needs-name');
    expect(splash.showFirstVisitSplash).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Choose a name');
  });

  it('shows join failures inline so the player can choose another name', async () => {
    vi.mocked(signalr.joinLobby).mockRejectedValue(
      new Error('Another player with that name is already in the game. Please enter a different name.'),
    );

    fixture = TestBed.createComponent(Game);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.joinState()).toBe('needs-name');
    expect(component.joinError()).toBe(
      'Another player with that name is already in the game. Please enter a different name.',
    );
    expect(fixture.nativeElement.textContent).toContain('Another player with that name is already in the game.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('keeps unknown-room failures on the landing route flow', async () => {
    vi.mocked(signalr.joinLobby).mockRejectedValue(new Error('Game does not exist'));

    fixture = TestBed.createComponent(Game);
    component = fixture.componentInstance;
    await component.ngOnInit();

    expect(router.navigate).toHaveBeenCalledWith(['/'], {
      state: {
        message: 'That room no longer exists.',
      },
    });
  });

  it('routes appreciation and scoreboard phases to their screens', async () => {
    vi.mocked(signalr.joinLobby).mockResolvedValue(undefined);

    fixture = TestBed.createComponent(Game);
    component = fixture.componentInstance;
    await component.ngOnInit();

    const gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      phase: 'Appreciation',
      currentRound: 1,
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
      isCurrentPlayerActive: true,
      players: [],
      appreciation: { roundResults: [], donePlayerIds: [], doneCount: 0, requiredCount: 0, hasCurrentPlayerDone: false },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-appreciation')).toBeTruthy();

    gameState.setGameState({
      phase: 'Scoreboard',
      currentRound: 1,
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
      players: [],
      scoreboard: { roundScores: [], overallScores: [] },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-scoreboard')).toBeTruthy();
  });
});
