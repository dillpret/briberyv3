import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService, RoundScore } from '../../state/game-state.service';
import { WaitingTips } from '../../components/waiting-tips/waiting-tips';

@Component({
  selector: 'app-scoreboard',
  standalone: true,
  imports: [CommonModule, WaitingTips],
  templateUrl: './scoreboard.html',
})
export class Scoreboard {
  scoreboard;
  players;
  hostPlayerId;
  currentRound;
  currentPlayerId;

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.scoreboard = this.gameState.scoreboard;
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.currentRound = this.gameState.currentRound;
    this.currentPlayerId = this.gameState.currentPlayerId;
  }

  async startNextRound() {
    await this.signalr.startNextRound();
  }

  sortedRoundScores(): RoundScore[] {
    return this.sortScores(this.scoreboard()?.roundScores ?? [], 'totalRoundPoints');
  }

  sortedOverallScores(): RoundScore[] {
    return this.sortScores(this.scoreboard()?.overallScores ?? [], 'cumulativeScore');
  }

  isHost(): boolean {
    return this.currentPlayerId() === this.hostPlayerId();
  }

  isCurrentPlayer(score: RoundScore): boolean {
    return score.playerId === this.currentPlayerId();
  }

  canStartNextRound(): boolean {
    return this.players().filter((player) => player.connected).length >= 3;
  }

  nextRoundHint(): string {
    if (this.canStartNextRound()) return 'Start another round when everyone is ready.';
    return 'At least three connected players are needed to start the next round.';
  }

  roundRankClasses(score: RoundScore): string {
    return this.rankClasses(this.medalRank(score, this.scoreboard()?.roundScores ?? [], 'totalRoundPoints'));
  }

  overallRankClasses(score: RoundScore): string {
    return this.rankClasses(this.medalRank(score, this.scoreboard()?.overallScores ?? [], 'cumulativeScore'));
  }

  roundRankLabel(score: RoundScore): string {
    return this.rankLabel(this.medalRank(score, this.scoreboard()?.roundScores ?? [], 'totalRoundPoints'));
  }

  overallRankLabel(score: RoundScore): string {
    return this.rankLabel(this.medalRank(score, this.scoreboard()?.overallScores ?? [], 'cumulativeScore'));
  }

  private rankClasses(rank: number): string {
    if (rank === 0) return 'border-sun bg-sun/25';
    if (rank === 1) return 'border-ink/25 bg-ink/10';
    if (rank === 2) return 'border-plum/35 bg-plum/12';
    return 'border-ink/15 bg-surface/70';
  }

  private rankLabel(rank: number): string {
    if (rank === 0) return 'Gold';
    if (rank === 1) return 'Silver';
    if (rank === 2) return 'Bronze';
    return '';
  }

  breakdown(score: RoundScore): string {
    const bribeWord = score.chosenBribeCount === 1 ? 'bribe' : 'bribes';
    const coinWord = score.bonusCoinPoints === 1 ? 'coin' : 'coins';
    return `${score.chosenBribeCount} chosen ${bribeWord} + ${score.bonusCoinPoints} bonus ${coinWord}`;
  }

  private sortScores(scores: RoundScore[], scoreKey: 'totalRoundPoints' | 'cumulativeScore'): RoundScore[] {
    return [...scores].sort((a, b) =>
      b[scoreKey] - a[scoreKey] ||
      b.bonusCoinPoints - a.bonusCoinPoints ||
      a.playerName.localeCompare(b.playerName));
  }

  private medalRank(
    score: RoundScore,
    scores: RoundScore[],
    scoreKey: 'totalRoundPoints' | 'cumulativeScore',
  ): number {
    return new Set(scores
      .filter((candidate) => candidate[scoreKey] > score[scoreKey])
      .map((candidate) => candidate[scoreKey]))
      .size;
  }
}
