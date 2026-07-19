import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SignalrService } from '../../core/signalr.service';
import { BribeMedia, GameStateService, SubmissionTarget } from '../../state/game-state.service';
import { WaitingTips } from '../../components/waiting-tips/waiting-tips';
import { PhaseCountdown } from '../../components/phase-countdown/phase-countdown';

@Component({
  selector: 'app-submission',
  standalone: true,
  imports: [CommonModule, FormsModule, WaitingTips, PhaseCountdown],
  templateUrl: './submission.html',
})
export class Submission implements OnDestroy {
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
  private draftVersions = new Map<string, number>();
  private draftTimers = new Map<string, number>();
  private draftSaves = new Map<string, Promise<void>>();
  private hydratedDraftTargets = new Set<string>();
  private locallyControlledDraftTargets = new Set<string>();

  constructor(
    private signalr: SignalrService,
    private gameState: GameStateService,
    private host: ElementRef<HTMLElement>,
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

    effect(() => {
      for (const target of this.submission()?.targets ?? []) {
        if (
          !this.hasSubmitted(target.playerId) &&
          target.draftText &&
          !this.locallyControlledDraftTargets.has(target.playerId)
        ) {
          this.locallyControlledDraftTargets.add(target.playerId);
          this.setDraft(target.playerId, target.draftText, false);
          this.hydrateComposerDraft(target.playerId, target.draftText);
        }

        if (!this.hasSubmitted(target.playerId) && target.draftMedia && !this.mediaDraftFor(target.playerId)) {
          this.setMediaDraft(target.playerId, {
            file: this.fileFromUploadedMedia(target.draftMedia),
            uploadedMedia: target.draftMedia,
            previewUrl: target.draftMedia.url,
            error: null,
            uploading: false,
          });
        }
      }
    });
  }

  ngOnDestroy(): void {
    for (const timer of this.draftTimers.values()) {
      window.clearTimeout(timer);
    }
  }

  hasSubmitted(targetPlayerId: string): boolean {
    return this.submission()?.submittedTargetPlayerIds.includes(targetPlayerId) ?? false;
  }

  draftFor(targetPlayerId: string): string {
    return this.drafts()[targetPlayerId] ?? '';
  }

  setDraft(targetPlayerId: string, value: string, scheduleSave = true) {
    if (scheduleSave) this.locallyControlledDraftTargets.add(targetPlayerId);

    this.drafts.update((drafts) => ({
      ...drafts,
      [targetPlayerId]: value,
    }));

    if (scheduleSave) this.scheduleBribeDraftSave(targetPlayerId);
  }

