const BASE = 'https://api.ethos.network/api/v2';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserStats {
  review?: {
    received?: { positive?: number; negative?: number; neutral?: number };
    given?: { positive?: number; negative?: number; neutral?: number };
  };
  vouch?: {
    given?: { amountWeiTotal?: string; count?: number };
    received?: { amountWeiTotal?: string; count?: number };
  };
}

interface EthosUser {
  profileId: number | null;
  displayName: string;
  username: string | null;
  score: number;
  humanVerificationStatus: 'REQUESTED' | 'VERIFIED' | 'REVOKED' | null;
  validatorNftCount: number;
  stats: UserStats;
  xpStreakDays?: number;
  influenceFactorPercentile?: number;
}

interface EthosProfile {
  profile: {
    id: number;
    createdAt: number; // unix seconds
  };
}

interface ActivityActor {
  profileId: number;
  name: string;
  username?: string | null;
  score?: number;
}

interface FullUser {
  profileId: number;
  username: string | null;
  displayName: string;
  score: number;
  stats?: UserStats;
}

interface Activity {
  type: string;
  timestamp: number; // unix seconds
  link?: string;
  author: ActivityActor;
  subject: ActivityActor;
  authorUser?: FullUser;
  votes?: { upvotes?: number; downvotes?: number };
  data?: {
    id?: number;
    score?: string;     // "positive" | "negative" | "neutral" (lowercase)
    comment?: string;   // title / short text
    metadata?: string;  // JSON string: { description: string }
    archived?: boolean;
  };
}

// Vouch from POST /vouches — flat shape
interface Vouch {
  id: number;
  authorProfileId: number;
  subjectProfileId: number;
  balance: string; // wei
  archived: boolean;
  comment?: string;
  activityCheckpoints: { vouchedAt: number; unvouchedAt: number };
  authorUser: FullUser;
  subjectUser: FullUser;
}

export interface SlopMatch { label: string; points: number }

export interface ProfileData {
  profile: {
    username: string;
    score: number;
    isValidator: boolean;
    isHumanVerified: boolean;
    joinedDate: string;
    reviewCount: number;
    positivePercent: number;
    ethVouched: string;
  };
  highlights: {
    vouchCluster: { count: number; total: number; pct: number; alert: boolean; borderline: boolean };
    reviewBurst: { count: number; date: string; alert: boolean; borderline: boolean };
    cleanupActivity: { reviews: number; vouches: number; alert: boolean; borderline: boolean };
    ghostReviewers: { count: number; total: number; pct: number; avg: number; alert: boolean; borderline: boolean };
  };
  mutualReviews: Array<{ username: string; hours: number; ethGiven: string; ethReceived: string; link: string; scoreGiven: string; scoreReceived: string }>;
  mutualVouches: Array<{ username: string; hours: number; ethGiven: string; ethReceived: string; link: string }>;
  aiSlops: Array<{ username: string; score: number; preview: string; link: string; matches: SlopMatch[] }>;
  tickerRawData: TickerRawData;
}

