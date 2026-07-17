import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { HelpModalService } from './help-modal.service';
import { HelpOverlay } from './help-overlay';

interface InstructionStep {
  image: string;
  label: string;
}

@Component({
  selector: 'app-instructions-modal',
  standalone: true,
  imports: [CommonModule, HelpOverlay],
  templateUrl: './instructions-modal.html',
})
export class InstructionsModal {
  readonly currentStep = signal(0);
  readonly steps: InstructionStep[] = [
    { image: '/instructions/ins1.png', label: 'How to play, page 1' },
    { image: '/instructions/ins2.png', label: 'How to play, page 2' },
    { image: '/instructions/ins3.png', label: 'How to play, page 3' },
    { image: '/instructions/ins4.png', label: 'How to play, page 4' },
  ];

  constructor(private helpModal: HelpModalService) {
    this.preloadImages(this.steps.map((step) => step.image));
  }

  close() {
    this.helpModal.close();
  }

  previousStep() {
    this.currentStep.update((step) => Math.max(step - 1, 0));
  }

  nextStep() {
    this.currentStep.update((step) => Math.min(step + 1, this.steps.length - 1));
  }

  setStep(step: number) {
    this.currentStep.set(Math.min(Math.max(step, 0), this.steps.length - 1));
  }

  private preloadImages(sources: string[]) {
    if (typeof Image === 'undefined') return;

    for (const source of Array.from(new Set(sources))) {
      const image = new Image();
      image.src = source;
    }
  }
}
