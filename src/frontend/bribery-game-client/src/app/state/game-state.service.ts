import { Injectable, signal } from '@angular/core';
import { GamePhase } from '../models/game-phase';

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  isReady: boolean;
  isActive: boolean;
  score: number;
  phaseStatus: 'None' | 'Ready' | 'Pending' | 'Done' | 'Waiting';
  phaseStatusLabel: string;
}

export interface PromptPhaseState {
  hasSubmittedPrompt: boolean;
  draftText?: string;
  completionKind?: CompletionKind | null;
  completedWhileOffline?: boolean;
}

export interface SubmissionTarget {
  playerId: string;
  name: string;
  prompt: string;
  promptCompletionKind?: CompletionKind;
  promptCompletedWhileOffline?: boolean;
  draftText?: string;
  draftMedia?: BribeMedia | null;
  submittedBribeCompletionKind?: CompletionKind | null;
  submittedBribeCompletedWhileOffline?: boolean;
}

export interface SubmissionPhaseState {
  targets: SubmissionTarget[];
  submittedTargetPlayerIds: string[];
}

export interface BribeMedia {
  mediaId: string;
  url: string;
  contentType: string;
  byteSize: number;
}

export type BribeKind = 'Text' | 'Media';
export type CompletionKind = 'PlayerSubmitted' | 'SavedDraft' | 'Fallback';

export interface VotingBribe {
  bribeId: string;
  kind: BribeKind;
  text: string;
  media: BribeMedia | null;
  completionKind?: CompletionKind;
  completedWhileOffline?: boolean;
}

export interface VotingPhaseState {
  promptText: string;
  promptCompletionKind?: CompletionKind;
  promptCompletedWhileOffline?: boolean;
  bribes: VotingBribe[];
  selectedBribeId: string | null;
  selectedVoteCompletionKind?: CompletionKind | null;
  selectedVoteCompletedWhileOffline?: boolean;
  draftSelectedBribeId?: string | null;
}

export interface PhaseTimerSettings {
  enabled: boolean;
  durationSeconds: number;
}

export interface GameSettings {
  promptTimer: PhaseTimerSettings;
  submissionTimer: PhaseTimerSettings;
  votingTimer: PhaseTimerSettings;
  appreciationTimer: PhaseTimerSettings;
}

export interface RoundResult {
  promptOwnerPlayerId: string;
  promptOwnerName: string;
  promptText: string;
  winningBribeKind: BribeKind;
  winningBribeText: string;
  winningBribeMedia: BribeMedia | null;
  winningPlayerId: string;
  winningPlayerName: string;
  winningBribeId: string;
  promptCompletionKind?: CompletionKind;
  promptCompletedWhileOffline?: boolean;
  winningBribeCompletionKind?: CompletionKind;
  winningBribeCompletedWhileOffline?: boolean;
  voteCompletionKind?: CompletionKind;
  voteCompletedWhileOffline?: boolean;
  isCurrentPlayersPrompt: boolean;
  currentPlayerSubmittedBribe: boolean;
  currentPlayerSubmittedWinningBribe: boolean;
  canCurrentPlayerAwardCoin: boolean;
  hasCurrentPlayerAwardedCoin: boolean;
  coinCount: number;
  coinDisabledReason: string | null;
}

export interface AppreciationPhaseState {
  roundResults: RoundResult[];
  donePlayerIds: string[];
  doneCount: number;
  requiredCount: number;
  hasCurrentPlayerDone: boolean;
}

export interface RoundScore {
  playerId: string;
  playerName: string;
  chosenBribeCount: number;
  chosenBribePoints: number;
  bonusCoinPoints: number;
  totalRoundPoints: number;
  cumulativeScore: number;
}

export interface ScoreboardPhaseState {
  roundScores: RoundScore[];
  overallScores: RoundScore[];
}

@Injectable({
  providedIn: 'root',
})
export class GameStateService {
  players = signal<Player[]>([]);
  currentPlayerId = signal('');
  hostPlayerId = signal<string | null>(null);
  phase = signal<GamePhase>('Lobby');
  currentRound = signal(0);
  isCurrentPlayerActive = signal(false);
  settings = signal<GameSettings>({
    promptTimer: { enabled: false, durationSeconds: 120 },
    submissionTimer: { enabled: false, durationSeconds: 300 },
    votingTimer: { enabled: false, durationSeconds: 90 },
    appreciationTimer: { enabled: false, durationSeconds: 120 },
  });
  serverNowUtc = signal<string | null>(null);
  phaseStartedAtUtc = signal<string | null>(null);
  phaseEndsAtUtc = signal<string | null>(null);
  phaseDurationSeconds = signal<number | null>(null);
  timerEnabled = signal(false);
  phaseRevision = signal(0);
  promptSubmittedCount = signal(0);
  promptRequiredCount = signal(0);
  bribeSubmittedCount = signal(0);
  bribeRequiredCount = signal(0);
  voteSubmittedCount = signal(0);
  voteRequiredCount = signal(0);
  canHostAdvanceWithoutOfflinePlayers = signal(false);
  offlineBlockingPlayerNames = signal<string[]>([]);
  advanceWithoutOfflinePlayersBlockedReason = signal<string | null>(null);
  prompt = signal<PromptPhaseState | null>(null);
  submission = signal<SubmissionPhaseState | null>(null);
  voting = signal<VotingPhaseState | null>(null);
  appreciation = signal<AppreciationPhaseState | null>(null);
  scoreboard = signal<ScoreboardPhaseState | null>(null);

  setGameState(state: any) {
    this.players.set(state.players ?? []);
    this.currentPlayerId.set(state.currentPlayerId ?? '');
    this.hostPlayerId.set(state.hostPlayerId ?? null);
    this.phase.set(state.phase);
    this.currentRound.set(state.currentRound ?? 0);
    this.isCurrentPlayerActive.set(state.isCurrentPlayerActive ?? false);
    this.settings.set(state.settings ?? this.settings());
    this.serverNowUtc.set(state.serverNowUtc ?? null);
    this.phaseStartedAtUtc.set(state.phaseStartedAtUtc ?? null);
    this.phaseEndsAtUtc.set(state.phaseEndsAtUtc ?? null);
    this.phaseDurationSeconds.set(state.phaseDurationSeconds ?? null);
    this.timerEnabled.set(state.timerEnabled ?? false);
    this.phaseRevision.set(state.phaseRevision ?? 0);
    this.promptSubmittedCount.set(state.promptSubmittedCount ?? 0);
    this.promptRequiredCount.set(state.promptRequiredCount ?? 0);
    this.bribeSubmittedCount.set(state.bribeSubmittedCount ?? 0);
    this.bribeRequiredCount.set(state.bribeRequiredCount ?? 0);
    this.voteSubmittedCount.set(state.voteSubmittedCount ?? 0);
    this.voteRequiredCount.set(state.voteRequiredCount ?? 0);
    this.canHostAdvanceWithoutOfflinePlayers.set(state.canHostAdvanceWithoutOfflinePlayers ?? false);
    this.offlineBlockingPlayerNames.set(state.offlineBlockingPlayerNames ?? []);
    this.advanceWithoutOfflinePlayersBlockedReason.set(state.advanceWithoutOfflinePlayersBlockedReason ?? null);
    this.prompt.set(state.prompt ?? null);
    this.submission.set(state.submission ?? null);
    this.voting.set(state.voting ?? null);
    this.appreciation.set(state.appreciation ?? null);
    this.scoreboard.set(state.scoreboard ?? null);
  }
}
