
// ============================================================
// routefolk — trip-not-found.js
// Trip-not-found rendering helper.
// ============================================================

export function tripNotFoundHtml() {
  return `
    <button class="btn btn-secondary btn-sm" id="backToTripsBtn" style="margin-bottom:12px;">← Back</button>
    <div class="empty-state">
      <div class="empty-title">Trip not found</div>
      <div class="empty-sub">It may have been deleted.</div>
    </div>
  `;
}
