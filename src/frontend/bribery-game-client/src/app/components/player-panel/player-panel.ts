import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, signal } from '@angular/core';
import { ScrollLockService } from '../../core/scroll-lock.service';
import { ErrorMessageService } from '../../core/error-message.service';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService, Player } from '../../state/game-state.service';

@Component({
  selector: 'app-player-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-panel.html',
})
export class PlayerPanel implements OnDestroy {
  players;
  hostPlayerId;
  currentPlayerId;
  isOpen = signal(false);
  openPlayerMenuId = signal<string | null>(null);
  private hasMobileHistoryEntry = false;

  constructor(
    private gameState: GameStateService,
    private scrollLock: ScrollLockService,
    private signalr: SignalrService,
    private errors: ErrorMessageService,
  ) {
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.currentPlayerId = this.gameState.currentPlayerId;
  }

  ngOnDestroy() {
    if (this.isOpen()) {
      this.scrollLock.unlock();
    }
  }

  @HostListener('window:popstate')
  handleBrowserBack(): void {
    if (!this.isOpen()) return;

    this.hasMobileHistoryEntry = false;
    this.isOpen.set(false);
    this.scrollLock.unlock();
  }

  @HostListener('document:click')
  closePlayerMenu(): void {
    this.openPlayerMenuId.set(null);
  }

  @HostListener('document:keydown.escape')
  closePlayerMenuOnEscape(): void {
    this.openPlayerMenuId.set(null);
  }

  openMobilePanel(): void {
    if (this.isOpen()) return;

    this.isOpen.set(true);
    this.scrollLock.lock();
    window.history.pushState({ ...window.history.state, playerPanelOpen: true }, '', window.location.href);
    this.hasMobileHistoryEntry = true;
  }

  closeMobilePanel(): void {
    if (!this.isOpen()) return;

    this.openPlayerMenuId.set(null);
    this.isOpen.set(false);
    this.scrollLock.unlock();

    if (!this.hasMobileHistoryEntry) return;

    this.hasMobileHistoryEntry = false;
    window.history.back();
  }

  sortedPlayers(): Player[] {
    return [...this.players()].sort((a, b) => {
      return b.score - a.score || a.name.localeCompare(b.name);
    });
  }

  isCurrentPlayer(player: Player): boolean {
    return player.id === this.currentPlayerId();
  }

  canMarkOffline(player: Player): boolean {
    return this.currentPlayerId() === this.hostPlayerId() &&
      player.connected &&
      player.id !== this.hostPlayerId();
  }

  togglePlayerMenu(event: MouseEvent, playerId: string): void {
    event.stopPropagation();
    this.openPlayerMenuId.update((current) => current === playerId ? null : playerId);
  }

  async markOffline(event: MouseEvent, player: Player): Promise<void> {
    event.stopPropagation();
    this.openPlayerMenuId.set(null);

    const confirmed = window.confirm(
      `Mark ${player.name} offline? They can rejoin, and their score and submitted work will be kept.`,
    );
    if (!confirmed) return;

    try {
      await this.signalr.markPlayerOffline(player.id);
    } catch (error) {
      this.errors.show(error instanceof Error ? error.message : 'Could not mark the player offline.');
    }
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
