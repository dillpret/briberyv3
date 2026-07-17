import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { BribeDisplay } from '../../components/bribe-display/bribe-display';
import { WaitingTips } from '../../components/waiting-tips/waiting-tips';
import { PhaseCountdown } from '../../components/phase-countdown/phase-countdown';

@Component({
  selector: 'app-voting',
  standalone: true,
  imports: [CommonModule, BribeDisplay, WaitingTips, PhaseCountdown],
  templateUrl: './voting.html',
})
export class Voting {
  voting;
  voteSubmittedCount;
  voteRequiredCount;
  isCurrentPlayerActive;
  players;
  hostPlayerId;
  canHostAdvanceWithoutOfflinePlayers;
  offlineBlockingPlayerNames;
  advanceWithoutOfflinePlayersBlockedReason;
  selectedBribeId = signal<string | null>(null);
  currentPlayerId;
  private draftVersion = 0;
  private draftSave: Promise<void> = Promise.resolve();

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.voting = this.gameState.voting;
    this.voteSubmittedCount = this.gameState.voteSubmittedCount;
    this.voteRequiredCount = this.gameState.voteRequiredCount;
    this.isCurrentPlayerActive = this.gameState.isCurrentPlayerActive;
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.canHostAdvanceWithoutOfflinePlayers = this.gameState.canHostAdvanceWithoutOfflinePlayers;
    this.offlineBlockingPlayerNames = this.gameState.offlineBlockingPlayerNames;
    this.advanceWithoutOfflinePlayersBlockedReason = this.gameState.advanceWithoutOfflinePlayersBlockedReason;
    this.currentPlayerId = this.gameState.currentPlayerId;
  }

  currentSelection(): string | null {
    return this.voting()?.selectedBribeId ?? this.selectedBribeId() ?? this.voting()?.draftSelectedBribeId ?? null;
  }

  selectBribe(bribeId: string) {
    this.selectedBribeId.set(bribeId);
    const version = ++this.draftVersion;
    this.draftSave = this.draftSave
      .catch(() => undefined)
      .then(() => this.signalr.saveVoteDraft(bribeId, version))
      .catch((error) => console.error('Vote draft save failed:', error));
  }

  async submitVote() {
    const bribeId = this.currentSelection();
    if (!bribeId) return;

    await this.draftSave;
    await this.signalr.submitVote(bribeId);
  }

  async advanceWithoutOfflinePlayers() {
    await this.signalr.advancePhaseWithoutOfflinePlayers();
  }

  pendingVoteCount(): number {
    return Math.max(this.voteRequiredCount() - this.voteSubmittedCount(), 0);
  }

  voteProgressPercent(): number {
    const required = this.voteRequiredCount();
    return required === 0 ? 0 : Math.round((this.voteSubmittedCount() / required) * 100);
  }

  waitingText(): string {
    const offlineBlockers = this.offlineBlockingPlayerNames();
    const pendingPlayers = this.connectedPendingPlayers();
    const totalWaiting = pendingPlayers.length + offlineBlockers.length;

    if (this.isWaitingOnlyForOfflinePlayers()) return this.offlineBlockerText();
    if (offlineBlockers.length > 0) return `Waiting for ${totalWaiting} players.`;
    if (pendingPlayers.length === 0) return 'Waiting for results.';
    if (pendingPlayers.length === 1) return `Waiting for ${pendingPlayers[0].name}.`;
    if (pendingPlayers.length === 2) return `Waiting for ${pendingPlayers[0].name} and ${pendingPlayers[1].name}.`;
    return `Waiting for ${pendingPlayers.length} players.`;
  }

  isHost(): boolean {
    return this.currentPlayerId() === this.hostPlayerId();
  }

  offlineBlockerText(): string {
    const names = this.offlineBlockingPlayerNames();
    if (names.length === 0) return '';
    if (names.length === 1) return `Waiting on offline player: ${names[0]}.`;
    if (names.length === 2) return `Waiting on offline players: ${names[0]} and ${names[1]}.`;
    return `Waiting on ${names.length} offline players.`;
  }

  isWaitingOnlyForOfflinePlayers(): boolean {
    return this.offlineBlockingPlayerNames().length > 0 && this.connectedPendingPlayers().length === 0;
  }

  private connectedPendingPlayers() {
    return this.players().filter((player) => player.phaseStatus === 'Pending' && player.connected);
  }
}
