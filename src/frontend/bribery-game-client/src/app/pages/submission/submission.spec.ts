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

  it('submits a text bribe without uploading media', async () => {
    component.setDraft('p2', 'A very persuasive sandwich');

    await component.submitBribe({ playerId: 'p2', name: 'Player 2', prompt: 'A useful prompt' });

    expect(signalr.uploadBribeMedia).not.toHaveBeenCalled();
    expect(signalr.submitBribe).toHaveBeenCalledWith({
      targetPlayerId: 'p2',
      text: 'A very persuasive sandwich',
    });
  });

  it('captures typed text from the unified composer', () => {
    const composer = composerBox();
    composer.innerText = 'A keyboard-friendly bribe';

    composer.dispatchEvent(new Event('input', { bubbles: true }));

    expect(component.draftFor('p2')).toBe('A keyboard-friendly bribe');
  });

  it('selects pasted image media and clears existing text', () => {
    component.setDraft('p2', 'Replace me');
    const file = new File(['image'], 'pasted.gif', { type: 'image/gif' });
    const preventDefault = vi.fn();

    component.handlePaste('p2', {
      preventDefault,
      stopPropagation: vi.fn(),
      clipboardData: { files: [file] },
    } as unknown as ClipboardEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(component.draftFor('p2')).toBe('');
    expect(component.mediaDraftFor('p2')?.file).toBe(file);
  });

  it('hides the text composer after media is staged', () => {
    const file = new File(['image'], 'bribe.png', { type: 'image/png' });

    component.chooseFile('p2', { target: { files: [file], value: '' } } as unknown as Event);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[contenteditable="true"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('bribe.png');
  });

  it('selects pasted image media from clipboard items when clipboard files is empty', () => {
    const file = new File(['image'], 'keyboard.gif', { type: 'image/gif' });
    const preventDefault = vi.fn();

    component.handlePaste('p2', {
      preventDefault,
      stopPropagation: vi.fn(),
      clipboardData: {
        files: [],
        items: [fileItem(file)],
      },
    } as unknown as ClipboardEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(component.mediaDraftFor('p2')?.file).toBe(file);
  });

  it('selects inserted image media from beforeinput data transfer items', () => {
    const file = new File(['image'], 'win-menu.gif', { type: 'image/gif' });
    const preventDefault = vi.fn();

    component.handleBeforeInput('p2', {
      preventDefault,
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [],
        items: [fileItem(file)],
      },
    } as unknown as InputEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(component.mediaDraftFor('p2')?.file).toBe(file);
  });

  it('allows text and emoji beforeinput events when no image file is present', () => {
    const preventDefault = vi.fn();

    component.handleBeforeInput('p2', {
      preventDefault,
      dataTransfer: null,
    } as unknown as InputEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(component.mediaDraftFor('p2')).toBeNull();
  });

  it('detects image files with missing mime types by filename', async () => {
    const file = new File(['image'], 'keyboard.GIF', { type: '' });

    component.handlePaste('p2', {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clipboardData: { files: [file] },
    } as unknown as ClipboardEvent);

    expect(component.mediaDraftFor('p2')?.error).toBeNull();
    expect(component.mediaDraftFor('p2')?.file).toBe(file);

    await component.submitBribe({ playerId: 'p2', name: 'Player 2', prompt: 'A useful prompt' });

    const uploadedFile = vi.mocked(signalr.uploadBribeMedia).mock.calls[0][2];
    expect(uploadedFile.type).toBe('image/gif');
  });

  it('selects GIF media from inserted html data URLs', () => {
    const preventDefault = vi.fn();
    const gifDataUrl = `data:image/gif;base64,${btoa('gif')}`;

    component.handleBeforeInput('p2', {
      preventDefault,
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [],
        items: [],
        getData: (type: string) => type === 'text/html' ? `<img src="${gifDataUrl}">` : '',
      },
    } as unknown as InputEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(component.mediaDraftFor('p2')?.file.type).toBe('image/gif');
  });

  it('selects GIF media that was inserted into the composer as an image element', () => {
    const composer = composerBox();
    composer.innerHTML = `<img src="data:image/gif;base64,${btoa('gif')}">`;

    composer.dispatchEvent(new Event('input', { bubbles: true }));

    expect(component.draftFor('p2')).toBe('');
    expect(component.mediaDraftFor('p2')?.file.type).toBe('image/gif');
  });

  it('selects dropped image media', () => {
    const file = new File(['image'], 'dropped.gif', { type: 'image/gif' });

    component.handleDrop('p2', {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { files: [file] },
    } as unknown as DragEvent);

    expect(component.mediaDraftFor('p2')?.file).toBe(file);
  });

  it('clears media drafts and revokes their preview URL', () => {
    const file = new File(['image'], 'bribe.gif', { type: 'image/gif' });
    component.chooseFile('p2', { target: { files: [file], value: '' } } as unknown as Event);

    component.clearMedia('p2');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(component.mediaDraftFor('p2')).toBeNull();
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

  it('shows an error for unsupported media types', () => {
    const file = new File(['nope'], 'notes.txt', { type: 'text/plain' });

    component.chooseFile('p2', { target: { files: [file], value: '' } } as unknown as Event);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Choose a PNG, JPG, GIF, WebP, or BMP image.');
    expect(submitBribeButton().disabled).toBe(true);
  });

  it('shows upload failures without submitting the bribe', async () => {
    vi.mocked(signalr.uploadBribeMedia).mockRejectedValue(new Error('Upload service is unavailable'));
    const file = new File(['image'], 'bribe.gif', { type: 'image/gif' });

    component.chooseFile('p2', { target: { files: [file], value: '' } } as unknown as Event);
    await component.submitBribe({ playerId: 'p2', name: 'Player 2', prompt: 'A useful prompt' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Upload service is unavailable');
    expect(signalr.submitBribe).not.toHaveBeenCalled();
  });

  it('renders one media picker without splitting upload and camera into separate buttons', () => {
    const inputs = Array.from(fixture.nativeElement.querySelectorAll('input[type="file"]')) as HTMLInputElement[];

    expect(inputs).toHaveLength(1);
    expect(inputs[0].accept).toContain('image/gif');
    expect(inputs[0].hasAttribute('capture')).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Add image or photo');
    expect(fixture.nativeElement.textContent).not.toContain('Take photo');
  });

  it('explains anonymous bribes and recipient voting', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain("Each card is another player's prompt");
    expect(element.textContent).toContain('anonymous text, image, or GIF bribe');
    expect(element.textContent).toContain('Send a bribe to');
  });

  function submitBribeButton(): HTMLButtonElement {
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    return buttons.find((button) => button.textContent?.includes('Submit bribe'))!;
  }

  function composerBox(): HTMLElement {
    return fixture.nativeElement.querySelector('[contenteditable="true"]') as HTMLElement;
  }

  function fileItem(file: File): DataTransferItem {
    return {
      kind: 'file',
      type: file.type,
      getAsFile: () => file,
    } as DataTransferItem;
  }
});
