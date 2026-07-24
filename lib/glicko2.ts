/**
 * Glicko-2, per Mark Glickman's "Example of the Glicko-2 system" (2013).
 *
 * Used for the competitive ladder. The rating itself is NEVER shown to a user —
 * the UI renders only the tier returned by `tierFor`. A visible number that
 * drops after a bad session is demotivating in a learning product; a hidden one
 * still gives correct matchmaking, a real sort key for the board, and the
 * property that matters most here: beating a stronger opponent moves you a lot
 * and farming a weaker co-member moves you almost not at all.
 *
 * The DATABASE is authoritative — migration 017 implements this same algorithm
 * in plpgsql so a client cannot submit its own rating. This module is the
 * reference implementation it is cross-validated against, and the source of the
 * tier mapping the UI uses.
 */

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOLATILITY = 0.06;

/** Glicko-2 internal scale factor. */
const SCALE = 173.7178;

/** System constant: how much volatility can move per period. Smaller = steadier. */
export const TAU = 0.5;

const CONVERGENCE = 0.000001;

export type Rating = {
  rating: number;
  rd: number;
  vol: number;
};

export type MatchOutcome = {
  opponent: Rating;
  /** 1 = win, 0.5 = draw, 0 = loss. */
  score: number;
};

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

const expected = (mu: number, muJ: number, phiJ: number): number =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/**
 * One rating period. For duels each match is its own period, which is the
 * standard simplification when games are sparse and asynchronous.
 *
 * With no matches the rating is unchanged but RD grows — this is what makes an
 * inactive player correctly "uncertain" again rather than frozen at a stale
 * value, and it is why no explicit rank-decay mechanic is needed.
 */
export function glicko2Update(
  player: Rating,
  matches: MatchOutcome[],
  tau: number = TAU,
): Rating {
  const mu = (player.rating - DEFAULT_RATING) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.vol;

  if (matches.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return {
      rating: player.rating,
      rd: SCALE * phiStar,
      vol: sigma,
    };
  }

  const terms = matches.map((m) => {
    const muJ = (m.opponent.rating - DEFAULT_RATING) / SCALE;
    const phiJ = m.opponent.rd / SCALE;
    const e = expected(mu, muJ, phiJ);
    return { gPhiJ: g(phiJ), e, score: m.score };
  });

  const vInv = terms.reduce((sum, t) => sum + t.gPhiJ * t.gPhiJ * t.e * (1 - t.e), 0);
  const v = 1 / vInv;
  const outcomeSum = terms.reduce((sum, t) => sum + t.gPhiJ * (t.score - t.e), 0);
  const delta = v * outcomeSum;

  // Volatility, solved with the Illinois variant of regula falsi (Glickman §5.1).
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const d2 = delta * delta;
    const pv = phi * phi + v + ex;
    return (ex * (d2 - phi * phi - v - ex)) / (2 * pv * pv) - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  const sigmaPrime = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + vInv);
  const muPrime = mu + phiPrime * phiPrime * outcomeSum;

  return {
    rating: SCALE * muPrime + DEFAULT_RATING,
    rd: SCALE * phiPrime,
    vol: sigmaPrime,
  };
}

// ── Tiers ───────────────────────────────────────────────────
// The only rating information a user ever sees.

export const TIERS = [
  { id: "bronze", label: "Bronze", min: -Infinity, color: "#b45309", bg: "#fff7ed" },
  { id: "silver", label: "Silver", min: 1300, color: "#6b7280", bg: "#f9fafb" },
  { id: "gold", label: "Gold", min: 1450, color: "#f59e0b", bg: "#fffbeb" },
  { id: "platinum", label: "Platinum", min: 1600, color: "#0ea5e9", bg: "#f0f9ff" },
  { id: "diamond", label: "Diamond", min: 1750, color: "#8b5cf6", bg: "#f5f3ff" },
  { id: "master", label: "Master", min: 1900, color: "#4f46e5", bg: "#eef2ff" },
] as const;

export type TierId = (typeof TIERS)[number]["id"] | "unranked";

/** Duels required before a tier is shown at all. */
export const PLACEMENT_MATCHES = 5;

export const UNRANKED = {
  id: "unranked" as const,
  label: "Unranked",
  color: "#6b7280",
  bg: "#f9fafb",
};

/**
 * A tier is only meaningful once the rating has been pinned down, so a player
 * stays Unranked through their placement duels rather than being handed a badge
 * derived from one lucky win.
 */
export function tierFor(rating: number, matchesPlayed: number): TierId {
  if (matchesPlayed < PLACEMENT_MATCHES) return "unranked";
  let current: TierId = "bronze";
  for (const t of TIERS) {
    if (rating >= t.min) current = t.id;
  }
  return current;
}

export function tierStyle(tier: TierId | null): { label: string; color: string; bg: string } {
  const found = TIERS.find((t) => t.id === tier);
  return found ?? UNRANKED;
}
