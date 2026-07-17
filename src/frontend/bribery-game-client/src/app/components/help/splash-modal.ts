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
  readonly aboutImage = '/instructions/aboutScreen.png';

  constructor(
    private helpModal: HelpModalService,
    private splash: SplashService,
  ) {
    if (typeof Image !== 'undefined') {
      const image = new Image();
      image.src = this.aboutImage;
    }
  }

  close() {
    this.splash.markSeen();
    this.helpModal.close();
  }
}
