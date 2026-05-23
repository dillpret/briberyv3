import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ErrorMessageService } from './core/error-message.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {
  constructor(public errors: ErrorMessageService) {}
}
