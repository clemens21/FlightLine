export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatMoneyOrFallback(amount: number, fallback: string): string {
  return Number.isFinite(amount) ? formatMoney(amount) : fallback;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDeadlineCountdown(deadlineUtc: string, currentTimeUtc: string): string {
  const remainingMinutes = Math.max(0, Math.ceil((Date.parse(deadlineUtc) - Date.parse(currentTimeUtc)) / 60_000));
  const days = Math.floor(remainingMinutes / (24 * 60));
  const hours = Math.floor((remainingMinutes % (24 * 60)) / 60);
  const minutes = remainingMinutes % 60;
  return `${String(days).padStart(2, "0")}D:${String(hours).padStart(2, "0")}H:${String(minutes).padStart(2, "0")}M`;
}

export function renderStaticTableHeaderCell(label: string): string {
  return `<th class="table-header-column"><div class="table-header-control"><span class="table-header-label">${escapeHtml(label)}</span><span class="table-header-actions" aria-hidden="true"></span></div></th>`;
}
