import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { HelpModalService } from './help-modal.service';
import { HelpOverlay } from './help-overlay';
import { SplashService } from './splash.service';

@Component({
  selector: 'app-splash-modal',
  standalone: true,
  imports: [CommonModule, HelpOverlay],
  templateUrl: './splash-modal.html',
})
export class SplashModal {
  readonly lines = [
    'Welcome to Bribery!',
    'An online social party game for 3-100 people',
    'No installation required, each player just needs a phone or PC with an internet connection',
    'Each player has some points to award every round, and two other players will each submit something (a clever answer to a question, a joke, a funny gif, anything really!) to try and earn those points',
  ];

  constructor(
    private helpModal: HelpModalService,
    private splash: SplashService,
  ) {
    if (typeof Image !== 'undefined') {
      const logo = new Image();
      logo.src = '/brand/bribery-logo.png';
    }
  }

  close() {
    this.splash.markSeen();
    this.helpModal.close();
  }
}
