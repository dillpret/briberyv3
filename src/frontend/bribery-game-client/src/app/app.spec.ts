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
    expect(fixture.nativeElement.textContent).toContain('Write a prompt for other players');

    const closeButton = fixture.nativeElement.querySelector('[aria-label="Close help"]') as HTMLButtonElement;
    closeButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Write a prompt for other players');
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

  it('uses stable instruction card, media, and text slots', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate([], { queryParams: { help: 'instructions' } });
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('article') as HTMLElement;
    const image = fixture.nativeElement.querySelector('article img') as HTMLImageElement;
    const text = fixture.nativeElement.querySelector('article p') as HTMLElement;

    expect(card.className).toContain('h-[19rem]');
    expect(image.getAttribute('width')).toBe('192');
    expect(image.getAttribute('height')).toBe('128');
    expect(text.className).toContain('h-28');
  });

  it('keeps keyboard focus inside the help modal', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate([], { queryParams: { help: 'instructions' } });
    fixture.detectChanges();
    await fixture.whenStable();

    const lastStepDot = fixture.nativeElement.querySelector('[aria-label="Show step 6"]') as HTMLButtonElement;
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
    expect(fixture.nativeElement.textContent).toContain('Write a prompt for other players');

    await router.navigate([], { queryParams: { help: null }, queryParamsHandling: 'merge' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Write a prompt for other players');
  });

  it('marks the splash as seen when query state leaves the splash modal', async () => {
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
});
