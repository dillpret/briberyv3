import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SignalrService } from '../../core/signalr.service';

import { Landing } from './landing';

describe('Landing', () => {
  let component: Landing;
  let fixture: ComponentFixture<Landing>;
  let router: Pick<Router, 'navigate'>;
  let signalr: Pick<SignalrService, 'createGame'>;

  beforeEach(async () => {
    localStorage.clear();
    router = {
      navigate: vi.fn(),
    };
    signalr = {
      createGame: vi.fn().mockResolvedValue('ab12'),
    };

    await TestBed.configureTestingModule({
      imports: [Landing],
      providers: [
        { provide: Router, useValue: router },
        { provide: SignalrService, useValue: signalr },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Landing);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('normalizes game codes by trimming and uppercasing', () => {
    expect(component.normalizeGameId(' ab12 ')).toBe('AB12');
  });

  it('does not navigate when the name or game code is blank', () => {
    component.name = 'Player 1';
    component.gameId = '   ';
    component.join();

    component.name = '   ';
    component.gameId = 'AB12';
    component.join();

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('stores trimmed player details and routes to the normalized game', () => {
    component.name = ' Player 1 ';
    component.gameId = ' ab12 ';

    component.join();

    expect(localStorage.getItem('playerName')).toBe('Player 1');
    expect(localStorage.getItem('gameId')).toBe('AB12');
    expect(router.navigate).toHaveBeenCalledWith(['/game', 'AB12']);
  });

  it('creates a game, stores the returned code, and joins it', async () => {
    component.name = 'Player 1';

    await component.createGame();

    expect(signalr.createGame).toHaveBeenCalled();
    expect(localStorage.getItem('gameId')).toBe('AB12');
    expect(router.navigate).toHaveBeenCalledWith(['/game', 'AB12']);
  });

  it('renders subtle build metadata', () => {
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('local build local');
  });
});
