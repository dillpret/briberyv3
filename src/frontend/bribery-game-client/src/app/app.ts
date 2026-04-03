import { Component, OnInit } from '@angular/core';
import { SignalrService } from './core/signalr.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  constructor(private signalr: SignalrService) {}

  ngOnInit(): void {
    this.signalr.start();
  }
}
