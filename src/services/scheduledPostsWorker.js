const { isDatabaseEnabled } = require("../db/pool");
const scheduledPosts = require("./scheduledPosts");

const INTERVAL_MS = 60 * 1000;
let timer = null;
let running = false;

async function tick() {
  if (running || !isDatabaseEnabled()) return;
  running = true;
  try {
    const due = await scheduledPosts.claimDuePosts(3);
    for (const post of due) {
      try {
        console.log(
          `[scheduler] Publicando post ${post.id} (${post.mediaType}) empresa=${post.companyId}`
        );
        await scheduledPosts.processPost(post);
        console.log(`[scheduler] Publicado OK ${post.id}`);
      } catch (error) {
        console.error(
          `[scheduler] Falló post ${post.id}:`,
          error.message,
          error.metaError || ""
        );
        await scheduledPosts.markFailed(post.id, error.message).catch(() => {});
      }
    }
  } catch (error) {
    console.error("[scheduler] tick error:", error.message);
  } finally {
    running = false;
  }
}

function startScheduledPostsWorker() {
  if (timer) return;
  if (!isDatabaseEnabled()) {
    console.log("[scheduler] DB no configurada — posts programados deshabilitados");
    return;
  }
  scheduledPosts.ensureUploadDir();
  timer = setInterval(tick, INTERVAL_MS);
  // primer pase a los 15s (dejar boot)
  setTimeout(tick, 15_000);
  console.log("[scheduler] Worker de posts Instagram iniciado (cada 60s)");
}

module.exports = { startScheduledPostsWorker, tick };
