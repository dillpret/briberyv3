import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-help-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './help-overlay.html',
})
export class HelpOverlay implements AfterViewInit, OnDestroy {
  @Input({ required: true }) title = '';
  @Input() panelClass = '';
  @Output() closeOverlay = new EventEmitter<void>();
  @ViewChild('dialogPanel') dialogPanel?: ElementRef<HTMLElement>;
  @ViewChild('closeButton') closeButton?: ElementRef<HTMLButtonElement>;

  private previousFocus: Element | null = null;
  private readonly focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  ngAfterViewInit() {
    this.previousFocus = document.activeElement;
    window.setTimeout(() => this.closeButton?.nativeElement.focus(), 0);
  }

  ngOnDestroy() {
    if (this.previousFocus instanceof HTMLElement) {
      this.previousFocus.focus();
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: Event) {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.key === 'Escape') {
      this.closeOverlay.emit();
      return;
    }

    if (keyboardEvent.key !== 'Tab') return;

    const focusableElements = this.focusableElements();
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (!this.dialogPanel?.nativeElement.contains(activeElement)) {
      event.preventDefault();
      firstElement.focus();
      return;
    }

    if (keyboardEvent.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!keyboardEvent.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  private focusableElements(): HTMLElement[] {
    return Array.from(this.dialogPanel?.nativeElement.querySelectorAll<HTMLElement>(this.focusableSelector) ?? [])
      .filter((element) => element.getAttribute('aria-hidden') !== 'true');
  }
}
