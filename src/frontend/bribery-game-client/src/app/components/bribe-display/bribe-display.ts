import { CommonModule } from '@angular/common';
import { Component, Input, signal } from '@angular/core';
import { BribeKind, BribeMedia } from '../../state/game-state.service';

@Component({
  selector: 'app-bribe-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bribe-display.html',
})
export class BribeDisplay {
  @Input({ required: true }) kind: BribeKind = 'Text';
  @Input() text = '';
  @Input() media: BribeMedia | null = null;
  @Input() label = 'Bribe media';

  failed = signal(false);

  mediaAlt(): string {
    return this.media?.contentType === 'image/gif' ? 'Submitted GIF bribe' : 'Submitted image bribe';
  }
}
