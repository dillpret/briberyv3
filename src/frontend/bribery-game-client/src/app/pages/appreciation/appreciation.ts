import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { BribeDisplay } from '../../components/bribe-display/bribe-display';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService, RoundResult } from '../../state/game-state.service';

@Component({
  selector: 'app-appreciation',
  standalone: true,
  imports: [CommonModule, BribeDisplay],
  templateUrl: './appreciation.html',
})
export class Appreciation {
  appreciation;
  players;
  currentRound;
  currentPlayerId;
  hostPlayerId;
  isCurrentPlayerActive;
  canHostAdvanceWithoutOfflinePlayers;
  offlineBlockingPlayerNames;
  advanceWithoutOfflinePlayersBlockedReason;

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.appreciation = this.gameState.appreciation;
    this.players = this.gameState.players;
    this.currentRound = this.gameState.currentRound;
    this.currentPlayerId = this.gameState.currentPlayerId;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.isCurrentPlayerActive = this.gameState.isCurrentPlayerActive;
    this.canHostAdvanceWithoutOfflinePlayers = this.gameState.canHostAdvanceWithoutOfflinePlayers;
    this.offlineBlockingPlayerNames = this.gameState.offlineBlockingPlayerNames;
    this.advanceWithoutOfflinePlayersBlockedReason = this.gameState.advanceWithoutOfflinePlayersBlockedReason;
  }

  async toggleCoin(result: RoundResult) {
    if (!result.canCurrentPlayerAwardCoin || this.appreciation()?.hasCurrentPlayerDone) return;

    await this.signalr.toggleAppreciationCoin(result.winningBribeId);
  }

  async submitDone() {
    await this.signalr.submitAppreciationDone();
  }

  async advanceWithoutOfflinePlayers() {
    await this.signalr.advancePhaseWithoutOfflinePlayers();
  }

  isHost(): boolean {
    return this.currentPlayerId() === this.hostPlayerId();
  }

  doneProgressPercent(): number {
    const required = this.appreciation()?.requiredCount ?? 0;
    const done = this.appreciation()?.doneCount ?? 0;
    return required === 0 ? 0 : Math.round((done / required) * 100);
  }

  cardClasses(result: RoundResult): string {
    if (result.currentPlayerSubmittedWinningBribe) {
      return 'border-sun bg-surface ring-4 ring-sun/30 shadow-[0_14px_28px_rgb(238_185_2_/_0.22)]';
    }

    if (result.currentPlayerSubmittedBribe) {
      return 'border-plum/45 bg-surface/95';
    }

    if (result.isCurrentPlayersPrompt) {
      return 'border-pine/35 bg-mint/20';
    }

    return '';
  }

  resultNote(result: RoundResult): string {
    if (result.currentPlayerSubmittedWinningBribe) {
      return 'Your bribe won this one. Delicious work.';
    }

    if (result.currentPlayerSubmittedBribe) {
      return `${result.winningPlayerName}'s bribe beat yours here. You can still toss them a coin.`;
    }

    if (result.isCurrentPlayersPrompt) {
      return `Your prompt, your pick: ${result.winningPlayerName}'s bribe took it.`;
    }

    return `${result.promptOwnerName} picked ${result.winningPlayerName}'s bribe.`;
  }

  coinButtonLabel(result: RoundResult): string {
    return result.hasCurrentPlayerAwardedCoin ? 'Coin given' : '+🪙';
  }

  waitingText(): string {
    const offlineBlockers = this.offlineBlockingPlayerNames();
    const pendingPlayers = this.connectedPendingPlayers();
    const totalWaiting = pendingPlayers.length + offlineBlockers.length;

    if (this.isWaitingOnlyForOfflinePlayers()) return this.offlineBlockerText();
    if (offlineBlockers.length > 0) return `Waiting for ${totalWaiting} players.`;
    if (pendingPlayers.length === 0) return 'Counting up the applause.';
    if (pendingPlayers.length === 1) return `Waiting for ${pendingPlayers[0].name}.`;
    if (pendingPlayers.length === 2) return `Waiting for ${pendingPlayers[0].name} and ${pendingPlayers[1].name}.`;
    return `Waiting for ${pendingPlayers.length} players.`;
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
