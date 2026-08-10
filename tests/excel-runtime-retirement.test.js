const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'app-runtime.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'app-ui.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');

test('retired application runtime has no Excel parser or backup-format dependency', () => {
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.doesNotMatch(runtime, /\bXLSX\b|\bFileReader\b|importFromExcel|Planner_MemoryCard_|_backupDone|Memory Card/);
  assert.doesNotMatch(ui, /\bXLSX\b|\bFileReader\b|importFromExcel|Planner_MemoryCard_|_backupDone|Memory Card/);
});

test('Excel remains a report-only canonical data action', () => {
  assert.match(data, /root\.exportToExcel = exportToExcel/);
  assert.match(data, /Plannke_Relatorio_/);
  assert.match(data, /appendSheet\(workbook, 'Resumo'/);
  assert.match(data, /appendSheet\(workbook, 'Movimentações'/);
  assert.match(data, /appendSheet\(workbook, 'Planejamento'/);
  assert.doesNotMatch(data, /importFromExcel|FileReader|Memory Card|_backupDone/);
  assert.match(navigation, /root\.PlannkeDataReady = dataActionsReady/);
  assert.match(navigation, /\['confirmClearData', 'exportToExcel'\]\.forEach/);
});
