import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ErrorMessageService {
  readonly message = signal('');

  show(message: string) {
    this.message.set(message);
  }

  clear() {
    this.message.set('');
  }
}
