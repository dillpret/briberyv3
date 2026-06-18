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
  @ViewChild('closeButton') closeButton?: ElementRef<HTMLButtonElement>;

  private previousFocus: Element | null = null;

  ngAfterViewInit() {
    this.previousFocus = document.activeElement;
    window.setTimeout(() => this.closeButton?.nativeElement.focus(), 0);
  }

  ngOnDestroy() {
    if (this.previousFocus instanceof HTMLElement) {
      this.previousFocus.focus();
    }
  }

  @HostListener('document:keydown.escape')
  closeFromEscape() {
    this.closeOverlay.emit();
  }
}
