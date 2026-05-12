import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SignalrService } from '../../core/signalr.service';
import { GameStateService, SubmissionTarget } from '../../state/game-state.service';

@Component({
  selector: 'app-submission',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './submission.html',
})
export class Submission {
  submission;
  bribeSubmittedCount;
  bribeRequiredCount;
  isCurrentPlayerActive;
  players;
  hostPlayerId;
  canHostAdvanceWithoutOfflinePlayers;
  offlineBlockingPlayerNames;
  advanceWithoutOfflinePlayersBlockedReason;
  drafts = signal<Record<string, string>>({});
  mediaDrafts = signal<Record<string, MediaDraft>>({});
  currentPlayerId;
  gameId = localStorage.getItem('gameId') ?? '';
  readonly maxMediaBytes = 8 * 1024 * 1024;
  readonly mediaAccept = 'image/png,image/jpeg,image/gif,image/webp,image/bmp,.gif';

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
  ) {
    this.submission = this.gameState.submission;
    this.bribeSubmittedCount = this.gameState.bribeSubmittedCount;
    this.bribeRequiredCount = this.gameState.bribeRequiredCount;
    this.isCurrentPlayerActive = this.gameState.isCurrentPlayerActive;
    this.players = this.gameState.players;
    this.hostPlayerId = this.gameState.hostPlayerId;
    this.canHostAdvanceWithoutOfflinePlayers = this.gameState.canHostAdvanceWithoutOfflinePlayers;
    this.offlineBlockingPlayerNames = this.gameState.offlineBlockingPlayerNames;
    this.advanceWithoutOfflinePlayersBlockedReason = this.gameState.advanceWithoutOfflinePlayersBlockedReason;
    this.currentPlayerId = this.gameState.currentPlayerId;
  }

  hasSubmitted(targetPlayerId: string): boolean {
    return this.submission()?.submittedTargetPlayerIds.includes(targetPlayerId) ?? false;
  }

  draftFor(targetPlayerId: string): string {
    return this.drafts()[targetPlayerId] ?? '';
  }

  setDraft(targetPlayerId: string, value: string) {
    this.drafts.update((drafts) => ({
      ...drafts,
      [targetPlayerId]: value,
    }));
  }

  async submitBribe(target: SubmissionTarget) {
    const mediaDraft = this.mediaDraftFor(target.playerId);

    if (mediaDraft?.file) {
      if (mediaDraft.error) return;

      this.setMediaDraft(target.playerId, {
        ...mediaDraft,
        error: null,
        uploading: true,
      });

      try {
        const processedFile = await this.prepareMediaFile(mediaDraft.file);
        const media = await this.signalr.uploadBribeMedia(this.gameId, this.currentPlayerId(), processedFile);
        await this.signalr.submitBribe({
          targetPlayerId: target.playerId,
          media,
        });
      } catch (error) {
        this.setMediaDraft(target.playerId, {
          ...mediaDraft,
          error: error instanceof Error ? error.message : 'Media upload failed',
          uploading: false,
        });
      }

      return;
    }

    await this.signalr.submitBribe({
      targetPlayerId: target.playerId,
      text: this.draftFor(target.playerId),
    });
  }

  async advanceWithoutOfflinePlayers() {
    await this.signalr.advancePhaseWithoutOfflinePlayers();
  }

  pendingBribeCount(): number {
    return Math.max(this.bribeRequiredCount() - this.bribeSubmittedCount(), 0);
  }

  bribeProgressPercent(): number {
    const required = this.bribeRequiredCount();
    return required === 0 ? 0 : Math.round((this.bribeSubmittedCount() / required) * 100);
  }

  remainingCharacters(targetPlayerId: string): number {
    return 500 - this.draftFor(targetPlayerId).length;
  }

  mediaDraftFor(targetPlayerId: string): MediaDraft | null {
    return this.mediaDrafts()[targetPlayerId] ?? null;
  }

  hasContent(targetPlayerId: string): boolean {
    return !!this.draftFor(targetPlayerId).trim() || !!this.mediaDraftFor(targetPlayerId)?.file;
  }

  canSubmit(targetPlayerId: string): boolean {
    const mediaDraft = this.mediaDraftFor(targetPlayerId);
    return this.hasContent(targetPlayerId) && !mediaDraft?.error && !mediaDraft?.uploading;
  }

  chooseFile(targetPlayerId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.selectMedia(targetPlayerId, file);
    input.value = '';
  }

  handlePaste(targetPlayerId: string, event: ClipboardEvent) {
    const file = this.extractImageFile(event.clipboardData);

    if (file) {
      event.preventDefault();
      this.selectMedia(targetPlayerId, file);
    }
  }

  handleBeforeInput(targetPlayerId: string, event: Event) {
    const inputEvent = event as InputEvent;
    const file = this.extractImageFile(inputEvent.dataTransfer);

    if (file) {
      event.preventDefault();
      this.selectMedia(targetPlayerId, file);
    }
  }

  handleDrop(targetPlayerId: string, event: DragEvent) {
    event.preventDefault();
    const file = this.extractImageFile(event.dataTransfer);

    if (file) this.selectMedia(targetPlayerId, file);
  }

  clearMedia(targetPlayerId: string) {
    const existing = this.mediaDraftFor(targetPlayerId);
    if (existing?.previewUrl) URL.revokeObjectURL(existing.previewUrl);

    this.mediaDrafts.update((drafts) => {
      const next = { ...drafts };
      delete next[targetPlayerId];
      return next;
    });
  }

  formatBytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  waitingText(): string {
    const offlineBlockers = this.offlineBlockingPlayerNames();
    if (offlineBlockers.length === 1) return `Waiting on ${offlineBlockers[0]}, who is offline.`;
    if (offlineBlockers.length === 2) return `Waiting on ${offlineBlockers[0]} and ${offlineBlockers[1]}, who are offline.`;
    if (offlineBlockers.length > 2) return `Waiting on ${offlineBlockers.length} offline players.`;

    const pendingPlayers = this.players().filter((player) => player.phaseStatus === 'Pending' && player.connected);
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

  private selectMedia(targetPlayerId: string, file: File) {
    const error = this.validateMedia(file);
    const existing = this.mediaDraftFor(targetPlayerId);
    if (existing?.previewUrl) URL.revokeObjectURL(existing.previewUrl);
    this.setDraft(targetPlayerId, '');

    this.setMediaDraft(targetPlayerId, {
      file,
      previewUrl: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '',
      error,
      uploading: false,
    });
  }

  private setMediaDraft(targetPlayerId: string, draft: MediaDraft) {
    this.mediaDrafts.update((drafts) => ({
      ...drafts,
      [targetPlayerId]: draft,
    }));
  }

  private validateMedia(file: File): string | null {
    if (!this.isSupportedMediaFile(file))
      return 'Choose a PNG, JPG, GIF, WebP, or BMP image.';

    if (file.size > this.maxMediaBytes)
      return 'Media bribes can be up to 8 MB.';

    return null;
  }

  private isSupportedMediaType(contentType: string): boolean {
    return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'].includes(contentType.toLowerCase());
  }

  private isSupportedMediaFile(file: File): boolean {
    return this.isSupportedMediaType(file.type) || (!file.type && !!this.inferImageContentType(file.name));
  }

  private extractImageFile(dataTransfer: DataTransfer | null | undefined): File | null {
    const itemFile = Array.from(dataTransfer?.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .find((file): file is File => !!file && this.isImageFile(file));

    if (itemFile) return itemFile;

    return Array.from(dataTransfer?.files ?? [])
      .find((file) => this.isImageFile(file)) ?? null;
  }

  private isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
  }

  private async prepareMediaFile(file: File): Promise<File> {
    const normalizedFile = this.normalizeMediaFile(file);
    if (normalizedFile.type === 'image/gif') return normalizedFile;
    if (typeof Image === 'undefined') return normalizedFile;

    return await this.compressStaticImage(normalizedFile);
  }

  private normalizeMediaFile(file: File): File {
    if (file.type) return file;

    const contentType = this.inferImageContentType(file.name);
    if (!contentType) return file;

    return new File([file], file.name, {
      type: contentType,
      lastModified: file.lastModified,
    });
  }

  private inferImageContentType(fileName: string): string | null {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'bmp':
        return 'image/bmp';
      default:
        return null;
    }
  }

  private async compressStaticImage(file: File): Promise<File> {
    const imageUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not process image'));
        img.src = imageUrl;
      });

      const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
      if (longestEdge <= 1600) return file;

      const scale = 1600 / longestEdge;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);

      const context = canvas.getContext('2d');
      if (!context) return file;

      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.82);
      });

      if (!blob || blob.size > file.size) return file;

      return new File([blob], file.name, {
        type: blob.type || file.type,
        lastModified: Date.now(),
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }
}

interface MediaDraft {
  file: File;
  previewUrl: string;
  error: string | null;
  uploading: boolean;
}
