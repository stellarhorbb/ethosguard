"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { fetchProfileData, type ProfileData, type SlopMatch } from "@/app/lib/ethos";

// ─── Logo ─────────────────────────────────────────────────────────────────────

function LogoIcon() {
  return <img src="/icons/main-logo.svg" width="42" height="49" alt="" />;
}

function scoreColor(score: number): string {
  if (score >= 2600) return '#7F5DB4'; // Renowned
  if (score >= 2400) return '#896CAA'; // Revered
  if (score >= 2200) return '#008123'; // Distinguished
  if (score >= 2000) return '#297D53'; // Exemplary
  if (score >= 1800) return '#007ECA'; // Reputable
  if (score >= 1600) return '#3888BE'; // Established
  if (score >= 1400) return '#778FAB'; // Known
  if (score >= 1200) return '#C1C0B5'; // Neutral
  if (score >= 800)  return '#CC8D00'; // Questionable
  return '#C91033';                    // Untrusted
}

function EthosLogoIcon({ score, size = 16 }: { score: number | undefined; size?: number }) {
  const color = score !== undefined ? scoreColor(score) : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 7.39062H5.89844C5.79398 8.25062 5.58329 9.07601 5.2793 9.85352H0V7.39062ZM12 12.3154H3.88867C4.46022 11.5728 4.9306 10.7454 5.2793 9.85352H12V12.3154ZM12 7.39062H5.89844C5.94798 6.98275 5.97656 6.56715 5.97656 6.14551C5.97655 5.73313 5.9488 5.32697 5.90137 4.92773H12V7.39062ZM0 2.46289H5.28906C5.59101 3.24119 5.79913 4.06729 5.90137 4.92773H0V2.46289ZM12 2.46289H5.28906C4.94305 1.57099 4.47497 0.743432 3.90625 0H12V2.46289Z" fill={color}/>
    </svg>
  );
}


// ─── Sub-components ────────────────────────────────────────────────────────────

interface CardTooltipData {
  description: string;
  thresholds: Array<{ label: string; text: string }>;
}

