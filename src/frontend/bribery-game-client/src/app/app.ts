import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { HelpModalService, HelpModalKind } from './components/help/help-modal.service';
import { HelpModals } from './components/help/help-modals';
import { SplashService } from './components/help/splash.service';
import { ErrorMessageService } from './core/error-message.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HelpModals],
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  private routeSubscription: Subscription | null = null;
  private previousHelpModal: HelpModalKind | null = null;

  constructor(
    public errors: ErrorMessageService,
    public helpModal: HelpModalService,
    private route: ActivatedRoute,
    private splash: SplashService,
  ) {}

  ngOnInit() {
    this.routeSubscription = this.route.queryParamMap.subscribe((params) => {
      const nextHelpModal = this.normalizeHelpModal(params.get('help'));

      if (this.previousHelpModal === 'splash' && nextHelpModal !== 'splash') {
        this.splash.markSeen();
      }

      this.helpModal.syncFromQueryParam(nextHelpModal);
      this.previousHelpModal = nextHelpModal;
    });
  }

  ngOnDestroy() {
    this.routeSubscription?.unsubscribe();
  }

  openInstructions() {
    this.helpModal.open('instructions');
  }

  private normalizeHelpModal(value: string | null): HelpModalKind | null {
    return value === 'splash' || value === 'instructions' ? value : null;
  }
}
