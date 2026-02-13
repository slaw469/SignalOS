/**
 * In-memory rate limiter for Gemini API calls.
 * Enforces both per-minute and daily caps to prevent billing surprises.
 */

const DAILY_LIMIT = parseInt(process.env.GEMINI_DAILY_LIMIT || "50", 10);
const RPM_LIMIT = parseInt(process.env.GEMINI_RPM_LIMIT || "10", 10);

interface RateLimitState {
  dailyCount: number;
  dailyResetAt: number; // epoch ms
  minuteTimestamps: number[];
}

const state: RateLimitState = {
  dailyCount: 0,
  dailyResetAt: getNextMidnight(),
  minuteTimestamps: [],
};

function getNextMidnight(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

export function checkRateLimit(): { allowed: boolean; reason?: string; remaining: number } {
  const now = Date.now();

  // Reset daily counter at midnight
  if (now >= state.dailyResetAt) {
    state.dailyCount = 0;
    state.dailyResetAt = getNextMidnight();
  }

  // Clean up minute timestamps older than 60s
  state.minuteTimestamps = state.minuteTimestamps.filter((t) => now - t < 60_000);

  // Check daily limit
  if (state.dailyCount >= DAILY_LIMIT) {
    return {
      allowed: false,
      reason: `Daily limit reached (${DAILY_LIMIT} requests). Resets at midnight.`,
      remaining: 0,
    };
  }

  // Check per-minute limit
  if (state.minuteTimestamps.length >= RPM_LIMIT) {
    return {
      allowed: false,
      reason: `Too many requests. Max ${RPM_LIMIT} per minute.`,
      remaining: DAILY_LIMIT - state.dailyCount,
    };
  }

  return { allowed: true, remaining: DAILY_LIMIT - state.dailyCount };
}

export function recordRequest(): void {
  state.dailyCount++;
  state.minuteTimestamps.push(Date.now());
}

export function getRateLimitStatus(): { dailyUsed: number; dailyLimit: number; minuteUsed: number; minuteLimit: number } {
  const now = Date.now();
  if (now >= state.dailyResetAt) {
    state.dailyCount = 0;
    state.dailyResetAt = getNextMidnight();
  }
  state.minuteTimestamps = state.minuteTimestamps.filter((t) => now - t < 60_000);

  return {
    dailyUsed: state.dailyCount,
    dailyLimit: DAILY_LIMIT,
    minuteUsed: state.minuteTimestamps.length,
    minuteLimit: RPM_LIMIT,
  };
}
