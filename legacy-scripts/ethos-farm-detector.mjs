// Ethos — Farm Detector
// Usage simple  : node ethos-farm-detector.mjs <username>
// Cross-profil  : node ethos-farm-detector.mjs <username1> <username2>
// Ex            : node ethos-farm-detector.mjs blockchilI fuckinares

const USERNAME  = process.argv[2];
const USERNAME2 = process.argv[3] ?? null;
if (!USERNAME) {
  console.error("❌ Usage : node ethos-farm-detector.mjs <username> [username2]");
  process.exit(1);
}

const BASE = "https://api.ethos.network/api/v2";
const HEADERS = { "Content-Type": "application/json", "X-Ethos-Client": "ethoscan" };

// ─── Helpers ────────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", headers: HEADERS, body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  return res.json();
}

function hoursApart(tsA, tsB) {
  return Math.abs(tsA - tsB) / 3600;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / arr.length);
}

// ─── Fetch profile ───────────────────────────────────────────────────────────

async function fetchUser(input) {
  const isNumeric = /^\d+$/.test(String(input));
  const url = isNumeric
    ? `${BASE}/user/by/profile-id/${input}`
    : `${BASE}/user/by/x/${input}`;
  const res = await fetch(url, { headers: HEADERS });
  const data = await res.json();
  if (data?.profileId) return data;
  return null;
}

// ─── Fetch all vouches for a profile ─────────────────────────────────────────

async function fetchVouches(profileId, direction, archived = false) {
  let all = [], offset = 0;
  while (true) {
    const key = direction === "given" ? "authorProfileIds" : "subjectProfileIds";
    const data = await post("/vouches", { [key]: [profileId], archived, limit: 100, offset });
    if (!data.values) break;
    all.push(...data.values);
    if (all.length >= data.total || data.values.length < 100) break;
    offset += 100;
  }
  return all;
}

// ─── Fetch all reviews for a profile ─────────────────────────────────────────

async function fetchReviews(profileId, direction, archived = false) {
  const endpoint = direction === "given"
    ? "/activities/profile/given"
    : "/activities/profile/received";
  const userkey = `profileId:${profileId}`;
  let all = [], offset = 0;
  const LIMIT = 100;
  const MAX_PAGES = 20;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await post(endpoint, {
      userkey,
      filter: ["review"],
      excludeHistorical: archived ? false : true,
      limit: LIMIT,
      offset,
    });
    if (!data?.values?.length) break;

    // archived flag: includeArchived pas supporté, on filtre client-side
    const items = archived
      ? data.values.filter(r => r.data?.archived === true)
      : data.values.filter(r => !r.data?.archived);

    all.push(...items);
    if (data.values.length < LIMIT) break;
    offset += LIMIT;
  }
  return all;
}

// ─── CHECK 1 : Mutual vouches dans 24h ───────────────────────────────────────

function checkMutualVouches24h(vouchesGiven, vouchesReceived) {
  const flags = [];
  for (const given of vouchesGiven) {
    const subjectId = given.subjectProfileId;
    const tsGiven = given.activityCheckpoints.vouchedAt;
    const reciprocal = vouchesReceived.find(r => r.authorProfileId === subjectId);
    if (reciprocal) {
      const tsReceived = reciprocal.activityCheckpoints.vouchedAt;
      const hours = hoursApart(tsGiven, tsReceived);
      if (hours <= 24) {
        flags.push({
          subject: given.subjectUser?.username ?? subjectId,
          hoursApart: hours.toFixed(1),
          ethGiven: (Number(given.balance) / 1e18).toFixed(3),
          ethReceived: (Number(reciprocal.balance) / 1e18).toFixed(3),
        });
      }
    }
  }
  return flags;
}

// ─── CHECK 2 : Mutual reviews dans 24h ───────────────────────────────────────

function checkMutualReviews24h(reviewsGiven, reviewsReceived) {
  const flags = [];
  for (const given of reviewsGiven) {
    const subjectId = given.subject?.profileId;
    const tsGiven = given.timestamp;
    const reciprocal = reviewsReceived.find(r => r.author?.profileId === subjectId);
    if (reciprocal) {
      const hours = hoursApart(tsGiven, reciprocal.timestamp);
      if (hours <= 24) {
        flags.push({
          subject: given.subject?.username ?? subjectId,
          hoursApart: hours.toFixed(1),
          sentimentGiven: given.data?.score,
          sentimentReceived: reciprocal.data?.score,
        });
      }
    }
  }
  return flags;
}

