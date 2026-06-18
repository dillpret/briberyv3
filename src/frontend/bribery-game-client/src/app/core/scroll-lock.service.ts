import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ScrollLockService {
  private lockCount = 0;
  private savedBodyOverflow = '';
  private savedHtmlOverflow = '';
  private savedBodyPosition = '';
  private savedBodyTop = '';
  private savedBodyWidth = '';
  private scrollY = 0;

  lock() {
    this.lockCount += 1;
    if (this.lockCount > 1) return;

    this.scrollY = window.scrollY;
    this.savedBodyOverflow = document.body.style.overflow;
    this.savedHtmlOverflow = document.documentElement.style.overflow;
    this.savedBodyPosition = document.body.style.position;
    this.savedBodyTop = document.body.style.top;
    this.savedBodyWidth = document.body.style.width;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this.scrollY}px`;
    document.body.style.width = '100%';
  }

  unlock() {
    if (this.lockCount === 0) return;

    this.lockCount -= 1;
    if (this.lockCount > 0) return;

    document.documentElement.style.overflow = this.savedHtmlOverflow;
    document.body.style.overflow = this.savedBodyOverflow;
    document.body.style.position = this.savedBodyPosition;
    document.body.style.top = this.savedBodyTop;
    document.body.style.width = this.savedBodyWidth;

    if (!navigator.userAgent.includes('jsdom')) {
      window.scrollTo(0, this.scrollY);
    }
  }
}
