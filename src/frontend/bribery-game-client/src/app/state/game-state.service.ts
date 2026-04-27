import { Injectable, signal } from '@angular/core';
import { GamePhase } from '../models/game-phase';

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  isReady: boolean;
  isActive: boolean;
  score: number;
}

export interface PromptPhaseState {
  hasSubmittedPrompt: boolean;
}

export interface SubmissionTarget {
  playerId: string;
  name: string;
  prompt: string;
}

export interface SubmissionPhaseState {
  targets: SubmissionTarget[];
  submittedTargetPlayerIds: string[];
}

export interface VotingBribe {
  bribeId: string;
  text: string;
}

export interface VotingPhaseState {
  bribes: VotingBribe[];
  selectedBribeId: string | null;
}

export interface RoundResult {
  promptOwnerPlayerId: string;
  promptOwnerName: string;
  promptText: string;
  winningBribeText: string;
  winningPlayerId: string;
  winningPlayerName: string;
}

export interface ResultsPhaseState {
  roundResults: RoundResult[];
}

@Injectable({
  providedIn: 'root',
})
export class GameStateService {
  players = signal<Player[]>([]);
  hostPlayerId = signal<string | null>(null);
  phase = signal<GamePhase>('Lobby');
  currentRound = signal(0);
  totalRounds = signal(1);
  isCurrentPlayerActive = signal(false);
  promptSubmittedCount = signal(0);
  promptRequiredCount = signal(0);
  bribeSubmittedCount = signal(0);
  bribeRequiredCount = signal(0);
  voteSubmittedCount = signal(0);
  voteRequiredCount = signal(0);
  prompt = signal<PromptPhaseState | null>(null);
  submission = signal<SubmissionPhaseState | null>(null);
  voting = signal<VotingPhaseState | null>(null);
  results = signal<ResultsPhaseState | null>(null);

  setGameState(state: any) {
    this.players.set(state.players ?? []);
    this.hostPlayerId.set(state.hostPlayerId ?? null);
    this.phase.set(state.phase);
    this.currentRound.set(state.currentRound ?? 0);
    this.totalRounds.set(state.totalRounds ?? 1);
    this.isCurrentPlayerActive.set(state.isCurrentPlayerActive ?? false);
    this.promptSubmittedCount.set(state.promptSubmittedCount ?? 0);
    this.promptRequiredCount.set(state.promptRequiredCount ?? 0);
    this.bribeSubmittedCount.set(state.bribeSubmittedCount ?? 0);
    this.bribeRequiredCount.set(state.bribeRequiredCount ?? 0);
    this.voteSubmittedCount.set(state.voteSubmittedCount ?? 0);
    this.voteRequiredCount.set(state.voteRequiredCount ?? 0);
    this.prompt.set(state.prompt ?? null);
    this.submission.set(state.submission ?? null);
    this.voting.set(state.voting ?? null);
    this.results.set(state.results ?? null);
  }
}