// ─── CHECK 3 : Cluster detection (A→B→C→A) ───────────────────────────────────

function checkCluster(vouchesGiven, vouchesReceived) {
  // Build a map of who the subject also vouched to
  const givenTo = new Set(vouchesGiven.map(v => v.subjectProfileId));
  const receivedFrom = new Set(vouchesReceived.map(v => v.authorProfileId));

  // Cluster: people in both given and received
  const mutual = [...givenTo].filter(id => receivedFrom.has(id));

  // For each mutual, check if they also vouch each other (triangle)
  const clusters = [];
  for (const idB of mutual) {
    for (const idC of mutual) {
      if (idB === idC) continue;
      // Does B vouch C? We can't easily check without fetching B's vouches
      // Flag the mutual pair for now
      clusters.push(idB);
    }
  }
  return [...new Set(clusters)];
}

// ─── CHECK 4 : Review burst (X reviews reçues en < Y heures) ─────────────────

function checkReviewBurst(reviewsReceived, maxHours = 24, threshold = 5) {
  if (reviewsReceived.length < threshold) return null;
  const sorted = [...reviewsReceived].sort((a, b) => (a.timestamp ?? a.createdAt) - (b.timestamp ?? b.createdAt));
  const bursts = [];
  for (let i = 0; i < sorted.length; i++) {
    let count = 1;
    for (let j = i + 1; j < sorted.length; j++) {
      const hours = ((sorted[j].timestamp ?? sorted[j].createdAt) - (sorted[i].timestamp ?? sorted[i].createdAt)) / 3600;
      if (hours <= maxHours) count++;
      else break;
    }
    if (count >= threshold) {
      bursts.push({
        count,
        window: maxHours,
        startDate: new Date((sorted[i].timestamp ?? sorted[i].createdAt) * 1000).toLocaleDateString("en-US"),
      });
    }
  }
  // Deduplicate
  return bursts.length > 0
    ? bursts.reduce((max, b) => b.count > max.count ? b : max, bursts[0])
    : null;
}

// ─── CHECK 5 : Low activity reviewers ─────────────────────────────────────────

async function checkLowActivityReviewers(reviewsReceived) {
  const positiveReviews = reviewsReceived.filter(r => r.score === "positive");
  if (positiveReviews.length < 3) return [];

  // Group by author
  const authorMap = {};
  for (const r of positiveReviews) {
    const id = r.author?.profileId ?? r.authorProfileId;
    const authorUser = r.authorUser ?? r.author;
    if (!authorMap[id]) authorMap[id] = { username: authorUser?.username ?? id, count: 0, xp: authorUser?.xpTotal ?? 0, reviewsGiven: 0 };
    authorMap[id].count++;
    const stats = authorUser?.stats?.review?.received;
    authorMap[id].reviewsGiven = stats
      ? (stats.positive ?? 0) + (stats.neutral ?? 0) + (stats.negative ?? 0)
      : 0;
  }

  // Flag: gave positive review but has very low activity (< 5 reviews total)
  return Object.values(authorMap).filter(a => a.reviewsGiven <= 3 && a.count >= 1);
}

// ─── CHECK 6 : Uniform review length ─────────────────────────────────────────

function checkUniformLength(reviewsReceived) {
  const lengths = reviewsReceived
    .map(r => (r.data?.comment ?? r.comment ?? "").length)
    .filter(l => l > 0);
  if (lengths.length < 5) return null;
  const sd = stdDev(lengths);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  return { stdDev: sd.toFixed(1), mean: mean.toFixed(0), suspicious: sd < 20 && mean > 30 };
}

// ─── CHECK 9b : Uniform title pattern ────────────────────────────────────────

