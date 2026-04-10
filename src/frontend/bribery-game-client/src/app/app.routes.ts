import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import { Lobby } from './pages/lobby/lobby';

export const routes: Routes = [
  { path: '', component: Landing },
  { path: 'game/:gameId', component: Lobby },
];
