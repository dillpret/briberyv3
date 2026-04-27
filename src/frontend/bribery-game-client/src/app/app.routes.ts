import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import { Game } from './pages/game/game';

export const routes: Routes = [
  { path: '', component: Landing },
  { path: 'game/:gameId', component: Game },
];
