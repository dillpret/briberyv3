import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { HelpModalService } from './help-modal.service';
import { HelpOverlay } from './help-overlay';

interface InstructionStep {
  text: string;
  image: string;
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
    { text: 'Write a prompt for other players', image: '/brand/writing.gif' },
    { text: 'Submit "bribes" according to prompts FROM other players', image: '/brand/writing.gif' },
    { text: 'See bribes sent to you and pick a winner', image: '/brand/choosing.gif' },
    { text: 'Enjoy all the winning bribes for all players that round, and award bonus points to your favourites', image: '/brand/getCoin.gif' },
    { text: 'See who is winning on the points scoreboard', image: '/brand/bribery-mascot.png' },
    { text: 'Start a new round', image: '/brand/bribery-mascot.png' },
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
    this.currentStep.set(step);
  }

  private preloadImages(sources: string[]) {
    if (typeof Image === 'undefined') return;

    for (const source of Array.from(new Set(sources))) {
      const image = new Image();
      image.src = source;
    }
  }
}
