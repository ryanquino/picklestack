import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { StarRating } from '../types';
import { STAR_RATING_LABELS } from '../types';
import { getSessionJoinInfo, addPlayer, getBenchPlayers, joinQueue, getAllPlayers, createFixedPair } from '../api';

const PLAYER_STORAGE_PREFIX = 'pickld_player_';

function getPlayerStorageKey(sessionId: string): string {
  return `${PLAYER_STORAGE_PREFIX}${sessionId}`;
}

interface BenchPlayer {
  id: string;
  name: string;
}

interface AllPlayer {
  id: string;
  name: string;
  status: 'bench' | 'queue' | 'playing';
}

const STATUS_LABELS: Record<string, string> = {
  bench: 'Bench',
  queue: 'In Queue',
  playing: 'Playing',
};

function JoinSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [sessionInfo, setSessionInfo] = useState<{
    name: string;
    gameMode: string;
    playerCount: number;
    status: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [starRating, setStarRating] = useState<StarRating>(3);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [checkedIn, setCheckedIn] = useState(false);
  const [pairingWarning, setPairingWarning] = useState<string | null>(null);

  const [benchPlayers, setBenchPlayers] = useState<BenchPlayer[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const [allPlayers, setAllPlayers] = useState<AllPlayer[]>([]);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [partnerConfirm, setPartnerConfirm] = useState<AllPlayer | null>(null);
  const partnerDropdownRef = useRef<HTMLDivElement>(null);

  const fetchSessionInfo = useCallback(async () => {
    if (!sessionId) return;
    try {
      const info = await getSessionJoinInfo(sessionId);
      setSessionInfo(info);
    } catch {
      // ignore
    }
  }, [sessionId]);

  const fetchBenchPlayers = useCallback(async () => {
    if (!sessionId) return;
    try {
      const players = await getBenchPlayers(sessionId);
      setBenchPlayers(players);
    } catch {
      // ignore
    }
  }, [sessionId]);

  const fetchAllPlayers = useCallback(async () => {
    if (!sessionId) return;
    try {
      const players = await getAllPlayers(sessionId);
      setAllPlayers(players);
    } catch {
      // ignore
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setError('Invalid session link');
      setLoading(false);
      return;
    }

    // Check if already checked in (returning player)
    try {
      const stored = localStorage.getItem(getPlayerStorageKey(sessionId));
      if (stored) {
        const parsed = JSON.parse(stored) as { playerId: string; name: string };
        navigate(`/player/${sessionId}/${parsed.playerId}`, { replace: true });
        return;
      }
    } catch {
      // ignore parse errors
    }

    Promise.all([getSessionJoinInfo(sessionId), getBenchPlayers(sessionId), getAllPlayers(sessionId)])
      .then(([info, bench, all]) => {
        setSessionInfo(info);
        setBenchPlayers(bench);
        setAllPlayers(all);
        setLoading(false);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load session';
        setError(message);
        setLoading(false);
      });
  }, [sessionId, navigate]);

  // Poll for fresh data while on join page
  useEffect(() => {
    if (loading || checkedIn || error) return;
    const interval = setInterval(() => {
      fetchSessionInfo();
      fetchBenchPlayers();
      fetchAllPlayers();
    }, 5000);
    return () => clearInterval(interval);
  }, [loading, checkedIn, error, fetchSessionInfo, fetchBenchPlayers, fetchAllPlayers]);

  // Close name dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  // Close partner dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (partnerDropdownRef.current && !partnerDropdownRef.current.contains(e.target as Node)) {
        setShowPartnerDropdown(false);
      }
    }
    if (showPartnerDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPartnerDropdown]);

  const isSessionEnded = sessionInfo?.status === 'ended';

  // Filter bench players by typed name (for name autocomplete)
  const filteredBench = name.trim().length > 0
    ? benchPlayers.filter((p) =>
        p.name.toLowerCase().includes(name.trim().toLowerCase())
      )
    : benchPlayers;

  // Filter partner candidates (exclude self by name)
  const partnerCandidates = allPlayers.filter(
    (p) => !name.trim() || p.name.toLowerCase() !== name.trim().toLowerCase()
  );
  const filteredPartners = partnerSearch.trim().length > 0
    ? partnerCandidates.filter((p) =>
        p.name.toLowerCase().includes(partnerSearch.trim().toLowerCase())
      )
    : partnerCandidates;

  function handleNameChange(value: string) {
    setName(value);
    setShowDropdown(value.trim().length > 0 && benchPlayers.length > 0);
    setHighlightIndex(-1);
    // Clear partner selection if name changes to match current partner
    if (partnerId) {
      const selectedPartner = allPlayers.find((p) => p.id === partnerId);
      if (selectedPartner && selectedPartner.name.toLowerCase() === value.trim().toLowerCase()) {
        setPartnerId(null);
        setPartnerSearch('');
        setPartnerConfirm(null);
      }
    }
  }

  function handleNameFocus() {
    if (name.trim().length > 0 && benchPlayers.length > 0) {
      setShowDropdown(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || filteredBench.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < filteredBench.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : filteredBench.length - 1));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      fillBenchPlayerName(filteredBench[highlightIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }

  function fillBenchPlayerName(player: BenchPlayer) {
    setName(player.name);
    setShowDropdown(false);
    setHighlightIndex(-1);
  }

  function selectPartner(player: AllPlayer) {
    setPartnerId(player.id);
    setPartnerSearch(player.name);
    setShowPartnerDropdown(false);

    if (player.status === 'bench') {
      setPartnerConfirm(player);
    } else {
      setPartnerConfirm(null);
    }
  }

  function clearPartner() {
    setPartnerId(null);
    setPartnerSearch('');
    setPartnerConfirm(null);
  }

  function dismissPartnerConfirm() {
    setPartnerConfirm(null);
    // Keep the partner selected, just dismiss the prompt
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setSubmitError('Please enter your name');
      return;
    }
    if (trimmed.length > 30) {
      setSubmitError('Name must be 30 characters or fewer');
      return;
    }

    setSubmitting(true);

    // Check if the typed name matches a bench player — rejoin queue instead of creating new
    const benchMatch = benchPlayers.find(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (benchMatch) {
      try {
        await joinQueue(sessionId!, benchMatch.id, starRating);

        // If a partner was selected, check them in and pair
        let benchPairWarning: string | null = null;
        if (partnerId) {
          const partner = allPlayers.find((p) => p.id === partnerId);
          if (partner?.status === 'bench') {
            await joinQueue(sessionId!, partner.id);
          }
          try {
            await createFixedPair(sessionId!, benchMatch.id, partnerId);
          } catch (err) {
            benchPairWarning = err instanceof Error ? err.message : 'Pairing failed';
          }
        }

        try {
          localStorage.setItem(
            getPlayerStorageKey(sessionId!),
            JSON.stringify({ playerId: benchMatch.id, name: benchMatch.name })
          );
        } catch {
          // localStorage unavailable
        }

        setPairingWarning(benchPairWarning);
        setCheckedIn(true);
        setTimeout(() => {
          navigate(`/player/${sessionId}/${benchMatch.id}`);
        }, 1200);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join queue';
        setSubmitError(message);
        setSubmitting(false);
      }
      return;
    }

    // New player check-in
    try {
      const partner = partnerId ? allPlayers.find((p) => p.id === partnerId) : null;
      const partnerIsBench = partner?.status === 'bench';

      // If partner is on bench, check them into queue first
      if (partnerIsBench && partner) {
        await joinQueue(sessionId!, partner.id);
      }

      // Create the new player (server handles pairing if partnerId provided)
      const player = await addPlayer(sessionId!, trimmed, starRating, false, partnerId ?? undefined);

      // If server-side pairing failed, try client-side as fallback
      let pairingWarning: string | null = null;
      if (partnerId && !player.pairId) {
        if (player.pairError) {
          pairingWarning = player.pairError;
        } else {
          try {
            await createFixedPair(sessionId!, player.id, partnerId);
          } catch (err) {
            pairingWarning = err instanceof Error ? err.message : 'Pairing failed';
          }
        }
      }

      try {
        localStorage.setItem(
          getPlayerStorageKey(sessionId!),
          JSON.stringify({ playerId: player.id, name: player.name })
        );
      } catch {
        // localStorage unavailable
      }

      setCheckedIn(true);
      setTimeout(() => {
        navigate(`/player/${sessionId}/${player.id}`);
      }, 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check in';
      setSubmitError(message);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="join-page" role="status">
        <div className="join-page__card card">
          <div className="join-page__header">
            <p className="join-page__subtitle">Loading session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="join-page">
        <div className="join-page__card card">
          <div className="join-page__header">
            <div className="join-page__error-icon">❌</div>
            <h1 className="join-page__title">Unable to join</h1>
            <p className="join-page__subtitle">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (checkedIn) {
    return (
      <div className="join-page">
        <div className="join-page__card card join-page__card--success">
          <div className="join-page__header">
            <div className="join-page__success-icon">✅</div>
            <h1 className="join-page__title">You're checked in!</h1>
            <p className="join-page__subtitle">
              Welcome, <strong>{name}</strong>. Taking you to your dashboard...
            </p>
            {pairingWarning && (
              <p className="join-page__pairing-warning" role="alert">
                Pairing note: {pairingWarning}
              </p>
            )}
            <div className="join-page__spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (isSessionEnded) {
    return (
      <div className="join-page">
        <div className="join-page__card card">
          <div className="join-page__header">
            <div className="join-page__error-icon">🏁</div>
            <h1 className="join-page__title">Session Ended</h1>
            <p className="join-page__subtitle">
              This session has ended. No new check-ins are accepted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="join-page">
      <div className="join-page__card card">
        <div className="join-page__header">
          <span className="join-page__session-badge">PICKLEBALL SESSION</span>
          <h1 className="join-page__title">{sessionInfo?.name}</h1>
          <div className="join-page__meta">
            <span className="join-page__meta-item">
              {sessionInfo?.gameMode === 'singles' ? 'Singles' : 'Doubles'}
            </span>
            <span className="join-page__meta-sep">·</span>
            <span className="join-page__meta-item">
              {sessionInfo?.playerCount ?? 0} players checked in
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="join-page__form">
          <div className="join-page__field">
            <label htmlFor="join-player-name" className="join-page__label">
              Your Name
            </label>
            <div className="join-page__input-wrapper" ref={dropdownRef}>
              <input
                ref={inputRef}
                id="join-player-name"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                onFocus={handleNameFocus}
                onKeyDown={handleKeyDown}
                placeholder="Enter your name"
                maxLength={30}
                disabled={submitting}
                className="join-page__input"
                autoComplete="off"
                autoFocus
                role="combobox"
                aria-expanded={showDropdown && filteredBench.length > 0}
                aria-controls="join-bench-listbox"
                aria-autocomplete="list"
              />
              {showDropdown && filteredBench.length > 0 && (
                <ul
                  id="join-bench-listbox"
                  className="join-page__dropdown"
                  role="listbox"
                  aria-label="Existing players"
                >
                  {filteredBench.map((player, idx) => (
                    <li
                      key={player.id}
                      className={`join-page__dropdown-item${idx === highlightIndex ? ' join-page__dropdown-item--highlighted' : ''}`}
                      role="option"
                      aria-selected={idx === highlightIndex}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        fillBenchPlayerName(player);
                      }}
                      onMouseEnter={() => setHighlightIndex(idx)}
                    >
                      <span className="join-page__dropdown-name">{player.name}</span>
                      <span className="join-page__dropdown-badge">In Session</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="join-page__field">
            <label className="join-page__label">Skill Level</label>
            <div className="join-page__stars" role="radiogroup" aria-label="Skill level">
              {([1, 2, 3, 4, 5] as StarRating[]).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setStarRating(rating)}
                  disabled={submitting}
                  className={`join-page__star${rating <= starRating ? ' join-page__star--active' : ''}`}
                  aria-label={`${rating} star - ${STAR_RATING_LABELS[rating]}`}
                  aria-pressed={starRating === rating}
                >
                  ★
                </button>
              ))}
              <span className="join-page__skill-label">{STAR_RATING_LABELS[starRating]}</span>
            </div>
          </div>

          {partnerCandidates.length > 0 && (
            <div className="join-page__field">
              <label htmlFor="join-partner" className="join-page__label">
                Pair With <span className="join-page__label-hint">(optional)</span>
              </label>
              <div className="join-page__input-wrapper" ref={partnerDropdownRef}>
                <input
                  id="join-partner"
                  type="text"
                  value={partnerSearch}
                  onChange={(e) => {
                    setPartnerSearch(e.target.value);
                    setShowPartnerDropdown(true);
                    if (!e.target.value) {
                      setPartnerId(null);
                      setPartnerConfirm(null);
                    }
                  }}
                  onFocus={() => {
                    if (partnerCandidates.length > 0) setShowPartnerDropdown(true);
                  }}
                  placeholder="Search for a player..."
                  maxLength={30}
                  disabled={submitting}
                  className="join-page__input"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={showPartnerDropdown && filteredPartners.length > 0}
                  aria-controls="join-partner-listbox"
                  aria-autocomplete="list"
                />
                {partnerId && (
                  <button
                    type="button"
                    className="join-page__partner-clear"
                    onClick={clearPartner}
                    disabled={submitting}
                    aria-label="Clear partner selection"
                  >
                    ✕
                  </button>
                )}
                {showPartnerDropdown && filteredPartners.length > 0 && (
                  <ul
                    id="join-partner-listbox"
                    className="join-page__dropdown"
                    role="listbox"
                    aria-label="Available partners"
                  >
                    {filteredPartners.map((player) => (
                      <li
                        key={player.id}
                        className={`join-page__dropdown-item${player.id === partnerId ? ' join-page__dropdown-item--selected' : ''}`}
                        role="option"
                        aria-selected={player.id === partnerId}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectPartner(player);
                        }}
                      >
                        <span className="join-page__dropdown-name">{player.name}</span>
                        <span className={`join-page__dropdown-badge join-page__dropdown-badge--${player.status}`}>
                          {STATUS_LABELS[player.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {partnerConfirm && (
                <div className="join-page__partner-confirm">
                  <p className="join-page__partner-confirm-text">
                    <strong>{partnerConfirm.name}</strong> is on the bench. Check them in as well?
                  </p>
                  <div className="join-page__partner-confirm-actions">
                    <button
                      type="button"
                      className="join-page__partner-confirm-yes"
                      onClick={dismissPartnerConfirm}
                      disabled={submitting}
                    >
                      Yes, check them in
                    </button>
                    <button
                      type="button"
                      className="join-page__partner-confirm-no"
                      onClick={clearPartner}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {partnerId && !partnerConfirm && (
                <p className="join-page__partner-note">
                  You'll be paired together in the queue
                </p>
              )}
            </div>
          )}

          {submitError && (
            <p role="alert" className="join-page__error">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="join-page__submit"
          >
            {submitting ? 'Checking in...' : 'Check In'}
          </button>
        </form>

        <p className="join-page__footer-text">
          Your name, skill level, and partner preference will be visible to the session organizer.
        </p>
      </div>
    </div>
  );
}

export default JoinSession;
