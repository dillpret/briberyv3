import { CommonModule } from '@angular/common';
import { Component, HostListener, signal } from '@angular/core';
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
    { image: '/instructions/overview.webp', label: 'Bribery: ask your friends for competing bribes, then pick your favourite answer. Free, no app required, any phone or PC, 3-100+ players.' },
    { image: '/instructions/ask.webp', label: 'Ask for something. Submit a prompt describing what you want other players to send you. Be as specific or silly as you want.' },
    { image: '/instructions/answer.webp', label: 'Answer prompts. You will get at least two prompts from other players. Send a bribe, your answer, for each one.' },
    { image: '/instructions/choose.webp', label: 'Pick your favourite. Your prompt comes back with anonymous bribes. Choose the one you like most. The winner gets points.' },
    { image: '/instructions/winners.webp', label: 'Browse winners. Browse the winning bribes from everyone, give bonus coins to your favourites, then see the scores and start the next round.' },
  ];
  private swipe: { pointerId: number; x: number; y: number } | null = null;

  constructor(private helpModal: HelpModalService) {}

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

  advanceOrClose() {
    if (this.currentStep() === this.steps.length - 1) this.close();
    else this.nextStep();
  }

  startSwipe(event: PointerEvent) {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    this.swipe = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  @HostListener('document:pointerdown', ['$event'])
  cancelMultiTouch(event: PointerEvent) {
    if (event.pointerType === 'touch' && !event.isPrimary) this.cancelSwipe();
  }

  finishSwipe(event: PointerEvent) {
    const swipe = this.swipe;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    this.cancelSwipe();
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    if (dx < 0) this.nextStep();
    else this.previousStep();
  }

  cancelSwipe() {
    this.swipe = null;
  }
}
