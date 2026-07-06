import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSession, getSession, endSession, validateSessionSettings, updateSessionSettings, getSessionSettings } from './sessionService';
import { ValidationError, NotFoundError } from '../errors';
import { closeDb } from '../db';
import * as repository from '../repository';
import { SessionSettings } from '../types';
import fs from 'fs';
import path from 'path';

describe('SessionService', () => {
  const testDbPath = path.resolve(process.cwd(), 'data', 'picklestack.db');

  afterEach(() => {
    closeDb();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    // Also remove WAL/SHM files if present
    const walPath = testDbPath + '-wal';
    const shmPath = testDbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  });

  describe('createSession', () => {
    it('should create a session with valid inputs', () => {
      const session = createSession('Morning Open Play', 4);

      expect(session.id).toBeDefined();
      expect(session.name).toBe('Morning Open Play');
      expect(session.courtCount).toBe(4);
      expect(session.status).toBe('active');
      expect(session.liveViewUrl).toMatch(/^\/live\/[0-9a-f-]+$/);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.updatedAt).toBeInstanceOf(Date);
    });

    it('should trim whitespace from session name', () => {
      const session = createSession('  Padded Name  ', 2);
      expect(session.name).toBe('Padded Name');
    });

    it('should accept a 1-character name after trim', () => {
      const session = createSession('A', 1);
      expect(session.name).toBe('A');
    });

    it('should accept a 50-character name after trim', () => {
      const name = 'A'.repeat(50);
      const session = createSession(name, 12);
      expect(session.name).toBe(name);
    });

    it('should accept court count of 1', () => {
      const session = createSession('Test', 1);
      expect(session.courtCount).toBe(1);
    });

    it('should accept court count of 12', () => {
      const session = createSession('Test', 12);
      expect(session.courtCount).toBe(12);
    });

    it('should generate unique live view URLs for different sessions', () => {
      const session1 = createSession('Session 1', 4);
      const session2 = createSession('Session 2', 4);
      expect(session1.liveViewUrl).not.toBe(session2.liveViewUrl);
    });

    it('should throw ValidationError for empty name', () => {
      expect(() => createSession('', 4)).toThrow(ValidationError);
      try {
        createSession('', 4);
      } catch (e) {
        const err = e as ValidationError;
        expect(err.fields).toContain('name');
        expect(err.message).toContain('Session name must be 1-50 characters');
      }
    });

    it('should throw ValidationError for whitespace-only name', () => {
      expect(() => createSession('   ', 4)).toThrow(ValidationError);
    });

    it('should throw ValidationError for name exceeding 50 chars after trim', () => {
      const longName = 'A'.repeat(51);
      expect(() => createSession(longName, 4)).toThrow(ValidationError);
    });

    it('should throw ValidationError for court count of 0', () => {
      expect(() => createSession('Test', 0)).toThrow(ValidationError);
      try {
        createSession('Test', 0);
      } catch (e) {
        const err = e as ValidationError;
        expect(err.fields).toContain('courtCount');
      }
    });

    it('should throw ValidationError for court count of 13', () => {
      expect(() => createSession('Test', 13)).toThrow(ValidationError);
    });

    it('should throw ValidationError for non-integer court count', () => {
      expect(() => createSession('Test', 3.5)).toThrow(ValidationError);
    });

    it('should throw ValidationError for negative court count', () => {
      expect(() => createSession('Test', -1)).toThrow(ValidationError);
    });

    it('should include both fields when both inputs are invalid', () => {
      try {
        createSession('', 0);
      } catch (e) {
        const err = e as ValidationError;
        expect(err.fields).toContain('name');
        expect(err.fields).toContain('courtCount');
      }
    });
  });

  describe('getSession', () => {
    it('should return the session when it exists', () => {
      const created = createSession('Test Session', 4);
      const retrieved = getSession(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe('Test Session');
      expect(retrieved!.courtCount).toBe(4);
      expect(retrieved!.status).toBe('active');
      expect(retrieved!.liveViewUrl).toBe(created.liveViewUrl);
      expect(retrieved!.createdAt).toBeInstanceOf(Date);
      expect(retrieved!.updatedAt).toBeInstanceOf(Date);
    });

    it('should return null when session does not exist', () => {
      const result = getSession('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('endSession', () => {
    it('should throw ValidationError when session does not exist', () => {
      expect(() => endSession('non-existent-id')).toThrow(ValidationError);
      try {
        endSession('non-existent-id');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.message).toContain('Session not found');
        expect(err.fields).toContain('sessionId');
      }
    });

    it('should throw ValidationError when session is already ended', () => {
      const session = createSession('Test', 4);
      endSession(session.id);

      expect(() => endSession(session.id)).toThrow(ValidationError);
      try {
        endSession(session.id);
      } catch (e) {
        const err = e as ValidationError;
        expect(err.message).toContain('Session has already ended');
      }
    });

    it('should mark session as ended', () => {
      const session = createSession('Test', 4);
      endSession(session.id);

      const ended = getSession(session.id);
      expect(ended!.status).toBe('ended');
    });

    it('should return summary with zero players and matches for empty session', () => {
      const session = createSession('Test', 4);
      const summary = endSession(session.id);

      expect(summary.totalPlayersCheckedIn).toBe(0);
      expect(summary.totalMatchesCompleted).toBe(0);
    });

    it('should clear all queue entries when ending session', () => {
      const session = createSession('Test', 4);

      // Add some players and queue entries
      const player1 = { id: 'p1', session_id: session.id, name: 'Alice', checked_in_at: new Date().toISOString() };
      const player2 = { id: 'p2', session_id: session.id, name: 'Bob', checked_in_at: new Date().toISOString() };
      repository.createPlayer(player1);
      repository.createPlayer(player2);
      repository.createQueueEntry({ player_id: 'p1', session_id: session.id, position: 0 });
      repository.createQueueEntry({ player_id: 'p2', session_id: session.id, position: 1 });

      endSession(session.id);

      const queue = repository.getQueueBySession(session.id);
      expect(queue).toHaveLength(0);
    });

    it('should force-complete active matches when ending session', () => {
      const session = createSession('Test', 4);

      // Add players
      for (let i = 0; i < 4; i++) {
        repository.createPlayer({
          id: `p${i}`,
          session_id: session.id,
          name: `Player ${i}`,
          checked_in_at: new Date().toISOString(),
        });
      }

      // Create an active match
      repository.createMatch({
        id: 'match1',
        session_id: session.id,
        court_number: 1,
        player_ids: JSON.stringify(['p0', 'p1', 'p2', 'p3']),
        status: 'active',
        started_at: new Date().toISOString(),
        completed_at: null,
      });

      const summary = endSession(session.id);

      // The active match should now be completed
      const match = repository.getMatchById('match1');
      expect(match!.status).toBe('completed');
      expect(match!.completed_at).not.toBeNull();

      // Summary should include the force-completed match
      expect(summary.totalMatchesCompleted).toBe(1);
      expect(summary.totalPlayersCheckedIn).toBe(4);
    });

    it('should count all players ever checked in', () => {
      const session = createSession('Test', 4);

      // Add 6 players
      for (let i = 0; i < 6; i++) {
        repository.createPlayer({
          id: `p${i}`,
          session_id: session.id,
          name: `Player ${i}`,
          checked_in_at: new Date().toISOString(),
        });
      }

      const summary = endSession(session.id);
      expect(summary.totalPlayersCheckedIn).toBe(6);
    });

    it('should count both previously completed and force-completed matches', () => {
      const session = createSession('Test', 4);

      // Add players
      for (let i = 0; i < 8; i++) {
        repository.createPlayer({
          id: `p${i}`,
          session_id: session.id,
          name: `Player ${i}`,
          checked_in_at: new Date().toISOString(),
        });
      }

      // Create a completed match
      repository.createMatch({
        id: 'match1',
        session_id: session.id,
        court_number: 1,
        player_ids: JSON.stringify(['p0', 'p1', 'p2', 'p3']),
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      // Create an active match (will be force-completed)
      repository.createMatch({
        id: 'match2',
        session_id: session.id,
        court_number: 2,
        player_ids: JSON.stringify(['p4', 'p5', 'p6', 'p7']),
        status: 'active',
        started_at: new Date().toISOString(),
        completed_at: null,
      });

      const summary = endSession(session.id);
      expect(summary.totalMatchesCompleted).toBe(2);
      expect(summary.totalPlayersCheckedIn).toBe(8);
    });

    it('should update the session updatedAt timestamp', () => {
      const session = createSession('Test', 4);
      const originalUpdatedAt = session.updatedAt;

      // Small delay to ensure timestamp difference
      endSession(session.id);

      const ended = getSession(session.id);
      expect(ended!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });
  });
});


// ============================================================
// Session Settings Tests (Task 8.2)
// ============================================================

describe('validateSessionSettings', () => {
  const validSettings: SessionSettings = {
    name: 'Test Session',
    courtCount: 4,
    courtName: 'Court A',
    sessionType: 'open_play',
    gameMode: 'doubles',
    matchingMode: 'smart',
  };

  it('accepts valid settings', () => {
    const result = validateSessionSettings(validSettings);
    expect(result).toEqual({ valid: true });
  });

  it('accepts empty courtName', () => {
    const result = validateSessionSettings({ ...validSettings, courtName: '' });
    expect(result).toEqual({ valid: true });
  });

  it('accepts name with 1 character after trim', () => {
    const result = validateSessionSettings({ ...validSettings, name: 'A' });
    expect(result).toEqual({ valid: true });
  });

  it('accepts name with 50 characters', () => {
    const result = validateSessionSettings({ ...validSettings, name: 'A'.repeat(50) });
    expect(result).toEqual({ valid: true });
  });

  it('rejects empty name', () => {
    const result = validateSessionSettings({ ...validSettings, name: '' });
    expect(result).toEqual({ valid: false, errors: { name: 'Session name must be 1-50 characters' } });
  });

  it('rejects whitespace-only name', () => {
    const result = validateSessionSettings({ ...validSettings, name: '   ' });
    expect(result).toEqual({ valid: false, errors: { name: 'Session name must be 1-50 characters' } });
  });

  it('rejects name exceeding 50 characters', () => {
    const result = validateSessionSettings({ ...validSettings, name: 'A'.repeat(51) });
    expect(result).toEqual({ valid: false, errors: { name: 'Session name must be 1-50 characters' } });
  });

  it('rejects courtCount of 0', () => {
    const result = validateSessionSettings({ ...validSettings, courtCount: 0 });
    expect(result).toEqual({ valid: false, errors: { courtCount: 'Court count must be between 1 and 12' } });
  });

  it('rejects courtCount of 13', () => {
    const result = validateSessionSettings({ ...validSettings, courtCount: 13 });
    expect(result).toEqual({ valid: false, errors: { courtCount: 'Court count must be between 1 and 12' } });
  });

  it('rejects non-integer courtCount', () => {
    const result = validateSessionSettings({ ...validSettings, courtCount: 3.5 });
    expect(result).toEqual({ valid: false, errors: { courtCount: 'Court count must be between 1 and 12' } });
  });

  it('rejects courtName exceeding 50 characters', () => {
    const result = validateSessionSettings({ ...validSettings, courtName: 'A'.repeat(51) });
    expect(result).toEqual({ valid: false, errors: { courtName: 'Court name must be 0-50 characters' } });
  });

  it('rejects invalid sessionType', () => {
    const result = validateSessionSettings({ ...validSettings, sessionType: 'invalid' as any });
    expect(result).toEqual({ valid: false, errors: { sessionType: 'Session type must be tournament or open_play' } });
  });

  it('rejects invalid gameMode', () => {
    const result = validateSessionSettings({ ...validSettings, gameMode: 'invalid' as any });
    expect(result).toEqual({ valid: false, errors: { gameMode: 'Game mode must be doubles or singles' } });
  });

  it('rejects invalid matchingMode', () => {
    const result = validateSessionSettings({ ...validSettings, matchingMode: 'invalid' as any });
    expect(result).toEqual({ valid: false, errors: { matchingMode: 'Matching mode must be queue, smart, tournament, or skill_courts' } });
  });

  it('returns multiple errors for multiple invalid fields', () => {
    const result = validateSessionSettings({
      ...validSettings,
      name: '',
      courtCount: 0,
      courtName: 'A'.repeat(51),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.courtCount).toBeDefined();
      expect(result.errors.courtName).toBeDefined();
    }
  });

  it('accepts all valid sessionType values', () => {
    expect(validateSessionSettings({ ...validSettings, sessionType: 'tournament' })).toEqual({ valid: true });
    expect(validateSessionSettings({ ...validSettings, sessionType: 'open_play' })).toEqual({ valid: true });
  });

  it('accepts all valid gameMode values', () => {
    expect(validateSessionSettings({ ...validSettings, gameMode: 'doubles' })).toEqual({ valid: true });
    expect(validateSessionSettings({ ...validSettings, gameMode: 'singles' })).toEqual({ valid: true });
  });

  it('accepts all valid matchingMode values', () => {
    expect(validateSessionSettings({ ...validSettings, matchingMode: 'queue' })).toEqual({ valid: true });
    expect(validateSessionSettings({ ...validSettings, matchingMode: 'smart' })).toEqual({ valid: true });
    expect(validateSessionSettings({ ...validSettings, matchingMode: 'tournament' })).toEqual({ valid: true });
    expect(validateSessionSettings({ ...validSettings, matchingMode: 'skill_courts' })).toEqual({ valid: true });
  });
});

describe('updateSessionSettings and getSessionSettings', () => {
  it('persists and retrieves settings correctly', () => {
    const session = createSession('Original Name', 2);

    const newSettings: SessionSettings = {
      name: 'Updated Name',
      courtCount: 6,
      courtName: 'Main Court',
      sessionType: 'tournament',
      gameMode: 'singles',
      matchingMode: 'queue',
    };

    updateSessionSettings(session.id, newSettings);
    const retrieved = getSessionSettings(session.id);

    expect(retrieved.name).toBe('Updated Name');
    expect(retrieved.courtCount).toBe(6);
    expect(retrieved.courtName).toBe('Main Court');
    expect(retrieved.sessionType).toBe('tournament');
    expect(retrieved.gameMode).toBe('singles');
    expect(retrieved.matchingMode).toBe('queue');
  });

  it('throws NotFoundError for non-existent session on update', () => {
    expect(() =>
      updateSessionSettings('non-existent', {
        name: 'Test',
        courtCount: 4,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'smart',
      })
    ).toThrow(NotFoundError);
  });

  it('throws NotFoundError for non-existent session on get', () => {
    expect(() => getSessionSettings('non-existent')).toThrow(NotFoundError);
  });

  it('throws ValidationError when updating ended session', () => {
    const session = createSession('Test', 4);
    endSession(session.id);

    expect(() =>
      updateSessionSettings(session.id, {
        name: 'Updated',
        courtCount: 4,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'smart',
      })
    ).toThrow(ValidationError);
    expect(() =>
      updateSessionSettings(session.id, {
        name: 'Updated',
        courtCount: 4,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'smart',
      })
    ).toThrow('Cannot update settings after session has ended');
  });

  it('throws ValidationError for invalid settings on update', () => {
    const session = createSession('Test', 4);

    expect(() =>
      updateSessionSettings(session.id, {
        name: '',
        courtCount: 4,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'smart',
      })
    ).toThrow(ValidationError);
  });

  it('retrieves default settings for a newly created session', () => {
    const session = createSession('New Session', 3);
    const settings = getSessionSettings(session.id);

    expect(settings.name).toBe('New Session');
    expect(settings.courtCount).toBe(3);
    expect(settings.courtName).toBe('');
    expect(settings.sessionType).toBe('open_play');
    expect(settings.gameMode).toBe('doubles');
    expect(settings.matchingMode).toBe('smart');
  });

  it('trims name when persisting settings', () => {
    const session = createSession('Test', 4);

    updateSessionSettings(session.id, {
      name: '  Trimmed Name  ',
      courtCount: 4,
      courtName: '',
      sessionType: 'open_play',
      gameMode: 'doubles',
      matchingMode: 'smart',
    });

    const retrieved = getSessionSettings(session.id);
    expect(retrieved.name).toBe('Trimmed Name');
  });
});
