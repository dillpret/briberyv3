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
  currentPlayerId;
  isOpen = signal(false);

  constructor(private gameState: GameStateService) {
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.currentPlayerId = this.gameState.currentPlayerId;
  }

  sortedPlayers(): Player[] {
    return [...this.players()].sort((a, b) => {
      if (a.id === this.currentPlayerId()) return -1;
      if (b.id === this.currentPlayerId()) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  isCurrentPlayer(player: Player): boolean {
    return player.id === this.currentPlayerId();
  }

  statusClasses(player: Player): string {
    if (!player.connected) return 'border-ink/20 bg-ink/5 text-ink/60';

    switch (player.phaseStatus) {
      case 'Ready':
      case 'Done':
        return 'border-pine/30 bg-pine/10 text-pine';
      case 'Pending':
        return 'pending-pill text-ink';
      case 'Waiting':
        return 'border-plum/30 bg-plum/10 text-plum';
      default:
        return 'border-ink/20 bg-surface text-ink/60';
    }
  }
}
