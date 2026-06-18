import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { ErrorMessageService } from './core/error-message.service';
import { SplashService } from './components/help/splash.service';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
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
