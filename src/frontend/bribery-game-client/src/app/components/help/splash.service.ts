import { Injectable } from '@angular/core';
import { HelpModalService } from './help-modal.service';

const SPLASH_SEEN_KEY = 'briberySplashSeen';

@Injectable({
  providedIn: 'root',
})
export class SplashService {
  constructor(private helpModal: HelpModalService) {}

  showFirstVisitSplash() {
    if (this.hasSeenSplash()) return;
    if (this.helpModal.activeModal()) return;

    this.helpModal.open('instructions');
  }

  markSeen() {
    localStorage.setItem(SPLASH_SEEN_KEY, 'true');
  }

  hasSeenSplash(): boolean {
    return localStorage.getItem(SPLASH_SEEN_KEY) === 'true';
  }
}
