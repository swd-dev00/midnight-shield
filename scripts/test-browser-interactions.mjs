import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { build } from 'esbuild';
import { verifyReceiptFile } from '../src/lib/transferReceipt.ts';

// Isolated local browser only: no extensions, user profile, or wallet access.
const root = process.cwd();
const qa = path.join(root, '.qa');
await mkdir(qa, { recursive: true });
const url = process.argv[2] ?? 'https://localhost:4173';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Use a local preview URL');
const port = 9234;
// Refuse an occupied port so this test cannot attach to an existing browser.
await new Promise((resolve, reject) => {
  const reservation = createServer();
  reservation.once('error', reject);
  reservation.listen(port, '127.0.0.1', () => reservation.close(resolve));
});
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run',
  '--no-default-browser-check', '--ignore-certificate-errors',
  `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${path.join(qa, 'interaction-profile')}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
let receiptServer;
let sequence = 0;
const pending = new Map();
const exceptions = [];
const checks = [];
const failures = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, passed, detail) => {
  checks.push({ name, passed, ...(detail === undefined ? {} : { detail }) });
  if (!passed) failures.push(name);
};
function call(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function enter(selector, text) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus(); document.querySelector(${JSON.stringify(selector)}).select()`);
  await call('Input.insertText', { text });
}
try {
  let tabs;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      if (tabs.some(t => t.type === 'page')) break;
    } catch {}
    await pause(250);
  }
  assert(tabs?.some(t => t.type === 'page'), 'Isolated Chrome did not start');
  socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };
  await call('Runtime.enable');
  await call('Page.enable');
  if (!process.argv.includes('--receipt-only')) {
  await call('Page.navigate', { url });
  const renderDeadline = Date.now() + 45000;
  while (Date.now() < renderDeadline && !await evaluate(`Boolean(document.querySelector('.authorize-button'))`)) await pause(250);
  check('App renders', await evaluate(`Boolean(document.querySelector('.authorize-button'))`));
  assert(checks.at(-1).passed, 'App did not render');
  check('Receipt boundaries start unverified without a transfer', await evaluate(`document.querySelectorAll('.receipt-boundaries article[data-status="unverified"]').length === 5 && document.querySelector('.receipt-summary').textContent.includes('0 / 3')`));
  check('All form controls have an id or name', await evaluate(`[...document.querySelectorAll('input,select,textarea')].every(e => e.id || e.name)`));
  check('Disconnected authorization is blocked', await evaluate(`document.querySelector('.authorize-button').disabled`));
  for (const chain of ['Midnight', 'Cardano']) {
    check(`${chain} connection action is visible without extensions`, await evaluate(`[...document.querySelectorAll('.wallet-actions button')].some(b => b.textContent === 'Connect ${chain} wallet')`));
    await evaluate(`[...document.querySelectorAll('.wallet-actions button')].find(b => b.textContent === 'Connect ${chain} wallet').click()`);
    check(`${chain} missing-wallet recovery shows browser instructions and app address`, await evaluate(`Boolean(document.querySelector('input[aria-label="${chain} wallet app address"]')) && [...document.querySelectorAll('.wallet-setup p')].some(p => p.textContent.includes('${chain === 'Midnight' ? '1AM' : 'Cardano wallet'}'))`));
  }

  await evaluate(`document.querySelector('.brand').focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  check('Keyboard reaches Simple mode', await evaluate(`document.activeElement.textContent.trim() === 'simple'`));
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  check('Keyboard opens Advanced mode', await evaluate(`document.activeElement.getAttribute('aria-pressed') === 'true' && Boolean(document.querySelector('.advanced-fields'))`));
  check('Compact controls can be opened separately from transfer authorization', await evaluate(`document.querySelector('#optional-compact')?.checked === false && !document.querySelector('#settlement-payee')`));
  await evaluate(`document.querySelector('#optional-compact').click()`);
  check('Optional Compact reveals its separate payee', await evaluate(`Boolean(document.querySelector('#settlement-payee'))`));
  await evaluate(`document.querySelector('#optional-compact').click()`);
  for (const amount of ['0', '1.0000001', '1e3', 'bad']) {
    await enter('.amount-field input', amount);
    check(`Invalid amount ${amount} is blocked and explained`, await evaluate(`document.querySelector('.amount-field input').getAttribute('aria-invalid') === 'true' && document.querySelector('.authorize-button').disabled && document.querySelector('#amount-help').textContent.includes('positive amount')`));
  }
  await enter('.amount-field input', '0.000001');
  check('One base unit is a valid amount', await evaluate(`document.querySelector('.amount-field input').getAttribute('aria-invalid') === 'false'`));
  await enter('input[aria-describedby="recipient-help"]', 'not-an-address');
  check('Invalid recipient is blocked and explained', await evaluate(`document.querySelector('input[aria-describedby="recipient-help"]').getAttribute('aria-invalid') === 'true' && document.querySelector('.authorize-button').disabled && document.querySelector('#recipient-help').textContent.includes('valid Midnight address')`));
  for (const width of [320, 390, 1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const mode of ['simple', 'advanced', 'trace']) {
      await evaluate(`[...document.querySelectorAll('.mode-switch button')].find(b => b.textContent === '${mode}').click()`);
      const layout = await evaluate(`({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0,8).map(e => e.className) })`);
      check(`No horizontal overflow at ${width}px in ${mode}`, layout.content <= layout.viewport + 1, layout);
      check(`Mode ${mode} selected at ${width}px`, await evaluate(`document.querySelector('.mode-switch button[aria-pressed="true"]').textContent === '${mode}'`));
      const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(path.join(qa, `interaction-${width}-${mode}.png`), Buffer.from(screenshot.data, 'base64'));
    }
  }

  // Explicit test fixture: discovery and rejected connection only, never a live wallet or transaction.
  await evaluate(`window.midnight = { ...window.midnight, qaLate: { name: 'QA late wallet', apiVersion: '4.0.1', connect: async () => { throw new Error('QA connection rejected'); } } }`);
  const walletDeadline = Date.now() + 6500;
  while (Date.now() < walletDeadline && !await evaluate(`[...document.querySelectorAll('.wallet-actions button')].some(b => b.textContent === 'Connect QA late wallet')`)) await pause(250);
  const lateVisible = await evaluate(`[...document.querySelectorAll('.wallet-actions button')].some(b => b.textContent === 'Connect QA late wallet')`);
  check('Late-injected wallet is discovered without a page reload', lateVisible);
  if (lateVisible) {
    await evaluate(`[...document.querySelectorAll('.wallet-actions button')].find(b => b.textContent === 'Connect QA late wallet').click()`);
    check('Rejected test-wallet connection is shown beside wallet controls', await evaluate(`[...document.querySelectorAll('.wallet-connection-error')].some(e => e.textContent.includes('QA connection rejected'))`));
    check('Rejected connection does not authorize a transfer', await evaluate(`document.querySelector('.authorize-button').disabled`));
  }
  await evaluate(`delete window.midnight.qaLate; window.dispatchEvent(new Event('focus'))`);
  await evaluate(`window.midnight = { qaTimeout: { name: 'QA timeout wallet', apiVersion: '4.0.1', connect: async () => { throw { code: 'TIMEOUT', message: 'No response from wallet background script. Is the extension loaded?' }; } } }; window.dispatchEvent(new Event('focus'))`);
  await pause(300);
  await evaluate(`[...document.querySelectorAll('.wallet-actions button')].find(b => b.textContent === 'Connect QA timeout wallet').click()`);
  check('Background timeout acknowledges the detected wallet', await evaluate(`[...document.querySelectorAll('.wallet-connection-error')].some(e => e.textContent.includes('wallet was detected'))`));
  const timeoutReport = await evaluate(`JSON.parse(document.querySelector('details[aria-label="Midnight connection details"] pre').textContent)`);
  check('Midnight diagnostics retain the failed step, provider key, version and error code', timeoutReport.failure?.step === 'Request connection' && timeoutReport.failure?.provider === 'qaTimeout' && timeoutReport.failure?.message.includes('TIMEOUT') && timeoutReport.providers[0]?.apiVersion === '4.0.1');
  await evaluate(`document.querySelector('details[aria-label="Midnight connection details"] summary').click()`);
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: false });
  check('Expanded diagnostics fit a narrow screen', await evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`));
  const diagnosticScreenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(path.join(qa, 'wallet-diagnostics-390.png'), Buffer.from(diagnosticScreenshot.data, 'base64'));
  await evaluate(`window.midnight.qaTimeout = { name: 'QA config wallet', apiVersion: '4.0.1', connect: async network => { window.qaRequestedNetwork = network; return { getConfiguration: async () => { throw new Error('QA configuration unavailable'); } }; } }; window.dispatchEvent(new Event('focus'))`);
  await pause(300);
  await evaluate(`[...document.querySelectorAll('.wallet-actions button')].find(b => b.textContent === 'Connect QA config wallet').click()`);
  check('A failure after connection identifies the configuration step and Preview request', await evaluate(`window.qaRequestedNetwork === 'preview' && JSON.parse(document.querySelector('details[aria-label="Midnight connection details"] pre').textContent).failure.step === 'Read Midnight configuration'`));
  await evaluate(`window.midnight = {}; window.cardano = {}; const same = { name: 'QA alias wallet', enable: async () => { throw { code: -3, info: 'QA access refused' }; } }; window.cardano.primary = same; window.cardano.alias = same; window.dispatchEvent(new Event('focus'))`);
  await pause(300);
  check('Two keys for the same wallet produce one connection action', await evaluate(`[...document.querySelectorAll('.wallet-actions button')].filter(b => b.textContent === 'Connect QA alias wallet').length === 1`));
  await evaluate(`[...document.querySelectorAll('.wallet-actions button')].find(b => b.textContent === 'Connect QA alias wallet').click()`);
  check('Plain-object Cardano rejection is readable', await evaluate(`[...document.querySelectorAll('.wallet-connection-error')].some(e => e.textContent.includes('QA access refused (code -3)')) && !document.body.textContent.includes('[object Object]')`));
  await evaluate(`window.cardano.other = { name: 'QA alias wallet', enable: async () => { throw new Error('QA distinct wallet'); } }; window.dispatchEvent(new Event('focus'))`);
  await pause(300);
  check('Distinct providers with matching names receive distinct connection labels', await evaluate(`[...document.querySelectorAll('.wallet-actions button')].some(b => b.textContent === 'Connect QA alias wallet (primary)') && [...document.querySelectorAll('.wallet-actions button')].some(b => b.textContent === 'Connect QA alias wallet (other)')`));
  // Cardano fixtures reproduce name filtering and reject incomplete/mainnet APIs without signing.
  await evaluate(`window.cardano = { qaMetadata: { name: 'QA metadata' }, '1am': { name: 'QA 1AM', enable: async () => ({ getNetworkId: async () => 0 }) } }; window.dispatchEvent(new Event('focus'))`);
  await pause(300);
  check('Cardano provider with 1AM in its name remains discoverable', await evaluate(`[...document.querySelectorAll('.wallet-actions button')].some(b => b.textContent === 'Connect QA 1AM')`));
  check('Cardano metadata without a connection API is not offered', await evaluate(`![...document.querySelectorAll('.wallet-actions button')].some(b => b.textContent === 'Connect QA metadata')`));
  await evaluate(`[...document.querySelectorAll('.wallet-actions button')].find(b => b.textContent === 'Connect QA 1AM').click()`);
  check('Incomplete Cardano API shows compatibility guidance', await evaluate(`[...document.querySelectorAll('.wallet-connection-error')].some(e => e.textContent.includes('Cardano connection and signing features')) && !document.querySelector('.connected-label') && document.querySelector('.authorize-button').disabled`));
  await evaluate(`window.cardano['1am'].enable = async () => ({ getNetworkId: async () => 1, getChangeAddress: async () => '60' + '00'.repeat(28), getBalance: async () => '00', getUtxos: async () => [], signTx: async () => { throw new Error('QA signing must not run'); }, submitTx: async () => { throw new Error('QA submission must not run'); } })`);
  await evaluate(`[...document.querySelectorAll('.wallet-actions button')].find(b => b.textContent === 'Connect QA 1AM').click()`);
  check('Cardano mainnet connection remains blocked', await evaluate(`[...document.querySelectorAll('.wallet-connection-error')].some(e => e.textContent.includes('switch your wallet to Preprod')) && !document.querySelector('.connected-label')`));
  await evaluate(`window.cardano['1am'].enable = async () => ({ getNetworkId: async () => 0, getChangeAddress: async () => '60' + '00'.repeat(28), getBalance: async () => '00', getUtxos: async () => [], signTx: async () => { throw new Error('QA signing must not run'); }, submitTx: async () => { throw new Error('QA submission must not run'); } })`);
  await evaluate(`[...document.querySelectorAll('.wallet-actions button')].find(b => b.textContent === 'Connect QA 1AM').click()`);
  await pause(300);
  check('Complete Cardano testnet API can connect regardless of provider name', await evaluate(`[...document.querySelectorAll('.connected-label')].some(e => e.textContent.startsWith('Connected') && e.textContent.includes('1am')) && document.querySelector('.authorize-button').disabled`));
  await evaluate(`delete window.cardano['1am']; delete window.cardano.qaMetadata; window.dispatchEvent(new Event('focus'))`);
  }
  // Receipt component runs on a separate local fixture server, with no SDK/wallet simulation.
  const fixtureRoot = path.join(qa, 'receipt-fixture');
  await mkdir(fixtureRoot, { recursive: true });
  await build({ entryPoints: ['tests/receipt-browser-entry.tsx'], bundle: true, format: 'esm', outfile: path.join(fixtureRoot, 'entry.js'), platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  receiptServer = createHttpServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/entry.js' || pathname === '/entry.css') { response.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); response.end(await readFile(path.join(fixtureRoot, pathname.slice(1)))); }
      else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/entry.css"><title>Receipt QA fixture</title></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>'); }
    } catch { response.statusCode = 500; response.end('Fixture unavailable'); }
  });
  await new Promise((resolve, reject) => { receiptServer.once('error', reject); receiptServer.listen(0, '127.0.0.1', resolve); });
  const fixtureUrl = `http://127.0.0.1:${receiptServer.address().port}`;
  const waitFor = async expression => { const deadline = Date.now() + 15000; while (Date.now() < deadline) { if (await evaluate(expression)) return true; await pause(150); } return false; };
  const openFixture = async scenario => { await call('Page.navigate', { url: fixtureUrl + '/?scenario=' + scenario }); await waitFor(`Boolean(document.querySelector('.transfer-receipt'))`); };
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await openFixture('delayed');
  check('Download and current-copy controls stay locked while evidence is changing', await evaluate(`document.querySelector('#receipt-download-help').textContent.includes('Download remains locked') && [...document.querySelectorAll('.receipt-actions button')].filter(b => /Download|Copy canonical JSON|Copy receipt hash/.test(b.textContent)).every(b => b.disabled)`));
  await openFixture('success');
  check('Receipt UI verifies three independent fixture boundaries', await waitFor(`document.querySelectorAll('.receipt-boundaries article[data-status="verified"]').length === 3 && document.querySelector('.receipt-summary').textContent.includes('3 / 3') && document.querySelector('.receipt-summary code').textContent.length === 64`));
  const wideReceipt = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(path.join(qa, 'receipt-1280.png'), Buffer.from(wideReceipt.data, 'base64'));
  const downloads = path.join(qa, 'receipt-downloads-' + Date.now()); await mkdir(downloads);
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  check('Download waits for the current completed evidence snapshot', await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent === 'Download verified transfer receipt' && !b.disabled)`));
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Download verified transfer receipt').click()`);
  let downloaded;
  for (let i = 0; i < 150; i++) { downloaded = (await readdir(downloads)).find(name => name.endsWith('.json')); if (downloaded) break; await pause(100); }
  check('Verified receipt downloads as JSON', Boolean(downloaded));
  if (downloaded) {
    const file = path.join(downloads, downloaded), text = await readFile(file, 'utf8');
    const downloadedReceipt = JSON.parse(text);
    check('Downloaded browser receipt is a finalized schema 1.2 snapshot', downloadedReceipt.receiptVersion === '1.2' && downloadedReceipt.snapshotState === 'finalized' && Number.isFinite(Date.parse(downloadedReceipt.finalizedAt)));
    check('Downloaded snapshot preserves unverified local proof and Compact settlement', downloadedReceipt.operation.localProof.status === 'unverified' && downloadedReceipt.operation.applicationSettlement.status === 'unverified');
    check('Downloaded browser receipt has valid canonical hashes', (await verifyReceiptFile(text)).includes('integrity only'));
    await evaluate(`document.querySelector('.receipt-file-check summary').click()`);
    const setFile = async filePath => { const { root } = await call('DOM.getDocument'); const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector: '#receipt-file' }); await call('DOM.setFileInputFiles', { nodeId, files: [filePath] }); };
    await setFile(file);
    check('Browser verifies the downloaded receipt locally', await waitFor(`document.querySelector('.receipt-file-check').textContent.includes('File hashes match')`));
    check('Saved receipt shows recomputed evidence and independent explorer links', await evaluate(`document.querySelector('.saved-receipt').textContent.includes('Transfer evidence: 3 / 3') && document.querySelector('.saved-receipt a[href*="explorer.1am.xyz/tx/"]')?.href.endsWith('?network=preview') && document.querySelector('.saved-receipt a[href*="scan.vialabs.tech/tx/"]') !== null`));
    check('Full operation stays incomplete despite a complete transfer', await evaluate(`document.querySelector('.receipt-summary').textContent.includes('3 / 5') && document.querySelectorAll('.transfer-receipt > .receipt-boundaries article[data-status="unverified"]').length === 2`));
    await evaluate(`window.qaCopied = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.qaCopied = value } } }); [...document.querySelectorAll('button')].find(b => b.textContent === 'Copy saved receipt hash').click()`);
    check('Saved hash copy matches the downloaded record', await evaluate(`window.qaCopied === ${JSON.stringify(JSON.parse(text).receiptHash)}`));
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Copy saved canonical JSON').click()`);
    check('Canonical JSON copy preserves the receipt', (await verifyReceiptFile(await evaluate('window.qaCopied'))).includes('integrity only'));
    await evaluate(`window.qaSavedReads = 0; const previousFetch = window.fetch; window.fetch = (...args) => { window.qaSavedReads++; return previousFetch(...args) }`);
    await evaluate(`const input = document.querySelector('#receipt-file'); input.value = ''; input.dispatchEvent(new Event('change', { bubbles: true }))`);
    await setFile(file);
    check('Saved receipt inspection makes no network or wallet requests', await waitFor(`Boolean(document.querySelector('.saved-receipt')) && window.qaSavedReads === 0 && !window.midnight && !window.cardano`));
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: false });
    check('Saved evidence fits a narrow screen', await evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`));
    await evaluate(`document.documentElement.style.scrollBehavior = 'auto'; document.querySelector('.saved-receipt').scrollIntoView()`);
    const savedScreenshot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(qa, 'saved-receipt-390.png'), Buffer.from(savedScreenshot.data, 'base64'));
    await evaluate('window.scrollTo(0, 0)');
    const tampered = JSON.parse(text); tampered.intent.amountBaseUnits = '999999'; const tamperedPath = path.join(downloads, 'tampered.json'); await writeFile(tamperedPath, JSON.stringify(tampered));
    await setFile(tamperedPath);
    check('Browser rejects a changed receipt and clears the earlier view', await waitFor(`document.querySelector('.receipt-file-check').textContent.includes('Receipt hash mismatch') && !document.querySelector('.saved-receipt')`));
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: false });
  check('Verified hashes and evidence cards fit a narrow screen', await evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`));
  const receiptGeometry = await evaluate(`({width: document.documentElement.clientWidth, height: document.documentElement.scrollHeight, outside: [...document.querySelectorAll('.transfer-receipt, .receipt-boundaries article, .receipt-summary code, .receipt-actions button')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(e => e.className)})`);
  check('Receipt elements stay inside the narrow viewport', receiptGeometry.outside.length === 0, receiptGeometry);
  check('Receipt displays exact human-readable USDM amounts', await evaluate(`document.querySelector('.receipt-boundaries').textContent.includes('1.000001 USDM')`));
  const narrowReceipt = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: receiptGeometry.width, height: receiptGeometry.height, scale: 1 } });
  await writeFile(path.join(qa, 'receipt-390.png'), Buffer.from(narrowReceipt.data, 'base64'));
  await evaluate(`window.scrollTo(0, 0)`);
  const receiptTop = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(qa, 'receipt-390-viewport.png'), Buffer.from(receiptTop.data, 'base64'));
  await evaluate(`document.querySelector('.receipt-actions').scrollIntoView({block:'center'})`);
  const receiptControls = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(qa, 'receipt-390-controls.png'), Buffer.from(receiptControls.data, 'base64'));
  await openFixture('mismatch');
  check('Destination amount mismatch leaves the receipt incomplete', await waitFor(`document.querySelector('.receipt-summary').textContent.includes('2 / 3') && document.querySelector('.receipt-boundaries').textContent.includes('net USDM amount does not match')`));
  check('Incomplete receipt is explicitly labelled partial', await evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent === 'Download partial receipt')`));
  await openFixture('unavailable');
  check('VIA service failure is visible without claiming delivery', await waitFor(`document.querySelector('.receipt-summary').textContent.includes('1 / 3') && document.querySelector('.receipt-boundaries').textContent.includes('HTTP 503')`));
  await openFixture('delayed');
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Clear fixture intent').click()`);
  await pause(2200);
  check('Late evidence cannot repopulate a cleared intent', await evaluate(`document.querySelector('.receipt-summary').textContent.includes('0 / 3') && document.querySelectorAll('.receipt-boundaries article[data-status="verified"]').length === 0`));
  check('No uncaught browser exceptions', exceptions.length === 0, exceptions);
} catch (error) {
  failures.push(error.message);
} finally {
  if (receiptServer) receiptServer.close();
  const report = { url, checks, failures, exceptions, liveWalletTesting: 'NOT RUN: isolated browser has no wallet extensions' };
  await writeFile(path.join(qa, process.argv.includes('--receipt-only') ? 'browser-receipt-only.json' : 'browser-interactions.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (socket?.readyState === WebSocket.OPEN) {
    try { await call('Browser.close'); } catch {}
    socket.close();
  }
  chrome.kill();
}
if (failures.length) process.exitCode = 1;
