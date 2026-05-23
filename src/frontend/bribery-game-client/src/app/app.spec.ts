import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { ErrorMessageService } from './core/error-message.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
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

  it('shows and dismisses global errors', () => {
    const fixture = TestBed.createComponent(App);
    const errors = TestBed.inject(ErrorMessageService);

    errors.show('Something went wrong');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Something went wrong');

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Something went wrong');
  });
});
