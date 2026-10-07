import { Component } from '@angular/core';
import { HelpModalService } from './help-modal.service';
import { InstructionsModal } from './instructions-modal';

@Component({
  selector: 'app-help-modals',
  standalone: true,
  imports: [InstructionsModal],
  template: `
    @if (help.activeModal() === 'instructions') {
      <app-instructions-modal />
    }
  `,
})
export class HelpModals {
  constructor(public help: HelpModalService) {}
}
