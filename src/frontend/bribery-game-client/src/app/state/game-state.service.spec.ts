import { GameStateService } from './game-state.service';

describe('GameStateService snapshot ordering', () => {
  it('ignores late broadcasts without undoing submitted work or a phase transition', () => {
    const state = new GameStateService();
    const session = { roomId: 'ROOM', currentPlayerId: 'p1' };
    state.setGameState({ ...session, stateSequence: 12, phase: 'Submission', promptSubmittedCount: 4 });
    state.setGameState({ ...session, stateSequence: 11, phase: 'Prompt', promptSubmittedCount: 3 });
    expect(state.phase()).toBe('Submission');
    expect(state.promptSubmittedCount()).toBe(4);
  });

  it('accepts a newer edit and a fresh room with a lower sequence', () => {
    const state = new GameStateService();
    const session = { roomId: 'ROOM', currentPlayerId: 'p1', phase: 'Prompt' };
    state.setGameState({ ...session, stateSequence: 12, prompt: { hasSubmittedPrompt: true } });
    state.setGameState({ ...session, stateSequence: 13, prompt: { hasSubmittedPrompt: false } });
    expect(state.prompt()?.hasSubmittedPrompt).toBe(false);
    state.setGameState({ roomId: 'NEW', currentPlayerId: 'p1', stateSequence: 1, phase: 'Lobby' });
    expect(state.phase()).toBe('Lobby');
  });
});
