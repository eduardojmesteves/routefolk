// ============================================================
// routefolk — components/forms.js
// Deprecated compatibility shim.
//
// A previous package accidentally added a broken form-helper module.
// The active app.js no longer imports this module. It is kept temporarily
// as valid JavaScript so stale local files do not break module parsing.
// ============================================================

function removedHelper(name) {
  throw new Error(`${name} is not used in this release. Refresh the app and use the current app.js bundle.`);
}

export function tripFormHtml() { return removedHelper('tripFormHtml'); }
export function readTripForm() { return removedHelper('readTripForm'); }
export function stageFormHtml() { return removedHelper('stageFormHtml'); }
export function readStageForm() { return removedHelper('readStageForm'); }
export function validateStageFormAgainstTrip() { return removedHelper('validateStageFormAgainstTrip'); }
export function findStageById() { return removedHelper('findStageById'); }
export function entryFormHtml() { return removedHelper('entryFormHtml'); }
export function readEntryForm() { return removedHelper('readEntryForm'); }
export function stageOptionsHtml() { return removedHelper('stageOptionsHtml'); }
export function expenseDateAttrs() { return removedHelper('expenseDateAttrs'); }
export function validateExpenseForTrip() { return removedHelper('validateExpenseForTrip'); }
export function payerOptionsHtml() { return removedHelper('payerOptionsHtml'); }
export function expenseFormHtml() { return removedHelper('expenseFormHtml'); }
export function readExpenseForm() { return removedHelper('readExpenseForm'); }
export function gpxUploadFormHtml() { return removedHelper('gpxUploadFormHtml'); }
