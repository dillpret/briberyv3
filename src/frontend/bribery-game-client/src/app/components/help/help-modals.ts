import { Component } from '@angular/core';
import { HelpModalService } from './help-modal.service';
import { InstructionsModal } from './instructions-modal';
import { SplashModal } from './splash-modal';

@Component({
  selector: 'app-help-modals',
  standalone: true,
  imports: [InstructionsModal, SplashModal],
  template: `
    @if (help.activeModal() === 'splash') {
      <app-splash-modal />
    } @else if (help.activeModal() === 'instructions') {
      <app-instructions-modal />
    }
  `,
})
export class HelpModals {
  constructor(public help: HelpModalService) {}
}
