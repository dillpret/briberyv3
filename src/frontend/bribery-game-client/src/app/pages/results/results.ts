import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { GameStateService } from '../../state/game-state.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './results.html',
})
export class Results {
  players;
  results;

  constructor(private gameState: GameStateService) {
    this.players = this.gameState.players;
    this.results = this.gameState.results;
  }
}
