import { describe, it, expect } from 'vitest';
import { getOnDeckPlayerIds } from './onDeck';

describe('getOnDeckPlayerIds', () => {
  const makeQueue = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      playerId: `player-${i + 1}`,
      position: i,
    }));

  describe('queue mode + doubles', () => {
    it('returns first 4 players when queue has more than 4', () => {
      const queue = makeQueue(6);
      const result = getOnDeckPlayerIds(queue, 'doubles', 'queue');
      expect(result).toEqual(['player-1', 'player-2', 'player-3', 'player-4']);
    });

    it('returns all players when queue has fewer than 4', () => {
      const queue = makeQueue(2);
      const result = getOnDeckPlayerIds(queue, 'doubles', 'queue');
      expect(result).toEqual(['player-1', 'player-2']);
    });

    it('returns exactly 4 when queue has exactly 4', () => {
      const queue = makeQueue(4);
      const result = getOnDeckPlayerIds(queue, 'doubles', 'queue');
      expect(result).toEqual(['player-1', 'player-2', 'player-3', 'player-4']);
    });
  });

  describe('queue mode + singles', () => {
    it('returns first 2 players when queue has more than 2', () => {
      const queue = makeQueue(5);
      const result = getOnDeckPlayerIds(queue, 'singles', 'queue');
      expect(result).toEqual(['player-1', 'player-2']);
    });

    it('returns all players when queue has fewer than 2', () => {
      const queue = makeQueue(1);
      const result = getOnDeckPlayerIds(queue, 'singles', 'queue');
      expect(result).toEqual(['player-1']);
    });
  });

  describe('smart pairing mode', () => {
    it('returns first 8 players when queue has more than 8', () => {
      const queue = makeQueue(12);
      const result = getOnDeckPlayerIds(queue, 'doubles', 'smart');
      expect(result).toEqual([
        'player-1', 'player-2', 'player-3', 'player-4',
        'player-5', 'player-6', 'player-7', 'player-8',
      ]);
    });

    it('returns all players when queue has fewer than 8', () => {
      const queue = makeQueue(5);
      const result = getOnDeckPlayerIds(queue, 'doubles', 'smart');
      expect(result).toEqual([
        'player-1', 'player-2', 'player-3', 'player-4', 'player-5',
      ]);
    });

    it('returns first min(N, 8) regardless of game mode', () => {
      const queue = makeQueue(10);
      const result = getOnDeckPlayerIds(queue, 'singles', 'smart');
      expect(result).toEqual([
        'player-1', 'player-2', 'player-3', 'player-4',
        'player-5', 'player-6', 'player-7', 'player-8',
      ]);
    });
  });

  describe('tournament mode', () => {
    it('returns first 4 for doubles', () => {
      const queue = makeQueue(8);
      const result = getOnDeckPlayerIds(queue, 'doubles', 'tournament');
      expect(result).toEqual(['player-1', 'player-2', 'player-3', 'player-4']);
    });

    it('returns first 2 for singles', () => {
      const queue = makeQueue(8);
      const result = getOnDeckPlayerIds(queue, 'singles', 'tournament');
      expect(result).toEqual(['player-1', 'player-2']);
    });
  });

  describe('skill_courts mode', () => {
    it('returns first 4 for doubles', () => {
      const queue = makeQueue(6);
      const result = getOnDeckPlayerIds(queue, 'doubles', 'skill_courts');
      expect(result).toEqual(['player-1', 'player-2', 'player-3', 'player-4']);
    });

    it('returns first 2 for singles', () => {
      const queue = makeQueue(6);
      const result = getOnDeckPlayerIds(queue, 'singles', 'skill_courts');
      expect(result).toEqual(['player-1', 'player-2']);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty queue', () => {
      const result = getOnDeckPlayerIds([], 'doubles', 'queue');
      expect(result).toEqual([]);
    });

    it('returns empty array for empty queue in smart mode', () => {
      const result = getOnDeckPlayerIds([], 'singles', 'smart');
      expect(result).toEqual([]);
    });

    it('preserves queue order (sorted by position)', () => {
      const queue = [
        { playerId: 'z-player', position: 0 },
        { playerId: 'a-player', position: 1 },
        { playerId: 'm-player', position: 2 },
        { playerId: 'b-player', position: 3 },
      ];
      const result = getOnDeckPlayerIds(queue, 'doubles', 'queue');
      expect(result).toEqual(['z-player', 'a-player', 'm-player', 'b-player']);
    });
  });
});