export interface TickerRawData {
  vouchesGivenRaw: Array<{ timestamp: number; balanceEth: number; link: string }>;
  vouchesReceivedTimestamps: number[];
  reviewsGivenRaw: Array<{ timestamp: number; votes: number; link: string }>;
  timelineEntries: Array<{ timestamp: number; xpEarned: number }>;
  scoreHistory: Array<{ timestamp: number; score: number }>;
  xpStreakDays: number | null;
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    headers: { 'X-Ethos-Client': 'ethosguard' },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ethos-Client': 'ethosguard' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json();
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function actorUsername(actor: ActivityActor | FullUser): string {
  if (actor.username) return actor.username;
  return (actor as ActivityActor).name ?? (actor as FullUser).displayName ?? `user${actor.profileId}`;
}

function hoursApart(a: number, b: number): number {
  return Math.abs(a - b) / 3600;
}

function weiToEth(wei: string | undefined): number {
  if (!wei) return 0;
  const n = parseFloat(wei);
  return isNaN(n) ? 0 : n / 1e18;
}

function fmtEth(n: number): string {
  return n.toFixed(3);
}

function reviewText(act: Activity): { title: string; body: string } {
  const title = act.data?.comment ?? '';
  let body = '';
  try {
    if (act.data?.metadata) body = JSON.parse(act.data.metadata).description ?? '';
  } catch { /* ignore */ }
  return { title, body };
}

// Fetch all reviews for a profile, paginated
async function fetchReviews(profileId: number, direction: 'given' | 'received', archived = false): Promise<Activity[]> {
  const endpoint = direction === 'given' ? '/activities/profile/given' : '/activities/profile/received';
  const all: Activity[] = [];
  let offset = 0;
  const LIMIT = 100;

  for (let page = 0; page < 20; page++) {
    const data = await post<{ values: Activity[] }>(endpoint, {
      userkey: `profileId:${profileId}`,
      filter: ['review'],
      excludeHistorical: archived ? false : true,
      limit: LIMIT,
      offset,
    });
    if (!data?.values?.length) break;

    const items = archived
      ? data.values.filter(r => r.data?.archived === true)
      : data.values.filter(r => !r.data?.archived);

    all.push(...items);
    if (data.values.length < LIMIT) break;
    offset += LIMIT;
  }
  return all;
}

// Fetch all vouches for a profile, paginated
async function fetchVouches(profileId: number, direction: 'given' | 'received', archived = false): Promise<Vouch[]> {
  const key = direction === 'given' ? 'authorProfileIds' : 'subjectProfileIds';
  const all: Vouch[] = [];
  let offset = 0;

  while (true) {
    const data = await post<{ values: Vouch[]; total: number }>('/vouches', {
      [key]: [profileId], archived, limit: 100, offset,
    });
    if (!data.values?.length) break;
    all.push(...data.values);
    if (all.length >= data.total || data.values.length < 100) break;
    offset += 100;
  }
  return all;
}

// ── AI Slop scorer ─────────────────────────────────────────────────────────────

const AI_PATTERNS: Array<{ re: RegExp; score: number; label: string }> = [
  { re: /[–—]/, score: 35, label: 'Em/En dash' },
  { re: /^"?a (precision|consistent|thoughtful|strategic|clear.minded|detail.oriented|quiet|pragmatic|focused|driven|nuanced|seasoned)/i, score: 20, label: 'Formal title opener' },
  { re: /consistently (brings?|adds?|contributes?|delivers?|highlights?|focuses?|shows?)/i, score: 12, label: '"Consistently [verb]"' },
  { re: /(rare|real) consistency/i, score: 12, label: '"Real/rare consistency"' },
  { re: /whether [a-z].*or [a-z]/i, score: 10, label: '"Whether...or" structure' },
  { re: /not just .{5,40} but/i, score: 10, label: '"Not just...but" contrast' },
  { re: /what sets (him|her|them) apart/i, score: 15, label: '"What sets them apart"' },
  { re: /fueling (clarity|progress|trust)/i, score: 15, label: '"Fueling [noun]"' },
  { re: /(adds?|brings?) (real|genuine|true) value/i, score: 12, label: '"Adds/brings real value"' },
  { re: /clouded by (noise|hype)/i, score: 15, label: '"Clouded by noise/hype"' },
  { re: /solution.first mindset/i, score: 15, label: '"Solution-first mindset"' },
  { re: /collective progress/i, score: 15, label: '"Collective progress"' },
  { re: /straight.to.the.point style/i, score: 15, label: '"Straight-to-the-point style"' },
  { re: /grounded and thoughtful/i, score: 15, label: '"Grounded and thoughtful"' },
  { re: /level.headed and reflective/i, score: 15, label: '"Level-headed and reflective"' },
  { re: /driven by data/i, score: 12, label: '"Driven by data"' },
  { re: /amplif(y|ies|ying) (quality|insights|smart)/i, score: 12, label: '"Amplifies [noun]"' },
  { re: /i had the pleasure/i, score: 15, label: '"I had the pleasure"' },
  { re: /i have had the privilege/i, score: 15, label: '"I have had the privilege"' },
  { re: /it is my (pleasure|honor)/i, score: 15, label: '"It is my pleasure/honor"' },
  { re: /i am pleased to/i, score: 12, label: '"I am pleased to"' },
  { re: /\bdemonstrates?\b/i, score: 10, label: '"Demonstrates"' },
  { re: /\bexemplif(y|ies|ied)\b/i, score: 10, label: '"Exemplifies"' },
  { re: /\bshowcases?\b/i, score: 8, label: '"Showcases"' },
  { re: /\binvaluable\b/i, score: 12, label: '"Invaluable"' },
  { re: /\bexceptional\b/i, score: 10, label: '"Exceptional"' },
  { re: /\boutstanding\b/i, score: 10, label: '"Outstanding"' },
  { re: /\bremarkable\b/i, score: 10, label: '"Remarkable"' },
  { re: /\bcommendable\b/i, score: 12, label: '"Commendable"' },
  { re: /\bexemplary\b/i, score: 12, label: '"Exemplary"' },
  { re: /\bmeticulous\b/i, score: 12, label: '"Meticulous"' },
  { re: /\bprofessionalism\b/i, score: 10, label: '"Professionalism"' },
  { re: /\bexpertise\b/i, score: 8, label: '"Expertise"' },
  { re: /\bit is worth noting\b/i, score: 15, label: '"It is worth noting"' },
  { re: /\bfurthermore\b/i, score: 12, label: '"Furthermore"' },
  { re: /\bmoreover\b/i, score: 12, label: '"Moreover"' },
  { re: /\bin conclusion\b/i, score: 15, label: '"In conclusion"' },
  { re: /\bwithout hesitation\b/i, score: 15, label: '"Without hesitation"' },
  { re: /\bin my experience\b/i, score: 10, label: '"In my experience"' },
  { re: /goes? above and beyond/i, score: 15, label: '"Goes above and beyond"' },
  { re: /proven track record/i, score: 15, label: '"Proven track record"' },
  { re: /wealth of knowledge/i, score: 15, label: '"Wealth of knowledge"' },
  { re: /genuine passion/i, score: 12, label: '"Genuine passion"' },
  { re: /speaks volumes/i, score: 12, label: '"Speaks volumes"' },
  { re: /testament to/i, score: 10, label: '"Testament to"' },
  { re: /\bwholeheartedly\b/i, score: 15, label: '"Wholeheartedly"' },
  { re: /\bseamlessly\b/i, score: 12, label: '"Seamlessly"' },
  { re: /\btirelessly\b/i, score: 12, label: '"Tirelessly"' },
  { re: /\bhighly recommend\b/i, score: 10, label: '"Highly recommend"' },
  { re: /\btruly (exceptional|remarkable|outstanding)\b/i, score: 12, label: '"Truly [adjective]"' },
];

const GENERIC_SHORT = [
  /^(great|good|excellent|amazing|awesome|fantastic|wonderful|solid|trusted?|reliable|legit|honest|professional|credible|reputable)[\s.,!]*$/i,
  /^(highly (recommend|trusted?|reliable|credible))[\s.,!]*$/i,
  /^(good (person|guy|member|reputation|vibes?|community member))[\s.,!]*$/i,
  /^(trusted? (member|person|community member|individual))[\s.,!]*$/i,
  /^(great (person|guy|member|community member|contributor|reputation))[\s.,!]*$/i,
  /(trustworthy and reliable|reliable and trustworthy)/i,
  /(positive (reputation|impact|contributions?))/i,
  /genuine(ly)? (trustworthy|reliable|honest|credible)/i,
];

const WEB3_PATTERNS = [
  /\bser\b/i, /\bgm\b/i, /\bdegen\b/i, /\bbased\b/i, /\bngmi\b/i,
  /\bwagmi\b/i, /\bonchain\b/i, /\balpha\b/i, /\bwen\b/i, /\bngl\b/i,
  /\btbh\b/i, /\bfrfr\b/i, /\blmao\b/i, /\blol\b/i, /\bfren\b/i,
  /\bgiga\b/i, /\bchad\b/i,
];

const ANTI_AI_PATTERNS = [
  /\bcringe\b/i, /\blmao\b/i, /\blmfao\b/i, /\bwtf\b/i, /\bbruh\b/i,
  /\byikes\b/i, /\bdeadass\b/i, /\bunironically\b/i,
  /\bno cap\b/i, /\bnot gonna lie\b/i, /\breal talk\b/i, /\bngl\b/i,
  /\bI('ve| have) known\b/i, /\bI was a (holder|believer|member|user|fan)\b/i,
  /\bback in (the|my|our)\b/i, /\bfor (\d+|a few|several) years\b/i,
  /\bmet (him|her|them) (in|on|at|through)\b/i,
  /\b(great|good) dude\b/i, /\bgreat guy\b/i,
];

export function scoreReview(title: string, body: string): { score: number; matches: SlopMatch[] } {
  const text = [title, body].filter(Boolean).join(' ').trim();
  if (text.length < 10) return { score: 0, matches: [] };

  const matches: SlopMatch[] = [];

  for (const { re, score, label } of AI_PATTERNS) {
    if (re.test(text)) matches.push({ label, points: score });
  }

  for (const p of GENERIC_SHORT) {
    if (p.test(text.trim())) { matches.push({ label: 'Generic filler phrase', points: 25 }); break; }
  }

  if (text.length > 80) {
    const hasWeb3 = WEB3_PATTERNS.some(p => p.test(text));
    if (!hasWeb3) matches.push({ label: 'No Web3 slang (long text)', points: 12 });
    if (!/[!?…]/.test(text)) matches.push({ label: 'No emotional punctuation', points: 8 });
  }

  if (text.length > 120) {
    const contractions = /\b(don't|can't|won't|I'm|I've|it's|that's|isn't|aren't|wasn't|you're)\b/i;
    const formalForms  = /\b(do not|cannot|I am|I have|it is|that is|is not|are not|was not|you are)\b/i;
    if (!contractions.test(text) && formalForms.test(text)) matches.push({ label: 'Formal language, no contractions', points: 12 });
  }

  for (const p of ANTI_AI_PATTERNS) {
    if (p.test(text)) { matches.push({ label: 'Human/slang signals', points: -10 }); break; }
  }

  const raw = matches.reduce((s, m) => s + m.points, 0);
  return { score: Math.min(100, Math.max(0, raw)), matches };
}

// ── Ticker helpers ─────────────────────────────────────────────────────────────

async function fetchScoreHistory(
  pid: number,
): Promise<Array<{ timestamp: number; score: number }>> {
  try {
    const raw = await get<any[]>(`/score/history?userkey=profileId:${pid}`);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((e: any) => ({
        timestamp: e.date ? Math.floor(new Date(e.date).getTime() / 1000) : 0,
        score: Number(e.score ?? 0),
      }))
      .filter(e => e.timestamp > 0 && e.score > 0);
  } catch {
    return [];
  }
}

async function fetchXpTimeline(
  pid: number,
  since: string,
): Promise<Array<{ timestamp: number; xpEarned: number; cumulativeXp: number }>> {
  try {
    let seasonId = 2;
    try {
      const seasons = await get<any>('/xp/seasons');
      const id = seasons?.currentSeason?.id;
      if (typeof id === 'number') seasonId = id;
    } catch { /* use default */ }
    // Response is a raw array: [{ time, xp, cumulativeXp }]
    const raw = await get<any[]>(
      `/xp/user/profileId:${pid}/season/${seasonId}/timeline?granularity=day&since=${since}`
    );
    if (!Array.isArray(raw)) return [];
    return raw
      .map((e: any) => ({
        timestamp: e.time ? Math.floor(new Date(e.time).getTime() / 1000) : 0,
        xpEarned: Number(e.xp ?? 0),
      }))
      .filter(e => e.timestamp > 0);
  } catch {
    return [];
  }
}

// ── Main fetch ─────────────────────────────────────────────────────────────────

export async function fetchProfileData(username: string): Promise<ProfileData> {
  const user = await get<EthosUser>(`/user/by/x/${encodeURIComponent(username)}`);
  if (!user.profileId) throw new Error('No Ethos profile found for this user');

  const pid = user.profileId;
  const since30d = new Date(Date.now() - 30 * 86400 * 1000).toISOString().split('T')[0];

  // Parallel: profile, active reviews, active vouches, ticker data
  const [profileRes, reviewsReceived, reviewsGiven, vouchesReceived, vouchesGiven, timelineEntries, scoreHistory] =
    await Promise.all([
      post<{ values: EthosProfile[] }>('/profiles', { ids: [pid], limit: 1 }),
      fetchReviews(pid, 'received', false),
      fetchReviews(pid, 'given', false),
      fetchVouches(pid, 'received', false),
      fetchVouches(pid, 'given', false),
      fetchXpTimeline(pid, since30d),
      fetchScoreHistory(pid),
    ]);

  const ethosProfile = profileRes.values[0];

  // ── Profile basics ────────────────────────────────────────────────────────

  const stats = user.stats ?? {};
  const posCount = stats.review?.received?.positive ?? 0;
  const negCount = stats.review?.received?.negative ?? 0;
  const neuCount = stats.review?.received?.neutral ?? 0;
  const totalReviews = posCount + negCount + neuCount;
  const positivePercent = totalReviews > 0 ? Math.round((posCount / totalReviews) * 100) : 0;
  const ethVouched = fmtEth(weiToEth(stats.vouch?.received?.amountWeiTotal));

  const joinedDate = ethosProfile?.profile?.createdAt
    ? new Date(ethosProfile.profile.createdAt * 1000)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  // ── Mutual Reviews <24h ───────────────────────────────────────────────────

  const givenBySubject = new Map<number, Activity[]>();
  for (const act of reviewsGiven) {
    const sid = act.subject.profileId;
    if (!givenBySubject.has(sid)) givenBySubject.set(sid, []);
    givenBySubject.get(sid)!.push(act);
  }

  // Vouch ETH to/from each counterpart
  const ethGivenTo = new Map<number, number>();
  const ethReceivedFrom = new Map<number, number>();
  for (const v of vouchesGiven) ethGivenTo.set(v.subjectProfileId, weiToEth(v.balance));
  for (const v of vouchesReceived) ethReceivedFrom.set(v.authorProfileId, weiToEth(v.balance));

  const mutualReviews: ProfileData['mutualReviews'] = [];
  const seen = new Set<number>();
  for (const r of reviewsReceived) {
    const aid = r.author.profileId;
    if (seen.has(aid)) continue;
    for (const g of givenBySubject.get(aid) ?? []) {
      const hrs = hoursApart(r.timestamp, g.timestamp);
      if (hrs <= 4) {
        seen.add(aid);
        mutualReviews.push({
          username: actorUsername(r.author),
          hours: Math.round(hrs * 10) / 10,
          ethGiven: fmtEth(ethGivenTo.get(aid) ?? 0),
          ethReceived: fmtEth(ethReceivedFrom.get(aid) ?? 0),
          link: g.link ?? `https://app.ethos.network/profile/x/${actorUsername(r.author)}`,
          scoreGiven: g.data?.score ?? 'positive',
          scoreReceived: r.data?.score ?? 'positive',
        });
        break;
      }
    }
  }

  // ── Mutual Vouches <24h ───────────────────────────────────────────────────

  const givenVouchBySubject = new Map<number, Vouch>();
  for (const v of vouchesGiven) givenVouchBySubject.set(v.subjectProfileId, v);

  const mutualVouches: ProfileData['mutualVouches'] = [];
  const seenV = new Set<number>();
  for (const rv of vouchesReceived) {
    const aid = rv.authorProfileId;
    if (seenV.has(aid)) continue;
    const gv = givenVouchBySubject.get(aid);
    if (gv) {
      const hrs = hoursApart(rv.activityCheckpoints.vouchedAt, gv.activityCheckpoints.vouchedAt);
      if (hrs <= 4) {
        seenV.add(aid);
        mutualVouches.push({
          username: actorUsername(rv.authorUser),
          hours: Math.round(hrs * 10) / 10,
          ethGiven: fmtEth(ethGivenTo.get(aid) ?? 0),
          ethReceived: fmtEth(ethReceivedFrom.get(aid) ?? 0),
          link: `https://app.ethos.network/activity/vouch/${gv.id}`,
        });
      }
    }
  }

  // ── AI Slops (analyze received positive reviews) ──────────────────────────

  const posReviews = reviewsGiven.filter(a => a.data?.score === 'positive');
  const scoredReviews = posReviews.map(a => {
    const { title, body } = reviewText(a);
    const { score: slopScore, matches } = scoreReview(title, body);
    return { actor: a.subject, title, body, slopScore, matches, link: a.link ?? '' };
  });

  const aiSlops = scoredReviews
    .filter(r => r.slopScore >= 30)
    .sort((a, b) => b.slopScore - a.slopScore)
    .slice(0, 10)
    .map(r => ({
      username: actorUsername(r.actor),
      score: r.slopScore,
      preview: `${r.title} ${r.body}`.trim().slice(0, 120) + ' [...]',
      link: r.link,
      matches: r.matches,
    }));

  const allScores = scoredReviews.map(r => r.slopScore);
  const avgSlop = allScores.length > 0 ? allScores.reduce((s, n) => s + n, 0) / allScores.length : 0;
  const aiSlopAlert = avgSlop >= 28 || allScores.filter(s => s >= 30).length >= 3;
  void aiSlopAlert; // alert computed in column badge logic on frontend

  // ── Review Burst (sliding 24h window) ────────────────────────────────────

  let burstCount = 0, burstDate = '';
  if (reviewsReceived.length >= 5) {
    const sorted = [...reviewsReceived].sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < sorted.length; i++) {
      let count = 1;
      for (let j = i + 1; j < sorted.length; j++) {
        if (hoursApart(sorted[j].timestamp, sorted[i].timestamp) <= 24) count++;
        else break;
      }
      if (count > burstCount) {
        burstCount = count;
        burstDate = new Date(sorted[i].timestamp * 1000)
          .toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
      }
    }
  }
  const burstAlert = burstCount >= 7;
  const burstBorderline = burstCount >= 4 && burstCount < 7;

  // ── Cleanup Activity ──────────────────────────────────────────────────────

  const [archivedReviewsGiven, archivedVouchesGiven] = await Promise.all([
    fetchReviews(pid, 'given', true),
    fetchVouches(pid, 'given', true),
  ]);
  const archivedReviewCount = archivedReviewsGiven.length;
  const archivedVouchCount = archivedVouchesGiven.length;
  const cleanupTotal = archivedReviewCount + archivedVouchCount;
  const cleanupAlert = cleanupTotal >= 10;
  const cleanupBorderline = cleanupTotal >= 1 && cleanupTotal < 10;

  // ── Ghost Reviewers ───────────────────────────────────────────────────────
  // Ghost = reviewer who has given fewer than 3 reviews total (likely a throwaway account)

  const uniqueReviewerIds = [...new Set(reviewsReceived.map(a => a.author.profileId))];
  const reviewerGivenCounts = await Promise.allSettled(
    uniqueReviewerIds.map(id =>
      post<{ total: number }>('/activities/profile/given', {
        userkey: `profileId:${id}`, filter: ['review'], limit: 1,
      }).then(r => ({ id, total: r.total ?? 0 }))
    )
  );
  let ghostTotal = 0;
  let ghostSumReviews = 0;
  for (const result of reviewerGivenCounts) {
    if (result.status === 'fulfilled' && result.value.total < 3) {
      ghostTotal++;
      ghostSumReviews += result.value.total;
    }
  }
  const ghostAvg = ghostTotal > 0 ? Math.round((ghostSumReviews / ghostTotal) * 10) / 10 : 0;
  const ghostPct = uniqueReviewerIds.length > 0 ? Math.round((ghostTotal / uniqueReviewerIds.length) * 100) : 0;
  const ghostAlert = ghostPct >= 25;
  const ghostBorderline = ghostPct >= 10 && ghostPct < 25;

  // ── Mutual Vouch Cluster ──────────────────────────────────────────────────

  const givenTo = new Set(vouchesGiven.map(v => v.subjectProfileId));
  const receivedFrom = new Set(vouchesReceived.map(v => v.authorProfileId));
  const mutualIds = [...givenTo].filter(id => receivedFrom.has(id));
  const vouchClusterCount = mutualIds.length;
  const vouchClusterTotal = vouchesGiven.length;
  const vouchClusterPct = vouchClusterTotal > 0 ? Math.round((vouchClusterCount / vouchClusterTotal) * 100) : 0;
  const vouchClusterAlert = vouchClusterPct >= 60;
  const vouchClusterBorderline = vouchClusterPct >= 30 && vouchClusterPct < 60;

  // ── Result ────────────────────────────────────────────────────────────────

  const tickerRawData: TickerRawData = {
    vouchesGivenRaw: vouchesGiven.map(v => ({
      timestamp: v.activityCheckpoints.vouchedAt,
      balanceEth: weiToEth(v.balance),
      link: `https://app.ethos.network/activity/vouch/${v.id}`,
    })),
    vouchesReceivedTimestamps: vouchesReceived.map(v => v.activityCheckpoints.vouchedAt),
    reviewsGivenRaw: reviewsGiven.map(r => ({
      timestamp: r.timestamp,
      votes: r.votes?.upvotes ?? 0,
      link: r.link ?? '',
    })),
    timelineEntries,
    scoreHistory,
    xpStreakDays: user.xpStreakDays ?? null,
  };

  return {
    profile: {
      username: user.username ?? username,
      score: user.score,
      isValidator: (user.validatorNftCount ?? 0) > 0,
      isHumanVerified: user.humanVerificationStatus === 'VERIFIED',
      joinedDate,
      reviewCount: totalReviews,
      positivePercent,
      ethVouched,
    },
    highlights: {
      vouchCluster: { count: vouchClusterCount, total: vouchClusterTotal, pct: vouchClusterPct, alert: vouchClusterAlert, borderline: vouchClusterBorderline },
      reviewBurst: { count: burstCount, date: burstDate, alert: burstAlert, borderline: burstBorderline },
      cleanupActivity: { reviews: archivedReviewCount, vouches: archivedVouchCount, alert: cleanupAlert, borderline: cleanupBorderline },
      ghostReviewers: { count: ghostTotal, total: uniqueReviewerIds.length, pct: ghostPct, avg: ghostAvg, alert: ghostAlert, borderline: ghostBorderline },
    },
    mutualReviews,
    mutualVouches,
    aiSlops,
    tickerRawData,
  };
}
