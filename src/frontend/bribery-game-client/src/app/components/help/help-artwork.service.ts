import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class HelpArtworkService {
  // Retain the decoded images so opening help and paging can reuse the warm cache.
  private readonly images: HTMLImageElement[] = [];

  preload() {
    if (typeof Image === 'undefined' || this.images.length) return;

    for (const name of ['overview', 'ask', 'answer', 'choose', 'winners']) {
      const image = new Image();
      image.decoding = 'async';
      image.src = `/instructions/${name}.webp`;
      this.images.push(image);
      if (typeof image.decode === 'function') {
        void image.decode().catch(() => {
          // The displayed image can retry a failed preload normally.
        });
      }
    }
  }
}
