/**
 * Install this script in the MAIN Google Sheet.
 * It mirrors tabs to an AUDIT spreadsheet + writes version logs.
 */

const AUDIT_SPREADSHEET_ID = "PASTE_AUDIT_SPREADSHEET_ID";

const LOG_SHEET = "_Version_Log";
const SHADOW_PREFIX = "_Shadow_";
const LIVE_PREFIX = "LIVE_";

const LOG_HEADERS = [
  "Timestamp",
  "Editor",
  "Sheet",
  "Cell",
  "Row",
  "Col",
  "Old Value",
  "New Value",
  "Formula",
];

function setupAuditBridge() {
  const source = SpreadsheetApp.getActiveSpreadsheet();
  const audit = SpreadsheetApp.openById(AUDIT_SPREADSHEET_ID);

  ensureLogSheet_(audit);
  fullSync_(source, audit);
  installTriggers_(source.getId());
}

function installTriggers_(sourceSpreadsheetId) {
  const handlers = ["bridgeOnEdit", "bridgeOnChange"];

  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("bridgeOnEdit")
    .forSpreadsheet(sourceSpreadsheetId)
    .onEdit()
    .create();

  ScriptApp.newTrigger("bridgeOnChange")
    .forSpreadsheet(sourceSpreadsheetId)
    .onChange()
    .create();
}

function bridgeOnEdit(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  try {
    if (!e || !e.range) return;

    const sourceSheet = e.range.getSheet();
    const audit = SpreadsheetApp.openById(AUDIT_SPREADSHEET_ID);

    const live = getOrCreateLiveSheet_(audit, sourceSheet.getName());
    const shadow = getOrCreateShadowSheet_(audit, sourceSheet.getSheetId());
    const log = ensureLogSheet_(audit);

    const range = e.range;
    const rows = range.getNumRows();
    const cols = range.getNumColumns();

    ensureSheetSize_(live, range.getLastRow(), range.getLastColumn());
    ensureSheetSize_(shadow, range.getLastRow(), range.getLastColumn());

    const oldVals = shadow
      .getRange(range.getRow(), range.getColumn(), rows, cols)
      .getDisplayValues();
    const newVals = range.getDisplayValues();
    const formulas = range.getFormulas();

    // keep audit mirror up to date for Streamlit clicks
    range.copyTo(
      live.getRange(range.getRow(), range.getColumn(), rows, cols),
      SpreadsheetApp.CopyPasteType.PASTE_NORMAL,
      false
    );

    const now = new Date();
    const editor = getEditor_(e);
    const out = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rowNum = range.getRow() + r;
        const colNum = range.getColumn() + c;
        out.push([
          now,
          editor,
          sourceSheet.getName(),
          toA1_(rowNum, colNum),
          rowNum,
          colNum,
          oldVals[r][c],
          newVals[r][c],
          formulas[r][c],
        ]);
      }
    }

    if (out.length > 0) {
      log.getRange(log.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
    }

    // update shadow snapshot
    shadow
      .getRange(range.getRow(), range.getColumn(), rows, cols)
      .setValues(newVals);
  } finally {
    lock.releaseLock();
  }
}

function bridgeOnChange(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  try {
    const source = e && e.source ? e.source : SpreadsheetApp.getActiveSpreadsheet();
    const audit = SpreadsheetApp.openById(AUDIT_SPREADSHEET_ID);
    fullSync_(source, audit);
  } finally {
    lock.releaseLock();
  }
}

function fullSync_(source, audit) {
  ensureLogSheet_(audit);

  source.getSheets().forEach((src) => {
    const live = getOrCreateLiveSheet_(audit, src.getName());
    const shadow = getOrCreateShadowSheet_(audit, src.getSheetId());

    const dr = src.getDataRange();
    const rows = Math.max(1, dr.getNumRows());
    const cols = Math.max(1, dr.getNumColumns());

    ensureSheetSize_(live, rows, cols);
    ensureSheetSize_(shadow, rows, cols);

    live.clear();
    dr.copyTo(
      live.getRange(1, 1, rows, cols),
      SpreadsheetApp.CopyPasteType.PASTE_NORMAL,
      false
    );

    const values = dr.getDisplayValues();
    shadow.clearContents();
    shadow.getRange(1, 1, rows, cols).setValues(values);

    if (!shadow.isSheetHidden()) {
      shadow.hideSheet();
    }
  });
}

function ensureLogSheet_(audit) {
  let sh = audit.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = audit.insertSheet(LOG_SHEET);
  }
  sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
  sh.setFrozenRows(1);
  return sh;
}

function getOrCreateLiveSheet_(audit, sourceName) {
  const liveName = (LIVE_PREFIX + sourceName).slice(0, 99);
  let sh = audit.getSheetByName(liveName);
  if (!sh) {
    sh = audit.insertSheet(liveName);
  }
  return sh;
}

function getOrCreateShadowSheet_(audit, sheetId) {
  const shadowName = SHADOW_PREFIX + sheetId;
  let sh = audit.getSheetByName(shadowName);
  if (!sh) {
    sh = audit.insertSheet(shadowName);
  }
  if (!sh.isSheetHidden()) {
    sh.hideSheet();
  }
  return sh;
}

function ensureSheetSize_(sheet, targetRows, targetCols) {
  const rows = Math.max(1, targetRows);
  const cols = Math.max(1, targetCols);

  if (sheet.getMaxRows() < rows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < cols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
  }
}

function getEditor_(e) {
  if (e && e.user && typeof e.user.getEmail === "function") {
    const email = e.user.getEmail();
    if (email) return email;
  }
  const fallback = Session.getActiveUser().getEmail();
  return fallback || "unknown";
}

function toA1_(row, col) {
  let letters = "";
  let c = col;
  while (c > 0) {
    const rem = (c - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    c = Math.floor((c - 1) / 26);
  }
  return letters + row;
}
