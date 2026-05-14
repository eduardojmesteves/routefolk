#!/usr/bin/env node

const { stageFormHtml, readStageForm, validateStageFormAgainstTrip } = await import('../components/stage-form.js');

if (typeof stageFormHtml !== 'function') throw new Error('stageFormHtml is not exported');
if (typeof readStageForm !== 'function') throw new Error('readStageForm is not exported');
if (typeof validateStageFormAgainstTrip !== 'function') throw new Error('validateStageFormAgainstTrip is not exported');

const html = stageFormHtml(
  {
    title: 'Mountain pass day',
    start_location: 'Ávila',
    end_location: 'Tarragona',
    planned_date: '2026-05-30',
    distance_km: 250,
    notes: 'Test notes',
    custom_route_url: 'https://www.google.com/maps/dir/?api=1&origin=Avila&destination=Tarragona',
  },
  {
    start_date: '2026-05-29',
    end_date: '2026-06-04',
  },
);

if (!html.includes('sfTitle')) throw new Error('Stage form did not render expected title input');
if (!html.includes('min="2026-05-29"')) throw new Error('Stage form did not render min date attribute');
if (!html.includes('max="2026-06-04"')) throw new Error('Stage form did not render max date attribute');

validateStageFormAgainstTrip({ planned_date: '2026-05-30' }, { start_date: '2026-05-29', end_date: '2026-06-04' });

console.log('ok stage form render/export smoke check');
