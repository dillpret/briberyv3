import { TestBed } from '@angular/core/testing';
import { InstructionsModal } from './instructions-modal';
import { HelpModalService } from './help-modal.service';

describe('Instruction touch navigation', () => {
  const close = vi.fn();
  beforeEach(() => {
    close.mockClear();
    TestBed.configureTestingModule({
      imports: [InstructionsModal],
      providers: [{ provide: HelpModalService, useValue: { close } }],
    });
  });

  function setup() {
    const fixture = TestBed.createComponent(InstructionsModal);
    fixture.detectChanges();
    const article = fixture.nativeElement.querySelector('article') as HTMLElement;
    article.setPointerCapture = vi.fn();
    function pointer(type: string, x: number, y: number, extra = {}) {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, ...extra });
      article.dispatchEvent(event);
      fixture.detectChanges();
    }
    return { modal: fixture.componentInstance, pointer };
  }

  it('advances once per swipe and stops at each boundary without closing', () => {
    const { modal, pointer } = setup();
    pointer('pointerdown', 250, 200);
    pointer('pointerup', 50, 205);
    pointer('pointerup', 50, 205);
    expect(modal.currentStep()).toBe(1);
    pointer('pointerdown', 50, 200);
    pointer('pointerup', 250, 205);
    expect(modal.currentStep()).toBe(0);
    pointer('pointerdown', 50, 200);
    pointer('pointerup', 250, 205);
    expect(modal.currentStep()).toBe(0);
    modal.setStep(4);
    pointer('pointerdown', 250, 200);
    pointer('pointerup', 50, 205);
    expect(modal.currentStep()).toBe(4);
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    ['tap', 240, 200], ['short swipe', 201, 200], ['vertical', 240, 350],
    ['diagonal', 150, 300], ['direction threshold', 100, 300],
  ])('ignores a %s gesture', (_, x, y) => {
    const { modal, pointer } = setup();
    pointer('pointerdown', 250, 200);
    pointer('pointerup', x, y);
    expect(modal.currentStep()).toBe(0);
  });

  it('accepts the minimum 50 pixel horizontal swipe', () => {
    const { modal, pointer } = setup();
    pointer('pointerdown', 250, 200);
    pointer('pointerup', 200, 200);
    expect(modal.currentStep()).toBe(1);
  });

  it.each(['pointercancel', 'lostpointercapture'])('ignores %s gestures', (type) => {
    const { modal, pointer } = setup();
    pointer('pointerdown', 250, 200);
    pointer(type, 50, 200);
    pointer('pointerup', 50, 200);
    expect(modal.currentStep()).toBe(0);
  });

  it('ignores multiple touches and mouse drags', () => {
    const { modal, pointer } = setup();
    pointer('pointerdown', 250, 200);
    pointer('pointerdown', 240, 250, { pointerId: 2, isPrimary: false });
    pointer('pointerup', 50, 200);
    expect(modal.currentStep()).toBe(0);
    pointer('pointerdown', 250, 200, { pointerType: 'mouse' });
    pointer('pointerup', 50, 200, { pointerType: 'mouse' });
    expect(modal.currentStep()).toBe(0);
  });
});
