function formatConsole(entry) {
  const base = `[${entry.category}] ${entry.event}`;
  const ids = [entry.userId, entry.messageId].filter(Boolean).join(" | ");
  return ids ? `${base} (${ids})` : base;
}

function log(entry) {
  const { level = "info", details, message } = entry;
  const output = details ?? message ?? "";
  const line = formatConsole(entry);

  if (level === "error") console.error(line, output);
  else if (level === "warn") console.warn(line, output);
  else console.log(line, output);
}

module.exports = { log };