function checkTitlePattern(reviewsGiven) {
  const titles = reviewsGiven
    .map(r => (r.data?.comment ?? r.comment ?? "").trim())
    .filter(t => t.length > 0);
  if (titles.length < 5) return null;

  // Compter les titres qui commencent par "A [Mot]"
  const aiTitleCount = titles.filter(t => /^"?a [a-z]/i.test(t)).length;
  const pct = Math.round((aiTitleCount / titles.length) * 100);

  return { aiTitleCount, total: titles.length, pct, suspicious: pct >= 50 && aiTitleCount >= 4 };
}

// ─── CHECK 9 : AI Slop detector ───────────────────────────────────────────────

const AI_PATTERNS = [
  // Template "A [Adj] [Noun] Who/With/For" dans le titre — très fréquent en AI Ethos
  { re: /^"?a (precision|consistent|thoughtful|strategic|clear.minded|detail.oriented|quiet|pragmatic|focused|driven|nuanced|seasoned)/i, score: 20, label: "AI title template: 'A [Adj]...'" },

  // Em dash / en dash comme séparateur — signature AI très forte, quasi-absent en Web3 natif
  // Couvre : — (U+2014), – (U+2013), avec ou sans espaces
  { re: /[–—]/, score: 35, label: "🚨 AI style: em/en dash" },

  // Formules de corps typiques du template blockchilI
  { re: /consistently (brings?|adds?|contributes?|delivers?|highlights?|focuses?|shows?)/i, score: 12, label: "AI body: 'consistently [verb]'" },
  { re: /(rare|real) consistency/i,         score: 12, label: "AI body: 'rare/real consistency'" },
  { re: /whether [a-z].*or [a-z]/i,            score: 10, label: "AI body: 'whether X or Y'" },
  { re: /not just .{5,40} but/i,             score: 10, label: "AI body: 'not just X but'" },
  { re: /what sets (him|her|them) apart/i,   score: 15, label: "AI body: 'what sets him apart'" },
  { re: /fueling (clarity|progress|trust)/i, score: 15, label: "AI body: 'fueling clarity'" },
  { re: /(adds?|brings?) (real|genuine|true) value/i, score: 12, label: "AI body: 'adds real value'" },
  { re: /clouded by (noise|hype)/i,           score: 15, label: "AI body: 'clouded by noise'" },
  { re: /solution.first mindset/i,            score: 15, label: "AI body: 'solution-first mindset'" },
  { re: /collective progress/i,               score: 15, label: "AI body: 'collective progress'" },
  { re: /straight.to.the.point style/i,       score: 15, label: "AI body: 'straight to the point style'" },
  { re: /grounded and thoughtful/i,           score: 15, label: "AI body: 'grounded and thoughtful'" },
  { re: /level.headed and reflective/i,       score: 15, label: "AI body: 'level-headed and reflective'" },
  { re: /driven by data/i,                    score: 12, label: "AI body: 'driven by data'" },
  { re: /amplif(y|ies|ying) (quality|insights|smart)/i, score: 12, label: "AI body: 'amplifying quality'" },


  // Formules d'ouverture
  { re: /i had the pleasure/i,          score: 15, label: "opener: 'had the pleasure'" },
  { re: /i have had the privilege/i,    score: 15, label: "opener: 'had the privilege'" },
  { re: /it is my (pleasure|honor)/i,   score: 15, label: "opener: 'it is my pleasure/honor'" },
  { re: /i am pleased to/i,             score: 12, label: "opener: 'I am pleased to'" },

  // Verbes et adjectifs corporate
  { re: /\bdemonstrates?\b/i,           score: 10, label: "corp: 'demonstrates'" },
  { re: /\bexemplif(y|ies|ied)\b/i,     score: 10, label: "corp: 'exemplifies'" },
  { re: /\bshowcases?\b/i,              score:  8, label: "corp: 'showcases'" },
  { re: /\binvaluable\b/i,              score: 12, label: "corp: 'invaluable'" },
  { re: /\bexceptional\b/i,             score: 10, label: "corp: 'exceptional'" },
  { re: /\boutstanding\b/i,             score: 10, label: "corp: 'outstanding'" },
  { re: /\bremarkable\b/i,              score: 10, label: "corp: 'remarkable'" },
  { re: /\bcommendable\b/i,             score: 12, label: "corp: 'commendable'" },
  { re: /\bexemplary\b/i,               score: 12, label: "corp: 'exemplary'" },
  { re: /\bmeticulous\b/i,              score: 12, label: "corp: 'meticulous'" },
  { re: /\bprofessionalism\b/i,         score: 10, label: "corp: 'professionalism'" },
  { re: /\bexpertise\b/i,               score:  8, label: "corp: 'expertise'" },

  // Structures de transition
  { re: /\bit is worth noting\b/i,      score: 15, label: "transition: 'it is worth noting'" },
  { re: /\bfurthermore\b/i,             score: 12, label: "transition: 'furthermore'" },
  { re: /\bmoreover\b/i,                score: 12, label: "transition: 'moreover'" },
  { re: /\bin conclusion\b/i,           score: 15, label: "transition: 'in conclusion'" },
  { re: /\bwithout hesitation\b/i,      score: 15, label: "transition: 'without hesitation'" },
  { re: /\bin my experience\b/i,        score: 10, label: "transition: 'in my experience'" },

  // Superlatifs vides
  { re: /goes? above and beyond/i,      score: 15, label: "hype: 'above and beyond'" },
  { re: /proven track record/i,         score: 15, label: "hype: 'proven track record'" },
  { re: /wealth of knowledge/i,         score: 15, label: "hype: 'wealth of knowledge'" },
  { re: /genuine passion/i,             score: 12, label: "hype: 'genuine passion'" },
  { re: /speaks volumes/i,              score: 12, label: "hype: 'speaks volumes'" },
  { re: /testament to/i,                score: 10, label: "hype: 'testament to'" },
  { re: /\bwholeheartedly\b/i,          score: 15, label: "hype: 'wholeheartedly'" },
  { re: /\bseamlessly\b/i,              score: 12, label: "hype: 'seamlessly'" },
  { re: /\btirelessly\b/i,              score: 12, label: "hype: 'tirelessly'" },
  { re: /\bhighly recommend\b/i,        score: 10, label: "hype: 'highly recommend'" },
  { re: /\btruly (exceptional|remarkable|outstanding)/i, score: 12, label: "hype: 'truly exceptional/...'" },
];

const WEB3_PATTERNS = [
  /\bser\b/i, /\bgm\b/i, /\bdegen\b/i, /\bbased\b/i, /\bngmi\b/i,
  /\bwagmi\b/i, /\bonchain\b/i, /\balpha\b/i, /\bwen\b/i, /\bngl\b/i,
  /\btbh\b/i, /\bfrfr\b/i, /\blmao\b/i, /\blol\b/i, /\bngl\b/i,
  /\bfren\b/i, /\bgiga\b/i, /\bchad\b/i, /\bosh?i\b/i, /\bngmi\b/i,
];

const ANTI_AI_PATTERNS = [
  // Slang Web3/internet authentique
  /\bcringe\b/i, /\blmao\b/i, /\blmfao\b/i, /\bwtf\b/i, /\bbruh\b/i,
  /\byikes\b/i, /\bdeadass\b/i, /\bunironically\b/i,
  /\bno cap\b/i, /\bnot gonna lie\b/i, /\breal talk\b/i, /\bngl\b/i,
  // Narration personnelle — signal humain fort
  /\bI('ve| have) known\b/i, /\bI was a (holder|believer|member|user|fan)\b/i,
  /\bback in (the|my|our)\b/i, /\bfor (\d+|a few|several) years\b/i,
  /\bmet (him|her|them) (in|on|at|through)\b/i,
  /\b(great|good) dude\b/i, /\bgreat guy\b/i,
];

function scoreReview(text) {
  if (!text || text.length < 10) return null;

  let raw = 0;
  const matched = [];

  // Pattern matching
  for (const p of AI_PATTERNS) {
    if (p.re.test(text)) {
      raw += p.score;
      matched.push(p.label);
    }
  }

  // Patterns courts — generic praise sans substance (fréquent dans les reviews AI courtes)
  const GENERIC_SHORT = [
    /^(great|good|excellent|amazing|awesome|fantastic|wonderful|solid|trusted?|reliable|legit|honest|professional|credible|reputable)[\s.,!]*$/i,
    /^(highly (recommend|trusted?|reliable|credible))[\s.,!]*$/i,
    /^(good (person|guy|member|reputation|vibes?|community member))[\s.,!]*$/i,
    /^(trusted? (member|person|community member|individual))[\s.,!]*$/i,
    /^(great (person|guy|member|community member|contributor|reputation))[\s.,!]*$/i,
    /(trustworthy and reliable|reliable and trustworthy)/i,
    /(positive (reputation|impact|contributions?))/i,
    /genuine(ly)? (trustworthy|reliable|honest|credible)/i,
  ];
  for (const p of GENERIC_SHORT) {
    if (p.test(text.trim())) {
      raw += 25; matched.push("generic filler phrase"); break;
    }
  }

  // Signaux structurels — seulement sur textes > 80 chars
  if (text.length > 80) {
    const hasWeb3 = WEB3_PATTERNS.some(p => p.test(text));
    if (!hasWeb3) { raw += 12; matched.push("no Web3 slang"); }

    if (!/[!?…]/.test(text)) { raw += 8; matched.push("no emotion markers"); }
  }

  // Contractions — seulement pertinent sur textes > 120 chars
  if (text.length > 120) {
    const contractions = /\b(don't|can't|won't|I'm|I've|it's|that's|isn't|aren't|wasn't|you're)\b/i;
    const formalForms  = /\b(do not|cannot|I am|I have|it is|that is|is not|are not|was not|you are)\b/i;
    if (!contractions.test(text) && formalForms.test(text)) {
      raw += 12; matched.push("no contractions");
    }
  }

  // Longueur élevée
  // Longueur : une review longue est plutôt humaine
  // Longueur : signal neutre — ni bonus ni malus

  // Bonus anti-AI — signaux d'écriture humaine authentique
  // Bonus anti-AI — slang Web3 authentique uniquement
  let antiRaw = 0;
  for (const p of ANTI_AI_PATTERNS) {
    if (p.test(text)) { antiRaw += 10; break; }
  }
  raw = Math.max(0, raw - antiRaw);
  if (antiRaw > 0) matched.push(`-${antiRaw} (human slang)`);
  // Bonus anti-AI — signaux d'écriture humaine authentique
  // Cap à 100
  const pct = Math.min(100, raw);
  return { pct, matched };
}

function checkAISlop(reviewsGiven) {
  const results = [];
  for (const r of reviewsGiven) {
    // Ignorer les reviews négatives — faux positifs trop fréquents
    if ((r.data?.score ?? r.score) === "negative") continue;

    const title = r.data?.comment ?? r.comment ?? "";
    let body = "";
    try { body = JSON.parse(r.data?.metadata ?? "{}").description ?? ""; } catch {}
    const text = [title, body].filter(Boolean).join(" ");
    const res = scoreReview(text);
    if (!res) continue;
    const preview = (body || title).slice(0, 80).replace(/\n/g, " ");
    results.push({
      subject: r.subjectUser?.username ?? r.data?.subjectProfileId ?? "?",
      pct: res.pct,
      matched: res.matched,
      preview,
    });
  }

  results.sort((a, b) => b.pct - a.pct);

  const avgPct = results.length
    ? Math.round(results.reduce((s, r) => s + r.pct, 0) / results.length)
    : 0;

  const suspicious = results.filter(r => r.pct >= 30);
  return { avgPct, suspicious, total: results.length };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔍 Analyzing @${USERNAME}...\n`);

  // 1. Get profile
  const user = await fetchUser(USERNAME);
  if (!user || !user.profileId) {
    console.error(`❌ Profil @${USERNAME} introuvable.`);
    process.exit(1);
  }

  const profileId = user.profileId;
  const score = user.score ?? "?";
  const name = user.displayName ?? USERNAME;
  console.log(`👤 ${name} (@${USERNAME}) — Score : ${score}\n`);

  // 2. Fetch data
  console.log("⏳ Fetching vouches...");
  const [vouchesGiven, vouchesReceived, vouchesArchivedGiven, vouchesArchivedReceived] = await Promise.all([
    fetchVouches(profileId, "given", false),
    fetchVouches(profileId, "received", false),
    fetchVouches(profileId, "given", true),
    fetchVouches(profileId, "received", true),
  ]);

  console.log("⏳ Fetching reviews...");
  const [reviewsGiven, reviewsReceived, reviewsArchivedGiven, reviewsArchivedReceived] = await Promise.all([
    fetchReviews(profileId, "given", false),
    fetchReviews(profileId, "received", false),
    fetchReviews(profileId, "given", true),
    fetchReviews(profileId, "received", true),
  ]);

  console.log(`📊 Vouches : ${vouchesGiven.length} given / ${vouchesReceived.length} received (+ ${vouchesArchivedGiven.length} unvouched / ${vouchesArchivedReceived.length} unvouched received)`);
  console.log(`📊 Reviews : ${reviewsGiven.length} given / ${reviewsReceived.length} received (+ ${reviewsArchivedGiven.length} archived given / ${reviewsArchivedReceived.length} archived received)\n`);

  let flagCount = 0;

  // ── Check 1 : Mutual vouches 24h
  const mutualVouches = checkMutualVouches24h(vouchesGiven, vouchesReceived);
  if (mutualVouches.length > 0) {
    flagCount++;
    console.log(`🔴 [V] Mutual vouches < 24h : ${mutualVouches.length} found`);
    mutualVouches.forEach(f =>
      console.log(`   ↔️  @${f.subject} | ${f.hoursApart}h apart | ${f.ethGiven} ETH given / ${f.ethReceived} ETH received`)
    );
  } else {
    console.log(`✅ [V] Mutual vouches < 24h : none`);
  }

  // ── Check 2 : Mutual reviews 24h
  const mutualReviews = checkMutualReviews24h(reviewsGiven, reviewsReceived);
  if (mutualReviews.length > 0) {
    flagCount++;
    console.log(`\n🔴 [R] Mutual reviews < 24h : ${mutualReviews.length} found`);
    mutualReviews.forEach(f =>
      console.log(`   ↔️  @${f.subject} | ${f.hoursApart}h apart | gave ${f.sentimentGiven} / received ${f.sentimentReceived}`)
    );
  } else {
    console.log(`\n✅ [R] Mutual reviews < 24h : none`);
  }

  // ── Check 3 : Cluster
  const cluster = checkCluster(vouchesGiven, vouchesReceived);
  if (cluster.length > 0) {
    flagCount++;
    console.log(`\n🟡 [V] Vouch cluster : ${cluster.length} mutual profiles`);
  } else {
    console.log(`\n✅ [V] Vouch cluster : none`);

  }

  // ── Check 4 : Review burst
  const burst = checkReviewBurst(reviewsReceived);
  if (burst) {
    flagCount++;
    console.log(`\n🔴 [R] Review burst : ${burst.count} reviews in 24h (starting ${burst.startDate})`);
  } else {
    console.log(`\n✅ [R] Review burst : none`);
  }

  // ── Check 5 : Low activity reviewers
  const lowActivity = await checkLowActivityReviewers(reviewsReceived);
  if (lowActivity.length > 0) {
    flagCount++;
    console.log(`\n🟡 [R] Ghost reviewers (≤3 reviews total) : ${lowActivity.length} found`);
    lowActivity.forEach(a =>
      console.log(`   👤 @${a.username} — ${a.reviewsGiven} total reviews given`)
    );
  } else {
    console.log(`\n✅ [R] Ghost reviewers : none`);
  }

  // ── Check 6 : Uniform length
  const uniformity = checkUniformLength(reviewsReceived);
  if (uniformity?.suspicious) {
    flagCount++;
    console.log(`\n🟡 [R] Review length suspiciously uniform`);
    console.log(`   Avg : ${uniformity.mean} chars | StdDev : ${uniformity.stdDev}`);
  } else if (uniformity) {
    console.log(`\n✅ [R] Review length : normal (avg ${uniformity.mean} chars, stdDev ${uniformity.stdDev})`);
  } else {
    console.log(`\n✅ [R] Review length : not enough data`);
  }

  // ── Check 7 : Archived/unvouched cleanup
  const totalArchivedVouches = vouchesArchivedGiven.length + vouchesArchivedReceived.length;
  const totalArchivedReviews = reviewsArchivedGiven.length + reviewsArchivedReceived.length;
  if (totalArchivedVouches > 3 || totalArchivedReviews > 3) {
    flagCount++;
    console.log(`\n🟡 [V/R] Suspicious cleanup (unvouches / archived reviews)`);
    if (totalArchivedVouches > 0) console.log(`   🗑️  ${vouchesArchivedGiven.length} unvouches given / ${vouchesArchivedReceived.length} unvouches received`);
    if (totalArchivedReviews > 0) console.log(`   🗑️  ${reviewsArchivedGiven.length} reviews archived given / ${reviewsArchivedReceived.length} reviews archived received`);
  } else {
    console.log(`\n✅ [V/R] Cleanup : normal (${totalArchivedVouches} unvouches, ${totalArchivedReviews} archived reviews)`);
  }

  // ── Check 9b : Title pattern
  const titlePattern = checkTitlePattern(reviewsGiven);
  if (titlePattern?.suspicious) {
    flagCount++;
    console.log(`
🤖 [R] Uniform AI title pattern : ${titlePattern.aiTitleCount}/${titlePattern.total} titles start with "A [Adj]..." (${titlePattern.pct}%)`);
  } else if (titlePattern) {
    console.log(`
✅ [R] Title pattern : varied (${titlePattern.aiTitleCount}/${titlePattern.total} generic titles)`);
  }

  // ── Check 9 : AI Slop
  const slop = checkAISlop(reviewsGiven);
  if (slop.total === 0) {
    console.log(`\n✅ [R] AI slop : no reviews to analyze`);
  } else if (slop.avgPct >= 28 || slop.suspicious.length >= 3) {
    flagCount++;
    console.log(`\n🤖 [R] AI slop detected — avg score ${slop.avgPct}/100 (${slop.suspicious.length}/${slop.total} suspicious reviews)`);
    slop.suspicious.slice(0, 5).forEach(r => {
      console.log(`   ⚠️  @${r.subject} [${r.pct}/100] — "${r.preview}"`);
      console.log(`       → ${r.matched.join(", ")}`);
    });
  } else if (slop.suspicious.length > 0) {
    console.log(`\n✅ [R] AI slop : low (avg ${slop.avgPct}/100) — ${slop.suspicious.length} borderline review(s)`);
    slop.suspicious.forEach(r => {
      console.log(`   ℹ️  @${r.subject} [${r.pct}/100] — "${r.preview}"`);
      console.log(`       → ${r.matched.join(", ")}`);
    });
  } else {
    console.log(`\n✅ [R] AI slop : clean (avg ${slop.avgPct}/100)`);
  }

  // ── Check 8 : Cross-profile reviewer overlap (mode 2 profils)
  if (USERNAME2) {
    console.log("\n⏳ Fetching second profile for cross-analysis...");
    const user2 = await fetchUser(USERNAME2);
    if (!user2) {
      console.log(`\n⚠️  [R] Reviewer overlap : could not find @${USERNAME2}`);
    } else {
      console.log(`👤 Comparing with ${user2.displayName} (@${user2.username})\n`);
      const overlap = await checkReviewerOverlap(profileId, user2.profileId, USERNAME, USERNAME2);
      if (overlap.suspicious) {
        flagCount++;
        console.log(`\n🔴 [R] Reviewer overlap : ${overlap.overlap.length} shared reviewers`);
        console.log(`   ${overlap.pctA}% of @${USERNAME}'s reviews / ${overlap.pctB}% of @${USERNAME2}'s reviews`);
        console.log(`   Shared : ${overlap.names.slice(0, 10).map(n => "@" + n).join(", ")}${overlap.overlap.length > 10 ? "..." : ""}`);
      } else {
        console.log(`\n✅ [R] Reviewer overlap : low (${overlap.overlap.length} shared, ${overlap.pctA}% / ${overlap.pctB}%)`);
      }
    }
  }

  // ── Summary
  console.log(`\n${"─".repeat(50)}`);
  if (flagCount === 0) {
    console.log(`✅ CLEAN — No suspicious patterns detected for @${USERNAME}`);
  } else {
    const risk = flagCount >= 3 ? "🔴 HIGH RISK" : flagCount === 2 ? "🟠 MEDIUM RISK" : "🟡 LOW RISK";
    console.log(`${risk} — ${flagCount} flag(s) detected for @${USERNAME}`);
  }
}


// ─── CHECK 8 : Cross-profile reviewer overlap ─────────────────────────────────

async function checkReviewerOverlap(profileIdA, profileIdB, usernameA, usernameB) {
  const [reviewsA, reviewsB] = await Promise.all([
    fetchReviews(profileIdA, "received", false),
    fetchReviews(profileIdB, "received", false),
  ]);

  const reviewersA = new Map(reviewsA.map(r => [r.author?.profileId, r.author?.username ?? r.author?.profileId]));
  const reviewersB = new Map(reviewsB.map(r => [r.author?.profileId, r.author?.username ?? r.author?.profileId]));

  const overlap = [...reviewersA.keys()].filter(id => reviewersB.has(id));
  const pctA = reviewsA.length > 0 ? ((overlap.length / reviewsA.length) * 100).toFixed(0) : 0;
  const pctB = reviewsB.length > 0 ? ((overlap.length / reviewsB.length) * 100).toFixed(0) : 0;

  return {
    overlap,
    names: overlap.map(id => reviewersA.get(id)),
    totalA: reviewsA.length,
    totalB: reviewsB.length,
    pctA,
    pctB,
    suspicious: overlap.length >= 5 || pctA >= 30 || pctB >= 30,
  };
}

main().catch(console.error);
