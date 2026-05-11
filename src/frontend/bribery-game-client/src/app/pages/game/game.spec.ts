import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { Game } from './game';
import { SignalrService } from '../../core/signalr.service';

describe('Game', () => {
  let fixture: ComponentFixture<Game>;
  let component: Game;
  let signalr: Pick<SignalrService, 'start' | 'joinLobby'>;
  let router: Pick<Router, 'navigate'>;

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

    await TestBed.configureTestingModule({
      imports: [Game],
      providers: [
        { provide: SignalrService, useValue: signalr },
        { provide: Router, useValue: router },
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
});
