import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { ErrorMessageService } from './core/error-message.service';
import { SplashService } from './components/help/splash.service';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('opens and closes the global instructions modal', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[aria-label="Open how to play instructions"]',
    ) as HTMLButtonElement;

    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('How to play');
    expect(fixture.nativeElement.querySelector('img[src="/instructions/overview.webp"]')).not.toBeNull();

    const closeButton = fixture.nativeElement.querySelector('[aria-label="Close help"]') as HTMLButtonElement;
    closeButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img[src="/instructions/overview.webp"]')).toBeNull();
  });

  it('hides the global instructions button while a help modal is open', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-label="Open how to play instructions"]')).not.toBeNull();

    const button = fixture.nativeElement.querySelector(
      '[aria-label="Open how to play instructions"]',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-label="Open how to play instructions"]')).toBeNull();
  });

  it('locks page scroll while a help modal is open and restores it when closed', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[aria-label="Open how to play instructions"]',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('fixed');

    const closeButton = fixture.nativeElement.querySelector('[aria-label="Close help"]') as HTMLButtonElement;
    closeButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.position).toBe('');
  });

  it('renders help dialogs without an internal scroll container', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate([], { queryParams: { help: 'instructions' } });
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;

    expect(dialog.className).toContain('help-dialog-panel');
    expect(dialog.className).toContain('!overflow-hidden');
    expect(dialog.className).not.toContain('overflow-auto');
  });

  it('uses stable instruction artwork sizing', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate([], { queryParams: { help: 'instructions' } });
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('article') as HTMLElement;
    const image = fixture.nativeElement.querySelector('article img') as HTMLImageElement;

    expect(card.className).toContain('overflow-hidden');
    expect(image.getAttribute('src')).toBe('/instructions/overview.webp');
    expect(image.getAttribute('width')).toBe('1024');
    expect(image.getAttribute('height')).toBe('1536');
    expect(image.className).toContain('min-h-0');
    expect(image.className).toContain('touch-none');
    expect(image.className).toContain('object-contain');
  });

  it('prevents touch and wheel scrolling behind the help modal', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate([], { queryParams: { help: 'instructions' } });
    fixture.detectChanges();

    const touchEvent = new Event('touchmove', { bubbles: true, cancelable: true });
    const wheelEvent = new Event('wheel', { bubbles: true, cancelable: true });

    document.dispatchEvent(touchEvent);
    document.dispatchEvent(wheelEvent);

    expect(touchEvent.defaultPrevented).toBe(true);
    expect(wheelEvent.defaultPrevented).toBe(true);
  });

  it('keeps keyboard focus inside the help modal', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate([], { queryParams: { help: 'instructions' } });
    fixture.detectChanges();
    await fixture.whenStable();

    const lastStepDot = fixture.nativeElement.querySelector('[aria-label="Show step 5"]') as HTMLButtonElement;
    const closeButton = fixture.nativeElement.querySelector('[aria-label="Close help"]') as HTMLButtonElement;

    lastStepDot.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(closeButton);

    closeButton.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(lastStepDot);
  });

  it('closes help when browser history returns to the prior URL state', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate([], { queryParams: { help: 'instructions' } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img[src="/instructions/overview.webp"]')).not.toBeNull();

    await router.navigate([], { queryParams: { help: null }, queryParamsHandling: 'merge' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img[src="/instructions/overview.webp"]')).toBeNull();
  });

  it('opens legacy splash links as the unified carousel and marks dismissal as seen', async () => {
    const router = TestBed.inject(Router);
    const splash = TestBed.inject(SplashService);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate([], { queryParams: { help: 'splash' } });
    fixture.detectChanges();
    expect(splash.hasSeenSplash()).toBe(false);

    await router.navigate([], { queryParams: { help: null }, queryParamsHandling: 'merge' });
    fixture.detectChanges();

    expect(splash.hasSeenSplash()).toBe(true);
  });

  it('shows and dismisses global errors', () => {
    const fixture = TestBed.createComponent(App);
    const errors = TestBed.inject(ErrorMessageService);

    errors.show('Something went wrong');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Something went wrong');

    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((candidate) => candidate.textContent?.includes('Dismiss')) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Something went wrong');
  });

  it('finishes the five-page carousel and reopens at the overview', async () => {
    const router = TestBed.inject(Router);
    const splash = TestBed.inject(SplashService);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await router.navigate([], { queryParams: { help: 'instructions' } });
    fixture.detectChanges();
    const button = (text: string) => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((element) => element.textContent?.trim() === text)!;
    expect(fixture.nativeElement.textContent).toContain('Page 1 of 5');
    expect(button('Previous').disabled).toBe(true);
    for (let step = 0; step < 4; step++) {
      button('Next').click();
      fixture.detectChanges();
    }
    expect(fixture.nativeElement.textContent).toContain('Page 5 of 5');
    const finish = button("Got it, let's play");
    expect(finish.disabled).toBe(false);
    finish.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(router.url).not.toContain('/game');
    expect(splash.hasSeenSplash()).toBe(true);
    splash.showFirstVisitSplash();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    await router.navigate([], { queryParams: { help: 'instructions' } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Page 1 of 5');
  });

  it('counts early dismissal and browser-history dismissal as seen', async () => {
    const router = TestBed.inject(Router);
    const splash = TestBed.inject(SplashService);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    splash.showFirstVisitSplash();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toContain('help=instructions');
    expect(splash.hasSeenSplash()).toBe(false);
    (fixture.nativeElement.querySelector('[aria-label="Close help"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(splash.hasSeenSplash()).toBe(true);
    localStorage.clear();
    await router.navigate([], { queryParams: { help: 'instructions' } });
    fixture.detectChanges();
    await router.navigate([], { queryParams: { help: null } });
    fixture.detectChanges();
    expect(splash.hasSeenSplash()).toBe(true);
  });
});
