
// ============================================================
// routefolk — gpx-form.js
// GPX upload form rendering helper.
// ============================================================

export function gpxUploadFormHtml(stage) {
  return `
    <div style="font-size:14px;line-height:1.5;color:#c5d0e0;margin-bottom:12px;">
      Upload the GPX file for <strong>${esc(stageRouteLabel(stage))}</strong>. GPX tracks are linked to stages, not directly to whole trips.
    </div>
    <div class="form-row">
      <label class="form-label" for="gpxFileInput">GPX file</label>
      <input class="inp" id="gpxFileInput" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml">
      <div class="form-help">Use the real track exported from your GPS/Wahoo/Intervals/etc. Max 8 MB for now.</div>
    </div>
  `;
}

