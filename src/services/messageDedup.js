const TTL_MS = 24 * 60 * 60 * 1000;
const seen = new Map();
const inFlight = new Set();

function pruneExpired() {
  const now = Date.now();
  for (const [mid, expiresAt] of seen.entries()) {
    if (expiresAt <= now) seen.delete(mid);
  }
}

function tryAcquire(messageId) {
  if (!messageId) return false;
  pruneExpired();
  if (seen.has(messageId) || inFlight.has(messageId)) return false;
  inFlight.add(messageId);
  return true;
}

function markProcessed(messageId) {
  if (!messageId) return;
  inFlight.delete(messageId);
  seen.set(messageId, Date.now() + TTL_MS);
}

function release(messageId) {
  if (!messageId) return;
  inFlight.delete(messageId);
}

module.exports = { tryAcquire, markProcessed, release };