function CardTooltip({ data, align = 'right' }: { data: CardTooltipData; align?: 'left' | 'right' }) {
  return (
    <div className="absolute z-50 shadow-2xl shadow-black/70" style={{ top: 'calc(100% + 8px)', ...(align === 'left' ? { left: 0 } : { right: 0 }), width: '300px', borderRadius: '3px', overflow: 'hidden' }}>
      <div className="bg-[#3B01D2]" style={{ padding: '16px' }}>
        <div className="flex items-start justify-between" style={{ marginBottom: '10px' }}>
          <svg width="20" height="20" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path d="M6.75 6.08333V9.41667M6.75 12.75C3.43629 12.75 0.75 10.0637 0.75 6.75C0.75 3.43629 3.43629 0.75 6.75 0.75C10.0637 0.75 12.75 3.43629 12.75 6.75C12.75 10.0637 10.0637 12.75 6.75 12.75ZM6.7832 4.08333V4.15L6.7168 4.15013V4.08333H6.7832Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="text-white/80 leading-relaxed" style={{ fontSize: '14px', fontWeight: 500 }}>
          {data.description}
        </p>
      </div>
      <div className="bg-[#b5f500]" style={{ padding: '16px' }}>
        <div className="font-mono text-black" style={{ fontSize: '13px', fontWeight: 500, lineHeight: '1.4', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {data.thresholds.map((t, i) => (
            <p key={i}><span className="font-bold">{t.label}</span> ➔ {t.text}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function HighlightCard({
  title,
  description,
  alert,
  borderline,
  secondary,
  tooltip,
  tooltipAlign = 'right',
  children,
}: {
  title: string;
  description: string;
  alert: boolean;
  borderline?: boolean;
  secondary?: React.ReactNode;
  tooltip?: CardTooltipData;
  tooltipAlign?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textColor = alert ? "text-black" : "text-white";
  return (
    <div
      className={`relative flex flex-col justify-between ${alert ? "bg-[#b5f500]" : "bg-[#161616]"}`}
      style={{ padding: "16px", minHeight: "180px", gap: "12px", borderRadius: "3px" }}
    >
      {tooltip && (
        <div
          className="absolute"
          style={{ top: '21px', right: '16px' }}
          onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); setShowTooltip(true); }}
          onMouseLeave={() => { timerRef.current = setTimeout(() => setShowTooltip(false), 200); }}
        >
          <span className={`cursor-default transition-colors duration-150 ${alert ? 'text-black hover:text-[#3B01D2]' : 'text-white hover:text-[#b5f500]'}`}>
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
              <path d="M6.75 6.08333V9.41667M6.75 12.75C3.43629 12.75 0.75 10.0637 0.75 6.75C0.75 3.43629 3.43629 0.75 6.75 0.75C10.0637 0.75 12.75 3.43629 12.75 6.75C12.75 10.0637 10.0637 12.75 6.75 12.75ZM6.7832 4.08333V4.15L6.7168 4.15013V4.08333H6.7832Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          {showTooltip && (
            <div
              onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
              onMouseLeave={() => { timerRef.current = setTimeout(() => setShowTooltip(false), 200); }}
            >
              <CardTooltip data={tooltip} align={tooltipAlign} />
            </div>
          )}
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <p className={`leading-tight ${textColor}`} style={{ fontSize: "26px", fontWeight: 700, fontFamily: "var(--font-ibm-plex-sans)" }}>
            {title}
          </p>
          {alert && <img src="/icons/warning-black.svg" width="18" height="18" alt="" style={{ flexShrink: 0 }} />}
          {!alert && borderline && <img src="/icons/warning-fluo.svg" width="18" height="18" alt="" style={{ flexShrink: 0 }} />}
        </div>
        <p className={`leading-relaxed ${textColor}`} style={{ fontSize: "14px", marginTop: "4px", fontWeight: 500 }}>
          {description}
        </p>
      </div>
      <div className="flex items-baseline justify-between">
        <div className={`leading-none ${textColor}`} style={{ fontFamily: 'var(--font-ibm-plex-mono)', fontSize: '15px' }}>
          {secondary}
        </div>
        <div className={`text-right font-bold leading-none ${textColor}`} style={{ fontFamily: "var(--font-ibm-plex-sans)", fontSize: "44px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ score, label }: { score: string; label: string }) {
  const icon = score === 'positive' ? '/icons/positive.svg'
    : score === 'negative' ? '/icons/negative.svg'
    : '/icons/neutral.svg';
  return (
    <span className="flex items-center gap-1">
      <img src={icon} width="16" height="16" alt={score} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
      <span className="text-white text-xs uppercase">{label}</span>
    </span>
  );
}

function ReviewCard({
  username,
  hours,
  ethGiven,
  ethReceived,
  link,
  scoreGiven,
  scoreReceived,
}: {
  username: string;
  hours: number;
  ethGiven: string;
  ethReceived: string;
  link: string;
  scoreGiven: string;
  scoreReceived: string;
}) {
  return (
    <div
      onClick={() => window.open(link, '_blank')}
      className="bg-[#161616] cursor-pointer border border-transparent hover:border-[#b5f500] transition-colors duration-100 flex flex-col justify-between" style={{ padding: '12px 14px', borderRadius: '3px', minHeight: '74px' }}
    >
      <div className="flex items-center justify-between">
        <a href={`/profile/${username}`} onClick={e => e.stopPropagation()} className="text-[#b5f500] hover:text-white transition-colors duration-150 text-sm font-bold">@{username}</a>
        <span className="text-white text-xs flex items-center gap-1">
          {hours}h
          <img src="/icons/timer-white.svg" width="16" height="16" alt="" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ScoreBadge score={scoreGiven} label="gave" />
        <span className="text-white text-xs">/</span>
        <ScoreBadge score={scoreReceived} label="received" />
      </div>
    </div>
  );
}

function VouchCard({ username, hours, ethGiven, ethReceived, link }: { username: string; hours: number; ethGiven: string; ethReceived: string; link: string }) {
  return (
    <div
      onClick={() => window.open(link, '_blank')}
      className="bg-[#161616] cursor-pointer border border-transparent hover:border-[#b5f500] transition-colors duration-100 flex flex-col justify-between" style={{ padding: '12px 14px', borderRadius: '3px', minHeight: '74px' }}
    >
      <div className="flex items-center justify-between">
        <a href={`/profile/${username}`} onClick={e => e.stopPropagation()} className="text-[#b5f500] hover:text-white transition-colors duration-150 text-sm font-bold">@{username}</a>
        <span className="text-white text-xs flex items-center gap-1">
          {hours}h
          <img src="/icons/timer-white.svg" width="16" height="16" alt="" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
        </span>
      </div>
      <p className="text-white text-xs">
        {ethGiven} ETH given / {ethReceived} ETH received
      </p>
    </div>
  );
}

function SlopScoreModal({ score, matches }: { score: number; matches: SlopMatch[] }) {
  const positives = matches.filter(m => m.points > 0);
  const negatives = matches.filter(m => m.points < 0);
  return (
    <div
      className="absolute z-50 shadow-2xl shadow-black/70"
      style={{ bottom: 'calc(100% + 8px)', right: 0, width: '280px', borderRadius: '3px', overflow: 'hidden' }}
    >
      <div className="bg-[#3B01D2]" style={{ padding: '16px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
          <span className="text-white font-bold" style={{ fontSize: '18px' }}>Score breakdown</span>
          <span className="text-white font-bold" style={{ fontFamily: 'var(--font-ibm-plex-sans)', fontSize: '18px' }}>{score}/100</span>
        </div>
      </div>
      <div className="bg-[#b5f500]" style={{ padding: '16px' }}>
        {positives.length === 0 && negatives.length === 0 ? (
          <p className="text-black/60 italic" style={{ fontSize: '13px' }}>No signals matched</p>
        ) : (
          <div className="font-mono text-black" style={{ fontSize: '13px', fontWeight: 500, lineHeight: '1.3', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {positives.map((m, i) => (
              <p key={i}>+{m.points} ➔ {m.label}</p>
            ))}
            {negatives.map((m, i) => (
              <p key={i}>{m.points} ➔ {m.label}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SlopCard({
  username,
  score,
  preview,
  link,
  matches,
}: {
  username: string;
  score: number;
  preview: string;
  link: string;
  matches: SlopMatch[];
}) {
  const [showScoreModal, setShowScoreModal] = useState(false);
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div
      onClick={() => window.open(link || `https://app.ethos.network/profile/x/${username}`, '_blank')}
      className="flex flex-col justify-between bg-[#161616] cursor-pointer border border-transparent hover:border-[#b5f500] transition-colors duration-100" style={{ padding: '12px 14px', borderRadius: '3px', minHeight: '125px' }}
    >
      <div className="flex items-baseline justify-between">
        <a
          href={`/profile/${username}`}
          onClick={e => e.stopPropagation()}
          className="text-[#b5f500] hover:text-white transition-colors duration-150 text-sm font-bold"
        >
          @{username}
        </a>
        <div
          className="relative"
          onClick={e => e.stopPropagation()}
          onMouseEnter={() => {
            if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
            setShowScoreModal(true);
          }}
          onMouseLeave={() => {
            scoreTimerRef.current = setTimeout(() => setShowScoreModal(false), 150);
          }}
        >
          <span className="text-sm font-bold cursor-default transition-colors duration-150" style={{ color: showScoreModal ? '#b5f500' : '#ffffff' }}>{score}/100</span>
          {showScoreModal && (
            <div
              onMouseEnter={() => { if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current); }}
              onMouseLeave={() => { scoreTimerRef.current = setTimeout(() => setShowScoreModal(false), 150); }}
            >
              <SlopScoreModal score={score} matches={matches} />
            </div>
          )}
        </div>
      </div>
      <p className="text-white text-xs leading-relaxed line-clamp-2" style={{ marginTop: 'auto', paddingTop: '8px' }}>
        {preview}
      </p>
    </div>
  );
}

function EmptyColumn() {
  return (
    <div className="bg-[#3B01D2] flex items-center justify-center" style={{ height: '74px', borderRadius: '3px' }}>
      <span className="text-white font-bold uppercase" style={{ fontSize: '13px', letterSpacing: '0.08em' }}>
        NO ISSUE FOUND
      </span>
    </div>
  );
}

function AISlopsModal() {
  return (
    <div className="absolute bottom-7 left-1/2 z-50 shadow-2xl shadow-black/60" style={{ width: '360px', transform: 'translateX(-50%)' }}>
      {/* Top section — violet */}
      <div className="bg-[#3B01D2]" style={{ padding: '16px' }}>
        <div className="flex items-start justify-between" style={{ marginBottom: '12px' }}>
          <span className="text-white font-bold" style={{ fontSize: '18px' }}>AI Detector</span>
          <img src="/icons/question-white.svg" width="22" height="22" alt="" />
        </div>
        <p className="text-white/80 leading-relaxed" style={{ fontSize: '14px', marginBottom: '14px', fontWeight: 500 }}>
          Detects AI-generated reviews by analyzing vocabulary, sentence
          structure, and writing patterns.
        </p>
        <p className="text-white/70 font-mono" style={{ fontSize: '13px', fontWeight: 500 }}>
          0–29 Clean ➔ 30–49 Suspicious ➔ 50+ Likely AI
        </p>
      </div>
      {/* Bottom section — acid green */}
      <div className="bg-[#b5f500]" style={{ padding: '16px' }}>
        <div className="font-mono text-black" style={{ fontSize: '13px', fontWeight: 500, lineHeight: '1.3', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <p>+35 ➔ Em/En dashes</p>
          <p>+25 ➔ Generic filler phrases</p>
          <p>+20 ➔ Templated title pattern</p>
          <p>+15 ➔ Corporate vocabulary & formulas</p>
          <p>+12 ➔ Transitions & superlatives</p>
          <p>+8 &nbsp;➔ No contractions, slang or emotion</p>
          <p>−10 ➔ Web3 slang or personal narrative</p>
        </div>
        <p className="italic text-black/60" style={{ fontSize: '13px', fontWeight: 500 }}>
          Experimental, not an exact science.
        </p>
      </div>
    </div>
  );
}

// ─── Column ────────────────────────────────────────────────────────────────────

const REVIEWS_LIMIT = 5;
const VOUCHES_LIMIT = 5;
const SLOPS_LIMIT = 3;

function DataColumn({
  title,
  icon,
  found,
  children,
  showInfo,
}: {
  title: string;
  icon?: React.ReactNode;
  found: number | null;
  children: React.ReactNode;
  showInfo?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isClean = found === 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Column header */}
      <div className="flex items-center justify-between mb-4" style={{ paddingLeft: '14px', paddingRight: '14px' }}>
        <div className="flex items-center gap-2">
          {icon && <span className="text-white">{icon}</span>}
          <span className="text-white uppercase" style={{ fontSize: '16px', fontFamily: 'var(--font-ibm-plex-mono)', fontWeight: 500, letterSpacing: '0.08em' }}>
            {title}
          </span>
          {showInfo && (
            <div className="relative">
              <span
                className="text-white hover:text-[#b5f500] cursor-default select-none transition-colors duration-150"
                onMouseEnter={() => {
                  if (timerRef.current) clearTimeout(timerRef.current);
                  setShowModal(true);
                }}
                onMouseLeave={() => {
                  timerRef.current = setTimeout(() => setShowModal(false), 200);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                  <path d="M6.75 6.08333V9.41667M6.75 12.75C3.43629 12.75 0.75 10.0637 0.75 6.75C0.75 3.43629 3.43629 0.75 6.75 0.75C10.0637 0.75 12.75 3.43629 12.75 6.75C12.75 10.0637 10.0637 12.75 6.75 12.75ZM6.7832 4.08333V4.15L6.7168 4.15013V4.08333H6.7832Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              {showModal && (
                <div
                  onMouseEnter={() => {
                    if (timerRef.current) clearTimeout(timerRef.current);
                  }}
                  onMouseLeave={() => {
                    timerRef.current = setTimeout(
                      () => setShowModal(false),
                      200
                    );
                  }}
                >
                  <AISlopsModal />
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          {isClean ? (
            <span className="text-white flex items-center gap-1" style={{ fontSize: '16px', fontFamily: 'var(--font-ibm-plex-mono)', fontWeight: 500, letterSpacing: '0.08em' }}>
              <img src="/icons/clean-white.svg" width="16" height="16" alt="" /> CLEAN
            </span>
          ) : (
            <span className="text-[#b5f500] flex items-center gap-1" style={{ fontSize: '16px', fontFamily: 'var(--font-ibm-plex-mono)', fontWeight: 500, letterSpacing: '0.08em' }}>
              <img src="/icons/warning-fluo.svg" width="16" height="16" alt="" /> {found} FOUND
            </span>
          )}
        </div>
      </div>

      {/* Column body */}
      {isClean ? (
        <EmptyColumn />
      ) : (
        <div className="flex flex-col" style={{ gap: '5px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ loaded }: { loaded: boolean }) {
  const [pct, setPct] = useState(0);
  const [synced, setSynced] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setPct(0);
    setSynced(false);
    const t1 = setTimeout(() => setPct(35), 200);
    const t2 = setTimeout(() => setPct(65), 700);
    const t3 = setTimeout(() => setPct(85), 1400);
    timersRef.current = [t1, t2, t3];
    return () => { timersRef.current.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    if (loaded) {
      timersRef.current.forEach(clearTimeout);
      setPct(100);
      const t = setTimeout(() => setSynced(true), 700);
      return () => clearTimeout(t);
    }
  }, [loaded]);

  const state = synced ? "synced" : "loading";

  return (
    <div className="w-full relative" style={{ height: '36px', background: '#1a0070' }}>
      {/* Filling bar */}
      <div
        className="absolute inset-y-0 left-0 bg-[#3B01D2]"
        style={{ width: `${pct}%`, transition: 'width 0.6s ease' }}
      />
      {/* Content */}
      <div className="relative flex items-center gap-2 h-full" style={{ padding: '0 40px' }}>
        <img
          src="/icons/synced-white.svg"
          width="14"
          height="14"
          alt=""
          className={state === "loading" ? "spin" : ""}
        />
        <span className="text-white text-xs font-bold tracking-wider">
          {state === "loading" ? `${pct}%` : "Synced"}
        </span>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const params = useParams();
  const username = decodeURIComponent(params.username as string);

  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showAllVouches, setShowAllVouches] = useState(false);
  const [showAllSlops, setShowAllSlops] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    fetchProfileData(username)
      .then(setData)
      .catch(e => setError(e.message ?? 'Failed to load profile'));
  }, [username]);

  const profile = data?.profile;
  const highlights = data?.highlights;
  const mutualReviews = data?.mutualReviews ?? [];
  const mutualVouches = data?.mutualVouches ?? [];
  const aiSlops = data?.aiSlops ?? [];

  const displayedReviews = showAllReviews ? mutualReviews : mutualReviews.slice(0, REVIEWS_LIMIT);
  const displayedVouches = showAllVouches ? mutualVouches : mutualVouches.slice(0, VOUCHES_LIMIT);
  const displayedSlops = showAllSlops ? aiSlops : aiSlops.slice(0, SLOPS_LIMIT);


  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a]">
      {/* ── Sticky header (acid green) ── */}
      <header className="sticky top-0 z-40 bg-[#b5f500] flex items-center justify-between" style={{ padding: '16px 40px' }}>
        <a href="/" className="flex items-center gap-3">
          <LogoIcon />
          <div className="flex flex-col">
            <span className="text-black text-xs font-bold uppercase leading-tight" style={{ letterSpacing: '0.12em' }}>
              EthosGuard
            </span>
            <span className="text-black text-xs font-bold uppercase leading-tight" style={{ letterSpacing: '0.12em' }}>
              On-chain intelligence
            </span>
          </div>
        </a>


        <div className="flex items-center gap-3">
          <img src="/icons/review-black.svg" width="28" height="28" alt="" />
          <div className="flex flex-col items-start">
            <span className="text-black text-xs font-bold uppercase" style={{ letterSpacing: '0.1em' }}>
              @STELLARHOBBES
            </span>
            <a
              href="https://app.ethos.network/profile/x/stellarhobbes"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold uppercase link-dark" style={{ letterSpacing: '0.1em' }}
            >
              LEAVE_REVIEW <span className="link-arrow">➔</span>
            </a>
          </div>
        </div>
      </header>

      {/* ── Progress bar ── */}
      <ProgressBar loaded={!!data || !!error} />

      {/* ── Content ── */}
      <div className="flex flex-col flex-1" style={{ padding: '40px 40px 48px', gap: '24px' }}>

        {error && (
          <div className="flex items-center gap-2 text-[#b5f500] font-bold text-sm" style={{ padding: '20px 0' }}>
            <img src="/icons/warning-fluo.svg" width="16" height="16" alt="" />
            {error}
          </div>
        )}

        {/* Profile header */}
        <div style={{ marginBottom: '8px' }}>
          <div className="flex items-end justify-between" style={{ marginBottom: '14px' }}>
            <h1
              className="text-white font-bold"
              style={{ fontSize: "clamp(2rem, 5vw, 2.8rem)" }}
            >
              {profile?.username || username}
            </h1>
            <a
              href={`https://app.ethos.network/profile/x/${profile?.username || username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold tracking-widest uppercase whitespace-nowrap link-fluo"
              style={{ fontSize: '15px' }}
            >
              ETHOS PROFIL <span className="link-arrow">➔</span>
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-between" style={{ gap: '12px' }}>
            {/* Left badges */}
            <div className="flex flex-wrap items-center" style={{ gap: '20px' }}>
              <span className="bg-[#222] text-white font-bold flex items-center" style={{ fontSize: '16px', padding: '6px 10px', gap: '6px' }}>
                <EthosLogoIcon score={profile?.score} size={16} />
                <span
                  style={{ fontFamily: "var(--font-ibm-plex-sans)" }}
                  className="font-bold"
                >
                  {profile?.score}
                </span>
              </span>
              <span className="flex items-center" style={{ fontSize: '16px', gap: '6px', color: profile?.isValidator ? '#b5f500' : '#ffffff' }}>
                <img src={profile?.isValidator ? "/icons/checkmark-lemon.svg" : "/icons/false-white.svg"} width="16" height="16" alt="" />
                Validator
              </span>
              <span className="flex items-center" style={{ fontSize: '16px', gap: '6px', color: profile?.isHumanVerified ? '#b5f500' : '#ffffff' }}>
                <img src={profile?.isHumanVerified ? "/icons/checkmark-lemon.svg" : "/icons/false-white.svg"} width="16" height="16" alt="" />
                Human Verified
              </span>
              <span className="text-white flex items-center" style={{ fontSize: '16px', gap: '6px' }}>
                <img src="/icons/calendar-white.svg" width="16" height="16" alt="" />{" "}
                {profile?.joinedDate}
              </span>
            </div>

            {/* Right stats */}
            <div className="flex items-center gap-4">
              <span className="text-white flex items-center" style={{ fontSize: '16px', gap: '6px' }}>
                <img src="/icons/review-white.svg" width="16" height="16" alt="" />
                <span style={{ fontFamily: "var(--font-ibm-plex-sans)" }} className="font-bold">{profile?.reviewCount}</span>
                {" "}|{" "}
                <span style={{ fontFamily: "var(--font-ibm-plex-sans)" }} className="font-bold">{profile?.positivePercent}%</span>
                {" "}Positive
              </span>
              <span className="text-white flex items-center" style={{ fontSize: '16px', gap: '6px' }}>
                <img src="/icons/vouch-white.svg" width="16" height="16" alt="" />
                <span style={{ fontFamily: "var(--font-ibm-plex-sans)" }} className="font-bold">{profile?.ethVouched}</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── 4 highlight cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: '8px' }}>
          <HighlightCard
            tooltipAlign="left"
            title="Review Burst"
            description={"Spike of received reviews in 24h"}
            alert={!!highlights?.reviewBurst?.alert}
            borderline={!!highlights?.reviewBurst?.borderline}
            secondary={highlights?.reviewBurst?.date || undefined}
            tooltip={{
              description: "Detects sudden spikes of reviews received in any 24h window. Could indicate coordinated boosting activity.",
              thresholds: [
                { label: "1–3 reviews", text: "Clean, no alert" },
                { label: "4–6 reviews", text: "Suspicious" },
                { label: "7+ reviews", text: "Alert" },
              ],
            }}
          >
            {highlights?.reviewBurst?.count ?? 0}
          </HighlightCard>

          <HighlightCard
            tooltipAlign="left"
            title="Vouch Cluster"
            description={"Reciprocal vouches\non total given"}
            alert={!!highlights?.vouchCluster?.alert}
            borderline={!!highlights?.vouchCluster?.borderline}
            secondary={highlights?.vouchCluster?.total !== undefined ? `${highlights.vouchCluster.pct}% Reciprocal` : undefined}
            tooltip={{
              description: "Measures the share of mutual vouches (A vouches B and B vouches A) out of all vouches given. High reciprocity may signal a closed farming loop.",
              thresholds: [
                { label: "< 30% reciprocal", text: "Clean, no alert" },
                { label: "30–59% reciprocal", text: "Suspicious" },
                { label: "60%+ reciprocal", text: "Alert" },
              ],
            }}
          >
            {highlights?.vouchCluster?.count ?? 0} of {highlights?.vouchCluster?.total ?? 0}
          </HighlightCard>

          <HighlightCard
            title="Cleanup Activity"
            description={"Archived reviews &\nerased vouches"}
            alert={!!highlights?.cleanupActivity?.alert}
            borderline={!!highlights?.cleanupActivity?.borderline}
            tooltip={{
              description: "Counts reviews archived and vouches erased by this profile. Deleting past activity may indicate an attempt to manipulate reputation.",
              thresholds: [
                { label: "0 actions", text: "Clean" },
                { label: "1–9 actions", text: "Suspicious" },
                { label: "10+ actions", text: "Alert" },
              ],
            }}
          >
            {(highlights?.cleanupActivity?.reviews ?? 0) > 0 ||
            (highlights?.cleanupActivity?.vouches ?? 0) > 0 ? (
              <div className="flex items-end gap-2 justify-end">
                <span className="flex items-end gap-1">
                  <img src={highlights?.cleanupActivity?.alert ? "/icons/review-black.svg" : "/icons/review-white.svg"} width="28" height="28" alt="" style={{ marginBottom: '7px' }} />
                  <span>{highlights?.cleanupActivity?.reviews}</span>
                </span>
                <span className="flex items-end gap-1">
                  <img src={highlights?.cleanupActivity?.alert ? "/icons/vouch-black.svg" : "/icons/vouch-white.svg"} width="24" height="24" alt="" style={{ marginBottom: '4px' }} />
                  <span>{highlights?.cleanupActivity?.vouches}</span>
                </span>
              </div>
            ) : (
              0
            )}
          </HighlightCard>

          <HighlightCard
            title="Ghost Reviewers"
            description={"Reviewers with\nreviews given < 3"}
            alert={!!highlights?.ghostReviewers?.alert}
            borderline={!!highlights?.ghostReviewers?.borderline}
            secondary={`${highlights?.ghostReviewers?.count ?? 0} ${(highlights?.ghostReviewers?.count ?? 0) === 1 ? 'Ghost' : 'Ghosts'}`}
            tooltip={{
              description: "Reviewers who have given fewer than 3 reviews total. Likely throwaway or farm accounts created solely to boost a specific profile.",
              thresholds: [
                { label: "< 10% ghosts", text: "Clean, no alert" },
                { label: "10–24% ghosts", text: "Suspicious" },
                { label: "25%+ ghosts", text: "Alert" },
              ],
            }}
          >
            {highlights?.ghostReviewers?.pct ?? 0}%
          </HighlightCard>
        </div>

        {/* ── 3-column data grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 items-start" style={{ paddingTop: '32px', gap: '40px' }}>
          {/* Col 1: Mutual Reviews */}
          <div>
            <DataColumn
              title="MUTUAL REVIEWS <4H"
              icon={<img src="/icons/review-white.svg" width="18" height="18" alt="" />}
              found={mutualReviews.length}
            >
              {displayedReviews.map((r) => (
                <ReviewCard key={r.username} {...r} />
              ))}
              {!showAllReviews && mutualReviews.length > REVIEWS_LIMIT && (
                <button
                  onClick={() => setShowAllReviews(true)}
                  className="w-full text-xs font-bold tracking-widest uppercase py-2 text-center cursor-pointer link-fluo mt-12"
                >
                  MORE <span className="link-arrow">➔</span>
                </button>
              )}
            </DataColumn>
          </div>

          {/* Col 2: Mutual Vouches */}
          <div>
            <DataColumn
              title="MUTUAL VOUCHES <4H"
              icon={<img src="/icons/vouch-white.svg" width="18" height="18" alt="" />}
              found={mutualVouches.length}
            >
              {displayedVouches.map((v) => (
                <VouchCard key={v.username} {...v} />
              ))}
              {!showAllVouches && mutualVouches.length > VOUCHES_LIMIT && (
                <button
                  onClick={() => setShowAllVouches(true)}
                  className="w-full text-xs font-bold tracking-widest uppercase py-2 text-center cursor-pointer link-fluo mt-12"
                >
                  MORE <span className="link-arrow">➔</span>
                </button>
              )}
            </DataColumn>
          </div>

          {/* Col 3: AI Detector */}
          <div className="relative">
            <DataColumn
              title="AI DETECTOR"
              found={aiSlops.length}
              showInfo
            >
              {displayedSlops.map((s) => (
                <SlopCard key={s.username} {...s} />
              ))}
              {!showAllSlops && aiSlops.length > SLOPS_LIMIT && (
                <button
                  onClick={() => setShowAllSlops(true)}
                  className="w-full text-xs font-bold tracking-widest uppercase py-2 text-center cursor-pointer link-fluo mt-12"
                >
                  MORE <span className="link-arrow">➔</span>
                </button>
              )}
            </DataColumn>
          </div>
        </div>
      </div>
    </div>
  );
}
