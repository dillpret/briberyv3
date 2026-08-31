import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService } from '../../state/game-state.service';
import { WaitingTips } from '../../components/waiting-tips/waiting-tips';
import { PhaseCountdown } from '../../components/phase-countdown/phase-countdown';

@Component({
  selector: 'app-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule, WaitingTips, PhaseCountdown],
  templateUrl: './prompt.html',
})
export class Prompt implements OnDestroy {
  currentRound;
  promptSubmittedCount;
  promptRequiredCount;
  isCurrentPlayerActive;
  players;
  hostPlayerId;
  canHostAdvanceWithoutOfflinePlayers;
  offlineBlockingPlayerNames;
  advanceWithoutOfflinePlayersBlockedReason;
  prompt;
  promptText = '';
  currentPlayerId;
  private promptIdeas: string[] | null = null;
  private promptIdeasRequest: Promise<string[]> | null = null;
  private lastPromptIdea: string | null = null;
  private draftVersion = 0;
  private draftTimer: number | null = null;
  private draftSave: Promise<void> = Promise.resolve();
  private hasLocalPromptEdit = false;
  private isRevisingSubmittedPrompt = false;
  changesSaved = false;

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
    private changeDetector: ChangeDetectorRef,
  ) {
    this.currentRound = this.gameState.currentRound;
    this.promptSubmittedCount = this.gameState.promptSubmittedCount;
    this.promptRequiredCount = this.gameState.promptRequiredCount;
    this.isCurrentPlayerActive = this.gameState.isCurrentPlayerActive;
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.canHostAdvanceWithoutOfflinePlayers = this.gameState.canHostAdvanceWithoutOfflinePlayers;
    this.offlineBlockingPlayerNames = this.gameState.offlineBlockingPlayerNames;
    this.advanceWithoutOfflinePlayersBlockedReason = this.gameState.advanceWithoutOfflinePlayersBlockedReason;
    this.prompt = this.gameState.prompt;
    this.currentPlayerId = this.gameState.currentPlayerId;

    effect(() => {
      this.draftVersion = Math.max(this.draftVersion, this.prompt()?.draftVersion ?? 0);
      const draftText = this.prompt()?.draftText ?? '';
      if (!this.hasSubmittedPrompt() && !this.hasLocalPromptEdit && !this.promptText && draftText) {
        this.promptText = draftText;
        this.changeDetector.detectChanges();
      }
    });

    void this.loadPromptIdeas();
  }

  ngOnDestroy(): void {
    if (this.draftTimer !== null) window.clearTimeout(this.draftTimer);
  }

  async submitPrompt() {
    const wasRevision = this.isRevisingSubmittedPrompt;
    await this.flushPromptDraft();
    await this.signalr.submitPrompt(this.promptText);
    if (wasRevision && this.hasSubmittedPrompt()) {
      this.isRevisingSubmittedPrompt = false;
      this.changesSaved = true;
    }
  }

  async editPrompt() {
    this.changesSaved = false;
    await this.signalr.editPrompt();
    if (!this.hasSubmittedPrompt()) {
      this.isRevisingSubmittedPrompt = true;
      this.hasLocalPromptEdit = true;
      this.promptText = this.prompt()?.draftText ?? this.promptText;
      this.draftVersion = Math.max(this.draftVersion, this.prompt()?.draftVersion ?? 0);
      this.changeDetector.detectChanges();
    }
  }

  async giveMeAnIdea() {
    const ideas = await this.loadPromptIdeas();
    if (ideas.length === 0) return;

    this.setPromptText(this.pickPromptIdea(ideas));
    this.changeDetector.detectChanges();
  }

  setPromptText(value: string) {
    this.hasLocalPromptEdit = true;
    this.promptText = value;
    this.schedulePromptDraftSave();
  }

  async advanceWithoutOfflinePlayers() {
    await this.signalr.advancePhaseWithoutOfflinePlayers();
  }

  hasSubmittedPrompt(): boolean {
    return this.prompt()?.hasSubmittedPrompt ?? false;
  }

  pendingPromptCount(): number {
    return Math.max(this.promptRequiredCount() - this.promptSubmittedCount(), 0);
  }

  promptProgressPercent(): number {
    const required = this.promptRequiredCount();
    return required === 0 ? 0 : Math.round((this.promptSubmittedCount() / required) * 100);
  }

  remainingCharacters(): number {
    return 200 - this.promptText.length;
  }

  submitButtonLabel(): string {
    return this.isRevisingSubmittedPrompt ? 'Resubmit prompt' : 'Submit prompt';
  }

  waitingText(): string {
    const offlineBlockers = this.offlineBlockingPlayerNames();
    const pendingPlayers = this.connectedPendingPlayers();
    const totalWaiting = pendingPlayers.length + offlineBlockers.length;

    if (this.isWaitingOnlyForOfflinePlayers()) return this.offlineBlockerText();
    if (offlineBlockers.length > 0) return `Waiting for ${totalWaiting} players.`;
    if (pendingPlayers.length === 0) return 'Waiting for the next phase.';
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

  private async loadPromptIdeas(): Promise<string[]> {
    if (this.promptIdeas !== null) return this.promptIdeas;
    if (this.promptIdeasRequest !== null) return this.promptIdeasRequest;

    this.promptIdeasRequest = this.fetchPromptIdeas();
    return this.promptIdeasRequest;
  }

  private async fetchPromptIdeas(): Promise<string[]> {
    try {
      const response = await fetch('/prompt-ideas.txt');
      if (!response.ok) {
        this.promptIdeas = [];
        this.promptIdeasRequest = null;
        return this.promptIdeas;
      }

      const text = await response.text();
      this.promptIdeas = Array.from(new Set(text
        .split(/\r?\n/)
        .map((idea) => idea.trim())
        .filter((idea) => idea.length > 0)));
      return this.promptIdeas;
    } catch {
      this.promptIdeasRequest = null;
      return [];
    }
  }

  private pickPromptIdea(ideas: string[]): string {
    const availableIdeas = ideas.length > 1
      ? ideas.filter((idea) => idea !== this.lastPromptIdea)
      : ideas;
    const randomIndex = Math.floor(Math.random() * availableIdeas.length);
    const selectedIdea = availableIdeas[randomIndex];

    this.lastPromptIdea = selectedIdea;
    return selectedIdea;
  }

  private schedulePromptDraftSave() {
    if (this.hasSubmittedPrompt()) return;
    if (this.draftTimer !== null) window.clearTimeout(this.draftTimer);

    const version = ++this.draftVersion;
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = null;
      this.queuePromptDraftSave(version);
    }, 600);
  }

  private async flushPromptDraft() {
    if (this.draftTimer !== null) {
      window.clearTimeout(this.draftTimer);
      this.draftTimer = null;
      this.queuePromptDraftSave(++this.draftVersion);
    }

    await this.draftSave;
  }

  private queuePromptDraftSave(version: number) {
    const text = this.promptText;
    this.draftSave = this.draftSave
      .catch(() => undefined)
      .then(() => this.signalr.savePromptDraft(text, version))
      .catch(() => undefined);
  }
}