  async submitBribe(target: SubmissionTarget) {
    const mediaDraft = this.mediaDraftFor(target.playerId);

    if (mediaDraft?.uploadedMedia) {
      await this.flushBribeDraft(target.playerId);
      await this.signalr.submitBribe({
        targetPlayerId: target.playerId,
        media: mediaDraft.uploadedMedia,
      });
      return;
    }

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
        await this.saveUploadedMediaDraft(target.playerId, media);
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

    await this.flushBribeDraft(target.playerId);
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
    const mediaDraft = this.mediaDraftFor(targetPlayerId);
    return !!this.draftFor(targetPlayerId).trim() || !!mediaDraft?.file || !!mediaDraft?.uploadedMedia;
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

  handleComposerInput(targetPlayerId: string, event: Event) {
    if (this.mediaDraftFor(targetPlayerId)) return;

    const element = event.currentTarget as HTMLElement;
    const embeddedFile = this.extractEmbeddedImageFile(element);
    if (embeddedFile) {
      element.textContent = '';
      this.selectMedia(targetPlayerId, embeddedFile);
      return;
    }

    const embeddedImageUrl = this.extractEmbeddedImageUrl(element);
    if (embeddedImageUrl) {
      element.textContent = '';
      void this.selectRemoteInsertedMedia(targetPlayerId, embeddedImageUrl);
      return;
    }

    const text = this.normalizeComposerText(element.innerText);
    const nextText = text.slice(0, 500);

    if (text !== nextText) {
      element.innerText = nextText;
      this.moveCaretToEnd(element);
    }

    this.setDraft(targetPlayerId, nextText);
  }

  handlePaste(targetPlayerId: string, event: ClipboardEvent) {
    const file = this.extractImageFile(event.clipboardData);

    if (file) {
      event.preventDefault();
      event.stopPropagation();
      this.selectMedia(targetPlayerId, file);
      return;
    }

    if (this.hasRemoteImageReference(event.clipboardData)) {
      event.preventDefault();
      event.stopPropagation();
    }

    void this.selectAsyncInsertedMedia(targetPlayerId, event.clipboardData, event.currentTarget, {
      allowClipboardReadFallback: true,
    });
  }

  handleBeforeInput(targetPlayerId: string, event: Event) {
    const inputEvent = event as InputEvent;
    const file = this.extractImageFile(inputEvent.dataTransfer);

    if (file) {
      event.preventDefault();
      event.stopPropagation();
      this.selectMedia(targetPlayerId, file);
      return;
    }

    if (this.hasRemoteImageReference(inputEvent.dataTransfer)) {
      event.preventDefault();
      event.stopPropagation();
    }

    void this.selectAsyncInsertedMedia(targetPlayerId, inputEvent.dataTransfer, event.currentTarget, {
      allowClipboardReadFallback: false,
    });
  }

  handleDrop(targetPlayerId: string, event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const file = this.extractImageFile(event.dataTransfer);

    if (file) this.selectMedia(targetPlayerId, file);
  }

  clearMedia(targetPlayerId: string) {
    const existing = this.mediaDraftFor(targetPlayerId);
    if (existing?.previewUrl && !existing.uploadedMedia) URL.revokeObjectURL(existing.previewUrl);

    this.mediaDrafts.update((drafts) => {
      const next = { ...drafts };
      delete next[targetPlayerId];
      return next;
    });

    this.scheduleBribeDraftSave(targetPlayerId);
  }

  formatBytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  mediaDraftName(mediaDraft: MediaDraft): string {
    return mediaDraft.uploadedMedia ? 'Uploaded media draft' : mediaDraft.file.name;
  }

  mediaDraftBytes(mediaDraft: MediaDraft): number {
    return mediaDraft.uploadedMedia?.byteSize ?? mediaDraft.file.size;
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

  shouldShowPhaseWaitingStatus(): boolean {
    return this.isCurrentPlayerActive() && this.bribeSubmittedCount() > 0;
  }

  private connectedPendingPlayers() {
    return this.players().filter((player) => player.phaseStatus === 'Pending' && player.connected);
  }

  private selectMedia(targetPlayerId: string, file: File) {
    const error = this.validateMedia(file);
    const existing = this.mediaDraftFor(targetPlayerId);
    if (existing?.previewUrl && !existing.uploadedMedia) URL.revokeObjectURL(existing.previewUrl);
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

  private scheduleBribeDraftSave(targetPlayerId: string) {
    if (this.hasSubmitted(targetPlayerId)) return;
    const existing = this.draftTimers.get(targetPlayerId);
    if (existing !== undefined) window.clearTimeout(existing);

    const version = (this.draftVersions.get(targetPlayerId) ?? 0) + 1;
    this.draftVersions.set(targetPlayerId, version);
    this.draftTimers.set(targetPlayerId, window.setTimeout(() => {
      this.draftTimers.delete(targetPlayerId);
      this.queueBribeDraftSave(targetPlayerId, version);
    }, 600));
  }

  private async flushBribeDraft(targetPlayerId: string) {
    const timer = this.draftTimers.get(targetPlayerId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.draftTimers.delete(targetPlayerId);
      const version = (this.draftVersions.get(targetPlayerId) ?? 0) + 1;
      this.draftVersions.set(targetPlayerId, version);
      this.queueBribeDraftSave(targetPlayerId, version);
    }

    await (this.draftSaves.get(targetPlayerId) ?? Promise.resolve());
  }

  private async saveUploadedMediaDraft(targetPlayerId: string, media: BribeMedia) {
    this.setMediaDraft(targetPlayerId, {
      file: this.fileFromUploadedMedia(media),
      uploadedMedia: media,
      previewUrl: media.url,
      error: null,
      uploading: false,
    });
    this.drafts.update((drafts) => ({ ...drafts, [targetPlayerId]: '' }));
    const version = (this.draftVersions.get(targetPlayerId) ?? 0) + 1;
    this.draftVersions.set(targetPlayerId, version);
    this.queueBribeDraftSave(targetPlayerId, version);
    await this.flushBribeDraft(targetPlayerId);
  }

  private queueBribeDraftSave(targetPlayerId: string, version: number) {
    const mediaDraft = this.mediaDraftFor(targetPlayerId);
    const previous = this.draftSaves.get(targetPlayerId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.signalr.saveBribeDraft({
        targetPlayerId,
        text: mediaDraft?.uploadedMedia ? '' : this.draftFor(targetPlayerId),
        media: mediaDraft?.uploadedMedia ?? null,
        clientDraftVersion: version,
      }))
      .catch((error) => console.error('Bribe draft save failed:', error));

    this.draftSaves.set(targetPlayerId, next);
  }

  private fileFromUploadedMedia(media: BribeMedia): File {
    return new File([], 'Uploaded media draft', { type: media.contentType });
  }

  private hydrateComposerDraft(targetPlayerId: string, text: string) {
    if (this.hydratedDraftTargets.has(targetPlayerId)) return;
    this.hydratedDraftTargets.add(targetPlayerId);

    window.setTimeout(() => {
      const composer = this.host.nativeElement
        .querySelector(`[data-composer-target="${targetPlayerId}"]`);
      if (composer instanceof HTMLElement && !composer.textContent) {
        composer.textContent = text;
      }
    });
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

    const html = typeof dataTransfer?.getData === 'function' ? dataTransfer.getData('text/html') : '';
    const htmlFile = this.extractImageFileFromHtml(html);
    if (htmlFile) return htmlFile;

    return Array.from(dataTransfer?.files ?? [])
      .find((file) => this.isImageFile(file)) ?? null;
  }

  private async selectAsyncInsertedMedia(
    targetPlayerId: string,
    dataTransfer: DataTransfer | null | undefined,
    eventTarget: EventTarget | null,
    options: { allowClipboardReadFallback: boolean },
  ) {
    const file =
      await this.extractImageFileFromStringItems(dataTransfer) ??
      (options.allowClipboardReadFallback && this.shouldReadClipboardFallback(dataTransfer)
        ? await this.extractImageFileFromClipboard()
        : null);

    if (!file || this.mediaDraftFor(targetPlayerId)) return;

    if (eventTarget instanceof HTMLElement) {
      eventTarget.textContent = '';
    }

    this.selectMedia(targetPlayerId, file);
  }

  private async extractImageFileFromStringItems(dataTransfer: DataTransfer | null | undefined): Promise<File | null> {
    for (const item of Array.from(dataTransfer?.items ?? [])) {
      if (item.kind !== 'string') continue;
      if (item.type !== 'text/html' && item.type !== 'text/uri-list' && item.type !== 'text/plain') continue;

      const value = await new Promise<string>((resolve) => item.getAsString(resolve));
      const file = item.type === 'text/html'
        ? await this.extractImageFileFromHtmlAsync(value)
        : await this.fileFromImageUrl(value.trim(), { requireImageLikeUrl: true });

      if (file) return file;
    }

    if (typeof dataTransfer?.getData === 'function') {
      const htmlFile = await this.extractImageFileFromHtmlAsync(dataTransfer.getData('text/html'));
      if (htmlFile) return htmlFile;

      const uriFile = await this.fileFromImageUrl(dataTransfer.getData('text/uri-list').trim(), {
        requireImageLikeUrl: true,
      });
      if (uriFile) return uriFile;

      return await this.fileFromImageUrl(dataTransfer.getData('text/plain').trim(), {
        requireImageLikeUrl: true,
      });
    }

    return null;
  }

  private shouldReadClipboardFallback(dataTransfer: DataTransfer | null | undefined): boolean {
    if (!dataTransfer) return true;

    const types = Array.from(dataTransfer.types ?? []);
    if (types.length === 0) return true;
    if (types.some((type) => type === 'Files' || type.startsWith('image/'))) return true;

    return false;
  }

  private async extractImageFileFromClipboard(): Promise<File | null> {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') return null;

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            return new File([blob], `clipboard-image.${this.extensionForContentType(blob.type || type)}`, {
              type: blob.type || type,
            });
          }

          if (type === 'text/html') {
            const html = await (await clipboardItem.getType(type)).text();
            const file = await this.extractImageFileFromHtmlAsync(html);
            if (file) return file;
          }
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
  }

  private normalizeComposerText(text: string): string {
    return text.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  }

  private extractEmbeddedImageFile(element: HTMLElement): File | null {
    const image = element.querySelector('img');
    return image?.src ? this.fileFromDataUrl(image.src) : null;
  }

  private extractEmbeddedImageUrl(element: HTMLElement): string | null {
    const image = element.querySelector('img');
    return image?.src && this.isRemoteUrl(image.src) ? image.src : null;
  }

  private extractImageFileFromHtml(html: string): File | null {
    const dataUrl = html.match(/data:image\/(?:png|jpe?g|gif|webp|bmp);base64,[^"'\s<>]+/i)?.[0];
    if (dataUrl) return this.fileFromDataUrl(dataUrl);

    return null;
  }

  private async extractImageFileFromHtmlAsync(html: string): Promise<File | null> {
    const inlineFile = this.extractImageFileFromHtml(html);
    if (inlineFile) return inlineFile;

    const src = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
    return src ? await this.fileFromImageUrl(src, { requireImageLikeUrl: false }) : null;
  }

  private async selectRemoteInsertedMedia(targetPlayerId: string, url: string) {
    const file = await this.fileFromImageUrl(url, { requireImageLikeUrl: false });
    if (!file || this.mediaDraftFor(targetPlayerId)) return;

    this.selectMedia(targetPlayerId, file);
  }

  private async fileFromImageUrl(url: string, options: { requireImageLikeUrl: boolean }): Promise<File | null> {
    if (url.startsWith('data:')) return this.fileFromDataUrl(url);
    if (!this.isRemoteUrl(url)) return null;
    if (options.requireImageLikeUrl && !this.looksLikeSupportedImageUrl(url)) return null;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const blob = await response.blob();
      const contentType = (blob.type || response.headers.get('content-type')?.split(';')[0] || '').toLowerCase();
      if (!this.isSupportedMediaType(contentType)) return null;

      return new File([blob], `shared-image.${this.extensionForContentType(contentType)}`, {
        type: contentType,
      });
    } catch {
      return null;
    }
  }

  private hasRemoteImageReference(dataTransfer: DataTransfer | null | undefined): boolean {
    const html = typeof dataTransfer?.getData === 'function' ? dataTransfer.getData('text/html') : '';
    if (html && /<img\b[^>]*\bsrc=["']https?:\/\//i.test(html)) return true;

    const uri = typeof dataTransfer?.getData === 'function' ? dataTransfer.getData('text/uri-list').trim() : '';
    if (uri && this.looksLikeSupportedImageUrl(uri)) return true;

    const text = typeof dataTransfer?.getData === 'function' ? dataTransfer.getData('text/plain').trim() : '';
    return !!text && this.looksLikeSupportedImageUrl(text);
  }

  private isRemoteUrl(url: string): boolean {
    return /^https?:\/\//i.test(url.trim());
  }

  private looksLikeSupportedImageUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return /\.(png|jpe?g|gif|webp|bmp)$/i.test(parsedUrl.pathname);
    } catch {
      return false;
    }
  }

  private fileFromDataUrl(dataUrl: string): File | null {
    if (!dataUrl.startsWith('data:')) {
      return null;
    }

    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|gif|webp|bmp));base64,(.+)$/i);
    if (!match) return null;

    const contentType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.replace('image/', '');
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new File([bytes], `inserted-image.${extension}`, { type: contentType });
  }

  private extensionForContentType(contentType: string): string {
    switch (contentType.toLowerCase()) {
      case 'image/png':
        return 'png';
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/gif':
        return 'gif';
      case 'image/webp':
        return 'webp';
      case 'image/bmp':
        return 'bmp';
      default:
        return 'bin';
    }
  }

  private moveCaretToEnd(element: HTMLElement) {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
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
  uploadedMedia?: BribeMedia;
  previewUrl: string;
  error: string | null;
  uploading: boolean;
}
