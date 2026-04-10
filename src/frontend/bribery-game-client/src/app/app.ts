import { Component, OnInit } from '@angular/core';
import { SignalrService } from './core/signalr.service';
import { GameStateService } from './state/game-state.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  players;
  name = '';
  playerId = localStorage.getItem('playerId') ?? crypto.randomUUID();

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    localStorage.setItem('playerId', this.playerId);
    this.players = this.gameState.players;
  }

  ngOnInit(): void {
    this.signalr.start();
  }

  join() {
    if (!this.name.trim()) return;
    this.signalr.joinLobby(this.playerId, this.name);
  }
}
