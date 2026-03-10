"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const BASE = 'https://api.ethos.network/api/v2';

function scoreColor(score: number): string {
  if (score >= 2600) return '#7F5DB4';
  if (score >= 2400) return '#896CAA';
  if (score >= 2200) return '#008123';
  if (score >= 2000) return '#297D53';
  if (score >= 1800) return '#007ECA';
  if (score >= 1600) return '#3888BE';
  if (score >= 1400) return '#778FAB';
  if (score >= 1200) return '#C1C0B5';
  if (score >= 800)  return '#CC8D00';
  return '#C91033';
}

function EthosLogoIcon({ score, size = 12 }: { score: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 7.39062H5.89844C5.79398 8.25062 5.58329 9.07601 5.2793 9.85352H0V7.39062ZM12 12.3154H3.88867C4.46022 11.5728 4.9306 10.7454 5.2793 9.85352H12V12.3154ZM12 7.39062H5.89844C5.94798 6.98275 5.97656 6.56715 5.97656 6.14551C5.97655 5.73313 5.9488 5.32697 5.90137 4.92773H12V7.39062ZM0 2.46289H5.28906C5.59101 3.24119 5.79913 4.06729 5.90137 4.92773H0V2.46289ZM12 2.46289H5.28906C4.94305 1.57099 4.47497 0.743432 3.90625 0H12V2.46289Z" fill={scoreColor(score)}/>
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SuggestedUser {
  profileId: number | null;
  username: string | null;
  displayName: string;
  score: number;
  avatarUrl: string | null;
}

type Period = '1H' | '24H' | '7D';

interface TickerStats {
  profiles: number | null;
  verifications: number | null;
  reviews: number | null;
  vouches: number | null;
  ethVouched: string | null;
}

// ── Global stats fetcher ──────────────────────────────────────────────────────

async function fetchTickerStats(period: Period): Promise<TickerStats> {
  const hours = period === '1H' ? 1 : period === '24H' ? 24 : 168;
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const dayRange = period === '7D' ? 7 : 1;
  const headers = { 'Content-Type': 'application/json', 'X-Ethos-Client': 'ethosguard' };

  // POST /activities/feed supports global activity counts with dayRange filter
  // For 24H/7D: dayRange total is exact. For 1H: paginate and filter by timestamp.
  async function feedCount(filter: string): Promise<number | null> {
    try {
      if (period !== '1H') {
        const res = await fetch(`${BASE}/activities/feed`, {
          method: 'POST', headers, cache: 'no-store',
          body: JSON.stringify({ filter: [filter], dayRange, limit: 1 }),
        });
        const data = await res.json();
        return data.total ?? null;
      }
      // 1H: paginate through last-day feed, count items within the hour
      let count = 0;
      for (let offset = 0; offset < 600; offset += 100) {
        const res = await fetch(`${BASE}/activities/feed`, {
          method: 'POST', headers, cache: 'no-store',
          body: JSON.stringify({ filter: [filter], dayRange: 1, limit: 100, offset }),
        });
        const data = await res.json();
        const values: Array<{ timestamp: number }> = data.values ?? [];
        let done = false;
        for (const item of values) {
          if (item.timestamp < since) { done = true; break; }
          count++;
        }
        if (done || values.length < 100) break;
      }
      return count;
    } catch {
      return null;
    }
  }

  // POST /vouches is sorted newest-first — paginate to count + sum ETH within period
  async function vouchStats(): Promise<{ count: number | null; eth: string | null }> {
    let count = 0;
    let ethSum = 0;
    try {
      for (let offset = 0; offset < 700; offset += 100) {
        const res = await fetch(`${BASE}/vouches`, {
          method: 'POST', headers, cache: 'no-store',
          body: JSON.stringify({ limit: 100, offset }),
        });
        const data = await res.json();
        const values: Array<{ balance: string; activityCheckpoints: { vouchedAt: number } }> = data.values ?? [];
        let done = false;
        for (const v of values) {
          if ((v.activityCheckpoints?.vouchedAt ?? 0) < since) { done = true; break; }
          count++;
          ethSum += parseInt(v.balance || '0') / 1e18;
        }
        if (done || values.length < 100) break;
      }
      return { count, eth: ethSum.toFixed(2) };
    } catch {
      return { count: null, eth: null };
    }
  }

  // GET /human-verification/search sorted newest-first — paginate until verifiedAt < since
  async function verificationCount(): Promise<number | null> {
    let count = 0;
    try {
      for (let offset = 0; offset < 300; offset += 50) {
        const res = await fetch(
          `${BASE}/human-verification/search?status=VERIFIED&sortBy=newest&limit=50&offset=${offset}`,
          { cache: 'no-store', headers: { 'X-Ethos-Client': 'ethosguard' } }
        );
        const data = await res.json();
        const values: Array<{ verifiedAt: string }> = data.values ?? [];
        let done = false;
        for (const v of values) {
          const ts = v.verifiedAt ? new Date(v.verifiedAt).getTime() / 1000 : 0;
          if (ts < since) { done = true; break; }
          count++;
        }
        if (done || values.length < 50) break;
      }
      return count;
    } catch {
      return null;
    }
  }

  const [reviewsRes, verificationsRes, profilesRes, vouchesRes] = await Promise.allSettled([
    feedCount('review'),
    verificationCount(),
    feedCount('invitation-accepted'),
    vouchStats(),
  ]);

  const vouches_data = vouchesRes.status === 'fulfilled' ? vouchesRes.value : { count: null, eth: null };

  return {
    profiles: profilesRes.status === 'fulfilled' ? (profilesRes.value ?? null) : null,
    verifications: verificationsRes.status === 'fulfilled' ? (verificationsRes.value ?? null) : null,
    reviews: reviewsRes.status === 'fulfilled' ? (reviewsRes.value ?? null) : null,
    vouches: vouches_data.count,
    ethVouched: vouches_data.eth,
  };
}

// ── Ticker component ──────────────────────────────────────────────────────────

function fmt(n: number | null): string {
  return n === null ? '—' : n.toLocaleString();
}

function TickerContent({ stats }: { stats: TickerStats }) {
  const items = [
    { title: 'New Reviews', subtitle: 'Written on Ethos', value: fmt(stats.reviews) },
    { title: 'New Vouches', subtitle: 'Created on Ethos', value: fmt(stats.vouches) },
    { title: 'New Profiles', subtitle: 'Joined Ethos', value: fmt(stats.profiles) },
    { title: 'ETH Vouched', subtitle: 'Deposited on Ethos', value: stats.ethVouched ?? '—' },
    { title: 'New Humans', subtitle: 'Verified on Ethos', value: fmt(stats.verifications) },
  ];

  const content = items.map((item, i) => (
    <span
      key={i}
      className="flex flex-col justify-between shrink-0"
      style={{ background: '#0E0E0E', borderRadius: '3px', padding: '20px 28px', marginRight: '12px', minWidth: '300px', minHeight: '110px' }}
    >
      <span className="flex flex-col gap-1">
        <span className="text-white font-bold" style={{ fontFamily: 'var(--font-ibm-plex-sans)', fontSize: '20px', lineHeight: 1.1 }}>{item.title}</span>
        <span className="uppercase" style={{ fontFamily: 'var(--font-ibm-plex-mono)', fontSize: '12px', color: '#ffffff', fontWeight: 500 }}>{item.subtitle}</span>
      </span>
      <span className="text-white font-bold text-right" style={{ fontFamily: 'var(--font-ibm-plex-sans)', fontSize: '32px', lineHeight: 1 }}>{item.value}</span>
    </span>
  ));

  return <>{content}</>;
}

// ── Info icon with modal ──────────────────────────────────────────────────────

function InfoIcon() {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div className="relative"
      onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); setShow(true); }}
      onMouseLeave={() => { timerRef.current = setTimeout(() => setShow(false), 200); }}
    >
      <span className={`cursor-default transition-colors duration-150 ${show ? 'text-[#b5f500]' : 'text-white'}`} style={{ position: 'relative', top: '2px' }}>
        <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
          <path d="M6.75 6.08333V9.41667M6.75 12.75C3.43629 12.75 0.75 10.0637 0.75 6.75C0.75 3.43629 3.43629 0.75 6.75 0.75C10.0637 0.75 12.75 3.43629 12.75 6.75C12.75 10.0637 10.0637 12.75 6.75 12.75ZM6.7832 4.08333V4.15L6.7168 4.15013V4.08333H6.7832Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      {show && (
        <div
          className="absolute z-50 shadow-2xl shadow-black/70"
          style={{ top: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', width: 'min(340px, 90vw)', borderRadius: '3px', overflow: 'hidden' }}
          onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
          onMouseLeave={() => { timerRef.current = setTimeout(() => setShow(false), 200); }}
        >
          <div className="bg-[#3B01D2]" style={{ padding: '16px' }}>
            <p className="text-white/80 leading-relaxed" style={{ fontSize: '14px', fontWeight: 500 }}>
              EthosGuard analyzes on-chain activity patterns on Ethos Network to surface signals that a reputation score alone can&apos;t capture: mutual vouching loops, review spikes, low-activity reviewers, and AI-generated content.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [period, setPeriod] = useState<Period>('24H');
  const [tickerStats, setTickerStats] = useState<TickerStats>({ profiles: null, verifications: null, reviews: null, vouches: null, ethVouched: null });
  const [tickerLoading, setTickerLoading] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch ticker stats
  useEffect(() => {
    setTickerLoading(true);
    fetchTickerStats(period)
      .then(setTickerStats)
      .catch(() => {})
      .finally(() => setTickerLoading(false));
  }, [period]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${BASE}/users/search?query=${encodeURIComponent(trimmed)}&limit=6`,
          { headers: { "X-Ethos-Client": "ethosguard" } }
        );
        const data = await res.json();
        const results = (data.values ?? [])
          .filter((u: SuggestedUser) => u.username && u.username.toLowerCase().includes(trimmed.toLowerCase()))
          .sort((a: SuggestedUser, b: SuggestedUser) => b.score - a.score);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function navigate(username: string) {
    setShowSuggestions(false);
    router.push(`/profile/${encodeURIComponent(username)}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    if (activeIndex >= 0 && suggestions[activeIndex]?.username) {
      navigate(suggestions[activeIndex].username!);
    } else {
      navigate(trimmed);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a]">
      {/* Main content — centered */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <img
          src="/icons/main-logo.svg"
          width="72"
          height="84"
          alt="EthosGuard"
          style={{ marginBottom: '20px' }}
        />

        <div className="flex items-center gap-2" style={{ marginBottom: '20px' }}>
          <p className="text-white text-sm" style={{ fontFamily: 'var(--font-ibm-plex-mono)', fontWeight: 500, letterSpacing: 'normal' }}>
            Pattern detection for Ethos Network
          </p>
          <InfoIcon />
        </div>

        {/* Search bar + dropdown */}
        <div ref={wrapperRef} className="w-full max-w-xl" style={{ position: 'relative' }}>
          <form onSubmit={handleSearch} className="flex w-full gap-0">
            <div className="flex items-center flex-1 bg-[#161616] gap-3" style={{ paddingLeft: '20px', paddingRight: '16px', borderRadius: '3px' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white shrink-0">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Ethos profile name"
                className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-white"
                style={{ padding: '18px 0', fontFamily: "var(--font-ibm-plex-mono)", fontWeight: 500, letterSpacing: '0' }}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              className="bg-[#b5f500] text-black text-xs font-bold uppercase cursor-pointer shrink-0 btn-search"
              style={{ padding: '18px 28px', letterSpacing: '0.15em', marginLeft: '8px', borderRadius: '3px' }}
            >
              SEARCH
            </button>
          </form>

          {/* Dropdown */}
          {showSuggestions && (
            <div
              className="absolute w-full bg-[#161616] z-50"
              style={{ top: 'calc(100% + 4px)', left: 0, right: 0, borderRadius: '3px' }}
            >
              {suggestions.map((u, i) => (
                <div
                  key={u.profileId ?? u.username}
                  onMouseDown={() => navigate(u.username!)}
                  className="flex items-center gap-3 cursor-pointer"
                  style={{
                    padding: '10px 20px',
                    background: i === activeIndex ? '#1f1f1f' : 'transparent',
                    borderLeft: i === activeIndex ? '2px solid #b5f500' : '2px solid transparent',
                  }}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[#b5f500] font-bold truncate" style={{ fontSize: '13px', fontFamily: "var(--font-ibm-plex-mono)" }}>
                      @{u.username}
                    </span>
                    <span className="text-white truncate" style={{ fontSize: '11px', fontFamily: "var(--font-ibm-plex-mono)", fontWeight: 500 }}>
                      {u.displayName}
                    </span>
                  </div>
                  <span className="bg-[#222] text-white font-bold flex items-center shrink-0" style={{ fontSize: '12px', padding: '4px 8px', gap: '5px', fontFamily: "var(--font-ibm-plex-sans)" }}>
                    <EthosLogoIcon score={u.score} size={12} />
                    {u.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Live data ticker section */}
      <div>
        {/* Header row */}
        <div className="flex items-center justify-between" style={{ padding: '14px 20px 10px' }}>
          <span className="flex items-center gap-2 font-bold uppercase" style={{ fontSize: '14px', letterSpacing: '0.12em', color: tickerLoading ? '#b5f500' : '#ffffff' }}>
            Real-time data
            {tickerLoading && (
              <img src="/icons/synced-white.svg" width="14" height="14" alt="" className="spin" style={{ filter: 'brightness(0) saturate(100%) invert(87%) sepia(56%) saturate(800%) hue-rotate(30deg)' }} />
            )}
          </span>
          <div className="flex items-center gap-1">
            {(['1H', '24H', '7D'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="font-bold uppercase cursor-pointer"
                style={{
                  fontSize: '14px',
                  letterSpacing: '0.1em',
                  padding: '4px 10px',
                  borderRadius: '3px',
                  background: period === p ? '#b5f500' : 'transparent',
                  color: period === p ? '#000000' : '#555555',
                  transition: 'all 0.2s ease',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Ticker */}
        <div className="overflow-hidden" style={{ padding: '14px 0' }}>
          <div className="ticker-track flex items-center" style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-ibm-plex-mono)', fontWeight: 700 }}>
            <TickerContent stats={tickerStats} />
            <TickerContent stats={tickerStats} />
            <TickerContent stats={tickerStats} />
            <TickerContent stats={tickerStats} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#3B01D2] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" style={{ padding: '20px' }}>
        <div className="flex items-center gap-3">
          <img src="/icons/review-black.svg" width="24" height="24" alt="" style={{ filter: 'invert(1) brightness(10)' }} />
          <div className="flex flex-col items-start">
            <span className="text-white text-xs font-bold uppercase" style={{ letterSpacing: '0.1em' }}>
              @STELLARHOBBES
            </span>
            <a
              href="https://app.ethos.network/profile/x/stellarhobbes"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold uppercase link-fluo"
              style={{ letterSpacing: '0.1em' }}
            >
              LEAVE_REVIEW <span className="link-arrow">➔</span>
            </a>
          </div>
        </div>
        <span className="text-white font-bold uppercase" style={{ fontSize: '11px', letterSpacing: '0.12em', fontFamily: 'var(--font-ibm-plex-mono)' }}>
          VERSION 0.0.1
        </span>
      </footer>
    </div>
  );
}
