import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Submission } from './submission';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';

describe('Submission', () => {
  let fixture: ComponentFixture<Submission>;
  let component: Submission;
  let signalr: Pick<SignalrService, 'submitBribe' | 'uploadBribeMedia' | 'advancePhaseWithoutOfflinePlayers'>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('gameId', 'TEST');
    localStorage.setItem('playerId', 'p1');

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    signalr = {
      submitBribe: vi.fn().mockResolvedValue(undefined),
      uploadBribeMedia: vi.fn().mockResolvedValue({
        mediaId: 'media-1',
        url: '/api/media/media-1',
        contentType: 'image/png',
        byteSize: 10,
      }),
      advancePhaseWithoutOfflinePlayers: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Submission],
      providers: [{ provide: SignalrService, useValue: signalr }],
    }).compileComponents();

    const gameState = TestBed.inject(GameStateService);
    gameState.setGameState({
      phase: 'Submission',
      currentPlayerId: 'p1',
      hostPlayerId: 'p1',
      isCurrentPlayerActive: true,
      bribeSubmittedCount: 0,
      bribeRequiredCount: 1,
      players: [{ id: 'p1', name: 'Player 1', connected: true, isReady: false, isActive: true, score: 0, phaseStatus: 'Pending', phaseStatusLabel: 'Needs bribes' }],
      submission: {
        targets: [{ playerId: 'p2', name: 'Player 2', prompt: 'A useful prompt' }],
        submittedTargetPlayerIds: [],
      },
    });

    fixture = TestBed.createComponent(Submission);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enables submit for a valid selected image', () => {
    const file = new File(['image'], 'bribe.png', { type: 'image/png' });

    component.chooseFile('p2', { target: { files: [file], value: '' } } as unknown as Event);
    fixture.detectChanges();

    const submitButton = submitBribeButton();
    expect(submitButton.disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('bribe.png');
  });

  it('shows an error for oversized media and does not upload it', async () => {
    const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'huge.gif', { type: 'image/gif' });

    component.chooseFile('p2', { target: { files: [file], value: '' } } as unknown as Event);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Media bribes can be up to 8 MB.');
    expect(submitBribeButton().disabled).toBe(true);

    await component.submitBribe({ playerId: 'p2', name: 'Player 2', prompt: 'A useful prompt' });

    expect(signalr.uploadBribeMedia).not.toHaveBeenCalled();
  });

  it('renders file and camera inputs with mobile-friendly attributes', () => {
    const inputs = Array.from(fixture.nativeElement.querySelectorAll('input[type="file"]')) as HTMLInputElement[];

    expect(inputs[0].accept).toContain('image/gif');
    expect(inputs[1].accept).toBe('image/*');
    expect(inputs[1].getAttribute('capture')).toBe('environment');
  });

  function submitBribeButton(): HTMLButtonElement {
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    return buttons.find((button) => button.textContent?.includes('Submit bribe'))!;
  }
});
