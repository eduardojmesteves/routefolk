// ============================================================
// routefolk — data-loaders.js
// Data loading and archive hydration helpers.
// ============================================================

import { listTrips } from '../lib/trips.js';
import { listExpensesForTrip } from '../lib/expenses.js';
import { listStages } from '../lib/stages.js';
import { forecastForStage } from '../lib/weather.js';
import { listEntriesForStage } from '../lib/journal.js';
import { listProfiles } from '../lib/profiles.js';
import { listActiveTripMembers, listTripMembersForTrip } from '../lib/trip-members.js';
import {
  ensureDefaultItemCategories,
  listItemsForTrip,
} from '../lib/items.js';
import {
  listGpxTracksForTrip,
  downloadAndParseGpxTrack,
  geometryFromGpxTrackRecord,
} from '../lib/gpx.js';
import { STATE } from './app-state.js';
import { toast } from '../components/toast.js';
import { gpxTracksForTrip } from '../utils/trip-detail.js';

export function createDataLoaders({ renderAll }) {
  async function loadTrips() {
    if (!STATE.user) return;
    STATE.tripsLoading = true;
    STATE.tripsError = null;
    renderAll();

    try {
      STATE.trips = await listTrips();
    } catch (err) {
      console.error(err);
      STATE.tripsError = err.message || 'Failed to load trips.';
    } finally {
      STATE.tripsLoading = false;
      renderAll();
      if (STATE.tab === 'archive') ensureArchiveData();
    }
  }

  async function loadProfiles() {
    if (!STATE.user) return;
    STATE.profilesLoading = true;
    STATE.profilesError = null;
    renderAll();

    try {
      const profiles = await listProfiles();
      STATE.profiles = profiles;
      STATE.profilesById = Object.fromEntries(profiles.map((p) => [p.id, p]));
    } catch (err) {
      console.error(err);
      STATE.profiles = [];
      STATE.profilesById = {};
      STATE.profilesError = err.message || 'Failed to load people.';
    } finally {
      STATE.profilesLoading = false;
      renderAll();
    }
  }

  async function loadSelectableTripMembers(options = {}) {
    if (!STATE.user) return [];
    if (STATE.selectableTripMembers.length && !options.force) return STATE.selectableTripMembers;
    STATE.selectableTripMembersLoading = true;
    STATE.selectableTripMembersError = null;
    if (!options.quiet) renderAll();

    try {
      STATE.selectableTripMembers = await listActiveTripMembers();
    } catch (err) {
      console.error(err);
      STATE.selectableTripMembers = [];
      STATE.selectableTripMembersError = err.message || 'Failed to load active app members.';
    } finally {
      STATE.selectableTripMembersLoading = false;
      renderAll();
    }
    return STATE.selectableTripMembers;
  }

  async function loadTripMembersForTrip(tripId, options = {}) {
    if (!STATE.user || !tripId) return [];
    if (Array.isArray(STATE.tripMembersByTrip[tripId]) && !options.force) return STATE.tripMembersByTrip[tripId];
    STATE.tripMembersLoadingByTrip[tripId] = true;
    STATE.tripMembersErrorByTrip[tripId] = null;
    if (!options.quiet) renderAll();

    try {
      STATE.tripMembersByTrip[tripId] = await listTripMembersForTrip(tripId);
    } catch (err) {
      console.error(err);
      STATE.tripMembersByTrip[tripId] = [];
      STATE.tripMembersErrorByTrip[tripId] = err.message || 'Failed to load selected trip users.';
    } finally {
      STATE.tripMembersLoadingByTrip[tripId] = false;
      renderAll();
    }
    return STATE.tripMembersByTrip[tripId];
  }

  async function loadStagesForTrip(tripId) {
    STATE.stagesLoading = true;
    STATE.stagesError = null;
    renderAll();

    try {
      const stages = await listStages(tripId);
      STATE.stagesByTrip[tripId] = stages;
      stages.forEach(loadForecastForStage);
      stages.forEach((stage) => {
        if (!STATE.entriesByStage[stage.id]) loadEntriesForStage(stage.id, { quiet: true });
      });
    } catch (err) {
      console.error(err);
      STATE.stagesError = err.message || 'Failed to load stages.';
    } finally {
      STATE.stagesLoading = false;
      renderAll();
    }
  }

  async function loadForecastForStage(stage) {
    if (!stage?.id) return;
    if (STATE.forecastsByStage[stage.id]) return;
    STATE.forecastsByStage[stage.id] = 'loading';

    try {
      const forecast = await forecastForStage(stage);
      STATE.forecastsByStage[stage.id] = forecast;
    } catch (err) {
      console.warn('Forecast load failed:', err);
      STATE.forecastsByStage[stage.id] = null;
    }

    if (STATE.viewTripId === stage.trip_id) renderAll();
  }

  async function loadEntriesForStage(stageId, options = {}) {
    STATE.entriesByStage[stageId] = 'loading';
    if (!options.quiet) renderAll();

    try {
      const entries = await listEntriesForStage(stageId);
      STATE.entriesByStage[stageId] = entries;
    } catch (err) {
      console.error(err);
      STATE.entriesByStage[stageId] = [];
      if (!options.quiet) toast('Failed to load journal entries.');
    }

    renderAll();
  }

  async function loadExpensesForTrip(tripId, options = {}) {
    STATE.expensesLoading = true;
    STATE.expensesError = null;
    STATE.expensesByTrip[tripId] = STATE.expensesByTrip[tripId] || 'loading';
    if (!options.quiet) renderAll();

    try {
      const expenses = await listExpensesForTrip(tripId);
      STATE.expensesByTrip[tripId] = expenses;
    } catch (err) {
      console.error(err);
      STATE.expensesByTrip[tripId] = [];
      STATE.expensesError = err.message || 'Failed to load expenses.';
      if (!options.quiet) toast('Failed to load expenses.');
    } finally {
      STATE.expensesLoading = false;
      renderAll();
    }
  }

  async function loadItemsForTrip(tripId, options = {}) {
    STATE.itemsLoading = true;
    STATE.itemsError = null;
    STATE.itemCategoriesByTrip[tripId] = STATE.itemCategoriesByTrip[tripId] || 'loading';
    STATE.itemsByTrip[tripId] = STATE.itemsByTrip[tripId] || 'loading';
    if (!options.quiet) renderAll();

    try {
      STATE.itemCategoriesByTrip[tripId] = await ensureDefaultItemCategories(tripId);
      STATE.itemsByTrip[tripId] = await listItemsForTrip(tripId);
    } catch (err) {
      console.error(err);
      STATE.itemCategoriesByTrip[tripId] = [];
      STATE.itemsByTrip[tripId] = [];
      STATE.itemsError = err.message || 'Failed to load packing items.';
      if (!options.quiet) toast('Failed to load packing items.');
    } finally {
      STATE.itemsLoading = false;
      renderAll();
    }
  }

  async function loadGpxForTrip(tripId, options = {}) {
    STATE.gpxLoading = true;
    STATE.gpxError = null;
    STATE.gpxByTrip[tripId] = STATE.gpxByTrip[tripId] || 'loading';
    if (!options.quiet) renderAll();

    try {
      const tracks = await listGpxTracksForTrip(tripId);
      STATE.gpxByTrip[tripId] = tracks;
      tracks.forEach((track) => {
        const cachedGeometry = geometryFromGpxTrackRecord(track);
        if (cachedGeometry && !STATE.gpxGeometryByTrack[track.id]) {
          STATE.gpxGeometryByTrack[track.id] = cachedGeometry;
        }
      });
    } catch (err) {
      console.error(err);
      STATE.gpxByTrip[tripId] = [];
      STATE.gpxError = err.message || 'Failed to load GPX tracks.';
      if (!options.quiet) toast('Failed to load GPX tracks.');
    } finally {
      STATE.gpxLoading = false;
      renderAll();
    }
  }

  async function ensureGpxGeometry(track) {
    if (!track?.id) return null;
    const existing = STATE.gpxGeometryByTrack[track.id];
    if (existing && existing !== 'loading') return existing;
    if (existing === 'loading') return null;

    const cachedGeometry = geometryFromGpxTrackRecord(track);
    if (cachedGeometry) {
      STATE.gpxGeometryByTrack[track.id] = cachedGeometry;
      return cachedGeometry;
    }

    STATE.gpxGeometryByTrack[track.id] = 'loading';
    try {
      const geometry = await downloadAndParseGpxTrack(track);
      STATE.gpxGeometryByTrack[track.id] = geometry;
      return geometry;
    } catch (err) {
      console.warn('GPX parse failed:', err);
      STATE.gpxGeometryByTrack[track.id] = { points: [], error: err.message || 'Failed to load GPX file.' };
      return STATE.gpxGeometryByTrack[track.id];
    }
  }

  async function ensureArchiveGpxGeometries() {
    if (STATE.archiveGpxLoading) return;

    const completed = STATE.trips.filter((trip) => trip.status === 'completed');
    const tracks = completed.flatMap((trip) => gpxTracksForTrip(trip.id));
    const missing = tracks.filter((track) => !STATE.gpxGeometryByTrack[track.id]);
    if (!missing.length) return;

    STATE.archiveGpxLoading = true;
    STATE.archiveGpxError = null;
    renderAll();

    try {
      for (const track of missing) {
        await ensureGpxGeometry(track);
      }
    } catch (err) {
      console.error(err);
      STATE.archiveGpxError = err.message || 'Failed to load GPX geometry.';
    } finally {
      STATE.archiveGpxLoading = false;
      renderAll();
    }
  }

  async function ensureArchiveData() {
    if (!STATE.user || STATE.archiveDataLoading) return;
    const archived = STATE.trips.filter((t) => t.status === 'completed' || t.status === 'cancelled');
    if (!archived.length) return;

    const needsWork = archived.some((trip) => {
      const stages = STATE.stagesByTrip[trip.id];
      if (!Array.isArray(stages)) return true;
      if (!Array.isArray(STATE.expensesByTrip[trip.id])) return true;
      if (!Array.isArray(STATE.gpxByTrip[trip.id])) return true;
      return stages.some((stage) => !Array.isArray(STATE.entriesByStage[stage.id]));
    });
    if (!needsWork) return;

    STATE.archiveDataLoading = true;
    STATE.archiveDataError = null;
    renderAll();

    try {
      for (const trip of archived) {
        let stages = STATE.stagesByTrip[trip.id];
        if (!Array.isArray(stages)) {
          stages = await listStages(trip.id);
          STATE.stagesByTrip[trip.id] = stages;
        }

        if (!Array.isArray(STATE.expensesByTrip[trip.id])) {
          STATE.expensesByTrip[trip.id] = await listExpensesForTrip(trip.id);
        }

        if (!Array.isArray(STATE.gpxByTrip[trip.id])) {
          STATE.gpxByTrip[trip.id] = await listGpxTracksForTrip(trip.id);
        }

        for (const stage of stages) {
          if (!Array.isArray(STATE.entriesByStage[stage.id])) {
            STATE.entriesByStage[stage.id] = await listEntriesForStage(stage.id);
          }
        }
      }
    } catch (err) {
      console.error(err);
      STATE.archiveDataError = err.message || 'Failed to load archive details.';
    } finally {
      STATE.archiveDataLoading = false;
      renderAll();
    }
  }

  async function openTrip(tripId, view = 'detail') {
    STATE.viewTripId = tripId;
    STATE.view = view;
    renderAll();
    if (!STATE.stagesByTrip[tripId]) {
      await loadStagesForTrip(tripId);
    } else {
      const stages = STATE.stagesByTrip[tripId] || [];
      stages.forEach(loadForecastForStage);
      stages.forEach((stage) => {
        if (!STATE.entriesByStage[stage.id]) loadEntriesForStage(stage.id, { quiet: true });
      });
    }
    if (!Array.isArray(STATE.tripMembersByTrip[tripId])) await loadTripMembersForTrip(tripId, { quiet: true });
    if (!Array.isArray(STATE.expensesByTrip[tripId])) await loadExpensesForTrip(tripId, { quiet: true });
    if (!Array.isArray(STATE.gpxByTrip[tripId])) await loadGpxForTrip(tripId, { quiet: true });
    if (!Array.isArray(STATE.itemsByTrip[tripId])) await loadItemsForTrip(tripId, { quiet: true });
  }

  return {
    loadTrips,
    loadProfiles,
    loadSelectableTripMembers,
    loadTripMembersForTrip,
    loadStagesForTrip,
    loadEntriesForStage,
    loadExpensesForTrip,
    loadItemsForTrip,
    loadGpxForTrip,
    ensureArchiveGpxGeometries,
    ensureArchiveData,
    openTrip,
  };
}
