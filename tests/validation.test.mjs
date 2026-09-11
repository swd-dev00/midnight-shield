import { withReadTimeout } from '../src/lib/timeout.ts'
import { hasArrived } from '../src/lib/delivery.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { bech32, bech32m } from 'bech32'
import { usdmToBaseUnits, validUsdmAmount } from '../src/lib/amount.ts'
import { validRecipient, midnightRecipientBytes } from '../src/lib/recipient.ts'

test('USDM conversion preserves one base unit and six-decimal values', () => {
  assert.equal(usdmToBaseUnits('0.000001'), 1n)
  assert.equal(usdmToBaseUnits('25.123456'), 25123456n)
  assert.equal(usdmToBaseUnits(' 1.2 '), 1200000n)
})
test('unsafe, zero, negative, exponent, and overprecision amounts are rejected', () => {
  for (const value of ['', '0', '-1', '1e3', 'Infinity', '0.0000001', '9007199254.740992', '0x10', '1,000']) assert.equal(validUsdmAmount(value), false, value)
})
test('Midnight addresses must carry a valid Preview checksum and 32-byte key', () => {
  const bytes = new Uint8Array(32).fill(5)
  const address = bech32m.encode('mn_addr_preview', bech32m.toWords(bytes), 1000)
  assert.deepEqual(midnightRecipientBytes(address), bytes)
  assert.equal(validRecipient(address, 'cardano-to-midnight'), true)
  for (const prefix of ['mn_addr', 'mn_addr_preprod', 'mn_shield_preview', 'mn_dust_preview']) {
    assert.equal(validRecipient(bech32m.encode(prefix, bech32m.toWords(bytes), 1000), 'cardano-to-midnight'), false)
  }
  assert.equal(validRecipient(address.slice(0, -1) + (address.endsWith('q') ? 'p' : 'q'), 'cardano-to-midnight'), false)
  assert.equal(validRecipient('05'.repeat(32), 'cardano-to-midnight'), false)
})
test('Cardano recipient rejects mainnet, reward addresses, and inconsistent headers', () => {
  const make = (prefix, header, length) => bech32.encode(prefix, bech32.toWords([header, ...Array(length - 1).fill(1)]), 1000)
  assert.equal(validRecipient(make('addr_test', 0x60, 29), 'midnight-to-cardano'), true)
  assert.equal(validRecipient(make('addr_test', 0x00, 57), 'midnight-to-cardano'), true)
  assert.equal(validRecipient(make('addr', 0x61, 29), 'midnight-to-cardano'), false)
  assert.equal(validRecipient(make('addr_test', 0x61, 29), 'midnight-to-cardano'), false)
  assert.equal(validRecipient(make('stake_test', 0xe0, 29), 'midnight-to-cardano'), false)
  assert.equal(validRecipient(make('addr_test', 0x00, 29), 'midnight-to-cardano'), false)
})

test('arrival never credits a missing micro-USDM and tolerates only floating representation noise', () => {
  assert.equal(hasArrived(1, 1.000001), false)
  assert.equal(hasArrived(1.000001, 1.000001), true)
  assert.equal(hasArrived(0.3, 0.1 + 0.2), true)
  assert.equal(hasArrived(NaN, 1), false)
})

test('read timeout bounds unavailable providers without retrying the request', async () => {
  let calls = 0
  const never = new Promise(() => { calls += 1 })
  await assert.rejects(withReadTimeout(never, 10), /Read timed out/)
  assert.equal(calls, 1)
  assert.equal(await withReadTimeout(Promise.resolve('ready'), 100), 'ready')
})


import { discoverWalletProviders, walletErrorMessage, describeWalletProviders, walletConnectionGuidance } from '../src/lib/walletConnection.ts'

test('wallet aliases collapse by identity while distinct same-name providers remain selectable', () => {
  let calls = 0
  const first = { name: '1AM Wallet', enable: () => { calls++ } }
  const other = { name: '1AM Wallet', enable: () => { calls++ } }
  const found = discoverWalletProviders({ one: first, alias: first, two: other })
  assert.equal(found.length, 2)
  assert.deepEqual(found[0].aliases, ['one', 'alias'])
  assert.equal(found[0].label, '1AM Wallet (one)')
  assert.equal(found[1].label, '1AM Wallet (two)')
  assert.equal(calls, 0)
})

test('wallet exceptions preserve CIP-30 info and codes instead of object coercion', () => {
  assert.equal(walletErrorMessage({ code: -3, info: 'Access refused' }), 'Access refused (code -3)')
  assert.equal(walletErrorMessage({ error: { message: 'Background unavailable', code: 'TIMEOUT' } }), 'Background unavailable (code TIMEOUT)')
  const cyclic = {}; cyclic.error = cyclic
  assert.equal(walletErrorMessage(cyclic), 'The wallet did not provide an error description.')
  assert.match(walletConnectionGuidance('No response from wallet background script. Is the extension loaded?'), /wallet was detected/)
})

test('provider diagnostics expose metadata without calling wallet methods or copying account data', () => {
  const provider = { name: '1AM', apiVersion: '4.0.1', address: 'private fixture address', connect: () => { throw Error('must not connect') }, getBalance: () => { throw Error('must not read') } }
  const info = describeWalletProviders({ '1am': provider })
  assert.equal(info[0].key, '1am')
  assert.equal(info[0].connect, true)
  assert.ok(info[0].keys.includes('getBalance'))
  assert.ok(!JSON.stringify(info).includes('private fixture address'))
})
