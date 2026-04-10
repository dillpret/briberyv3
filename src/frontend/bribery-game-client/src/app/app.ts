import { Component, OnInit } from '@angular/core';
import { SignalrService } from './core/signalr.service';
import { GameStateService } from './state/game-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {

  players;

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.players = this.gameState.players;
  }

  ngOnInit(): void {
    this.signalr.start();
  }
}
