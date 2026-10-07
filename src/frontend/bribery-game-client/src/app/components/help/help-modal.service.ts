import { Injectable, signal } from '@angular/core';
import { NavigationExtras, Router } from '@angular/router';

export type HelpModalKind = 'instructions';

@Injectable({
  providedIn: 'root',
})
export class HelpModalService {
  readonly activeModal = signal<HelpModalKind | null>(null);

  constructor(private router: Router) {}

  open(kind: HelpModalKind) {
    void this.router.navigate([], this.queryParams({ help: kind }));
  }

  close() {
    void this.router.navigate([], this.queryParams({ help: null }));
  }

  syncFromQueryParam(value: string | null) {
    this.activeModal.set(value === 'splash' || value === 'instructions' ? 'instructions' : null);
  }

  private queryParams(queryParams: { help: HelpModalKind | null }): NavigationExtras {
    return {
      queryParams,
      queryParamsHandling: 'merge',
    };
  }
}
