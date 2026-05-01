import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { GameStateService, Player } from '../../state/game-state.service';

@Component({
  selector: 'app-player-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-panel.html',
})
export class PlayerPanel {
  players;
  hostPlayerId;
  playerId = localStorage.getItem('playerId') ?? '';
  isOpen = signal(false);

  constructor(private gameState: GameStateService) {
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
  }

  sortedPlayers(): Player[] {
    return [...this.players()].sort((a, b) => {
      if (a.id === this.playerId) return -1;
      if (b.id === this.playerId) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  statusClasses(player: Player): string {
    if (!player.connected) return 'border-slate-200 bg-slate-50 text-slate-500';

    switch (player.phaseStatus) {
      case 'Ready':
      case 'Done':
        return 'border-teal-200 bg-teal-50 text-teal-700';
      case 'Pending':
        return 'border-sky-200 bg-sky-50 text-sky-700';
      case 'Waiting':
        return 'border-violet-200 bg-violet-50 text-violet-700';
      default:
        return 'border-slate-200 bg-white text-slate-500';
    }
  }
}
