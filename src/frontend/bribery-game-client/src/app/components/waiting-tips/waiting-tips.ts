import { Component } from '@angular/core';
import { WaitingTipsService } from './waiting-tips.service';

@Component({
  selector: 'app-waiting-tips',
  standalone: true,
  templateUrl: './waiting-tips.html',
})
export class WaitingTips {
  constructor(public tips: WaitingTipsService) {}
}
