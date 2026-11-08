#!/usr/bin/env node
/**
 * Repository self-check for dsh-bookkeeping. No dependencies, no network:
 * runs with `node test/check.mjs` from the repository root.
 *
 * It validates the bundle manifests and display resources, checks that every
 * JavaScript entry parses, and exercises the ledger model, validation,
 * summaries, and the JSON-file persistence adapter against a temporary
 * directory.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const failures = []

function check(name, fn) {
  try {
    fn()
    process.stdout.write(`ok   ${name}\n`)
  } catch (error) {
    failures.push({ name, error })
    process.stdout.write(`FAIL ${name}\n     ${error && error.message ? error.message : error}\n`)
  }
}

async function checkAsync(name, fn) {
  try {
    await fn()
    process.stdout.write(`ok   ${name}\n`)
  } catch (error) {
    failures.push({ name, error })
    process.stdout.write(`FAIL ${name}\n     ${error && error.message ? error.message : error}\n`)
  }
}

function readText(relative) {
  const absolute = join(root, relative)
  return readFile(absolute, 'utf8')
}

function syntaxCheck(relative) {
  execFileSync(process.execPath, ['--check', join(root, relative)], { stdio: 'pipe' })
}

// ── manifests and display resources ─────────────────────────────────────────

const manifest = JSON.parse(await readText('package.json'))
const zh = JSON.parse(await readText('locale/zh.json'))
const en = JSON.parse(await readText('locale/en.json'))

check('package.json names the bundle package', () => {
  assert.equal(manifest.name, 'dsh-bookkeeping')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.license, 'MIT')
})

check('package.json declares patch and web client halves', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.exports['.'], './index.js')
  assert.equal(manifest.exports['./client'], './client.js')
  assert.equal(manifest.exports['./icon'], './icon.svg')
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json')
  assert.ok(manifest.files.includes('index.js'))
  assert.ok(manifest.files.includes('ledger.js'))
  assert.ok(manifest.files.includes('client.js'))
  assert.ok(manifest.files.includes('cordis.patch.yml'))
  assert.ok(manifest.files.includes('icon.svg'))
})

check('locale resources carry display metadata', () => {
  for (const dict of [zh, en]) {
    assert.equal(typeof dict.meta.title, 'string')
    assert.ok(dict.meta.title.length > 0)
    assert.equal(typeof dict.meta.description, 'string')
    assert.ok(dict.meta.description.length > 0)
  }
  assert.notEqual(zh.meta.title, en.meta.title)
})

await checkAsync('icon is a valid svg of bounded size', async () => {
  const source = await readText('icon.svg')
  assert.ok(source.trimStart().startsWith('<svg'))
  assert.ok(source.includes('viewBox'))
  const info = await stat(join(root, 'icon.svg'))
  assert.ok(info.size > 0 && info.size < 256 * 1024)
})

await checkAsync('bundle patch inserts the plugin row', async () => {
  const patch = await readText('cordis.patch.yml')
  assert.match(patch, /- insert:/)
  assert.match(patch, /id: bookkeeping/)
  assert.match(patch, /name: 'dsh-bookkeeping'/)
})

// ── JavaScript parses ───────────────────────────────────────────────────────

check('index.js parses', () => syntaxCheck('index.js'))
check('ledger.js parses', () => syntaxCheck('ledger.js'))
check('client.js parses', () => syntaxCheck('client.js'))

await checkAsync('client half registers the expected module id and slots', async () => {
  const client = await readText('client.js')
  assert.match(client, /window\.__ModuleLoader__\.load\(/)
  assert.match(client, new RegExp(`id: '${manifest.name}'`))
  assert.match(client, /sidebar\.panellist/)
  assert.match(client, /name: 'main'/)
  assert.match(client, /PANEL_ID = 'bookkeeping'/)
  assert.match(client, /id: PANEL_ID/)
  assert.match(client, /key: PANEL_ID/)
})

// ── ledger model, validation, summary, persistence ──────────────────────────

const {
  Ledger,
  LedgerError,
  FileStore,
  isDateString,
  localToday,
  normalizeAmount,
  normalizeEntry,
  summarizeEntries,
} = await import('../ledger.js')
const host = await import('../index.js')

check('host entry exports apply and the route path', () => {
  assert.equal(typeof host.apply, 'function')
  assert.equal(host.ROUTE_PATH, '/bookkeeping')
})

check('dates validate as real calendar days', () => {
  assert.equal(isDateString('2026-11-08'), true)
  assert.equal(isDateString('2024-02-29'), true)
  assert.equal(isDateString('2026-02-29'), false)
  assert.equal(isDateString('2026-13-01'), false)
  assert.equal(isDateString('2026-1-1'), false)
  assert.equal(isDateString(''), false)
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/)
})

check('amounts are positive, finite, rounded to cents', () => {
  assert.equal(normalizeAmount(25), 25)
  assert.equal(normalizeAmount('25.555'), 25.56)
  assert.throws(() => normalizeAmount(0), LedgerError)
  assert.throws(() => normalizeAmount(-3), LedgerError)
  assert.throws(() => normalizeAmount(Number.NaN), LedgerError)
  assert.throws(() => normalizeAmount('abc'), LedgerError)
})

check('entry validation rejects malformed records', () => {
  assert.deepEqual(
    normalizeEntry({ type: 'expense', amount: 25, category: 'food', note: ' 午饭 ', date: '2026-11-08' }),
    { type: 'expense', amount: 25, category: 'food', note: '午饭', date: '2026-11-08' },
  )
  assert.throws(() => normalizeEntry({ type: 'spend', amount: 1 }), LedgerError)
  assert.throws(() => normalizeEntry({ type: 'expense' }), LedgerError)
  assert.throws(() => normalizeEntry({ type: 'expense', amount: 1, date: 'tomorrow' }), LedgerError)
  assert.throws(() => normalizeEntry({ type: 'expense', amount: 1, note: 7 }), LedgerError)
})

check('summaries total directions and category breakdown', () => {
  const entries = [
    { id: 'a', type: 'expense', amount: 20, category: 'food', date: '2026-11-01', createdAt: '2026-11-01T01:00:00.000Z' },
    { id: 'b', type: 'expense', amount: 5.5, category: 'food', date: '2026-11-02', createdAt: '2026-11-02T01:00:00.000Z' },
    { id: 'c', type: 'income', amount: 8000, category: 'salary', date: '2026-11-05', createdAt: '2026-11-05T01:00:00.000Z' },
    { id: 'd', type: 'expense', amount: 100, category: 'transport', date: '2026-10-30', createdAt: '2026-10-30T01:00:00.000Z' },
  ]
  const november = summarizeEntries(entries, '2026-11')
  assert.equal(november.count, 3)
  assert.equal(november.expense, 25.5)
  assert.equal(november.income, 8000)
  assert.equal(november.balance, 7974.5)
  assert.deepEqual(november.byCategory.map((group) => group.category), ['salary', 'food'])
  assert.equal(summarizeEntries(entries, '2026-12').count, 0)
  assert.equal(summarizeEntries(entries).count, 4)
})

await checkAsync('file store persists add/update/delete/import/clear', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-bookkeeping-test-'))
  try {
    const file = join(directory, 'ledger.json')
    const ledger = new Ledger(new FileStore(file))
    const lunch = await ledger.add({ type: 'expense', amount: 25, category: 'food', note: '午饭', date: '2026-11-08' })
    const salary = await ledger.add({ type: 'income', amount: 8000, category: 'salary', date: '2026-11-05' })
    assert.equal((await ledger.snapshot()).length, 2)

    const updated = await ledger.update(lunch.id, { amount: 30 })
    assert.equal(updated.amount, 30)
    assert.equal(updated.createdAt, lunch.createdAt)

    const reopened = await new FileStore(file).load()
    assert.equal(reopened.size, 2)
    assert.equal(reopened.get(lunch.id).amount, 30)

    await ledger.remove(salary.id)
    assert.equal((await ledger.snapshot()).length, 1)
    assert.equal((await new FileStore(file).load()).size, 1)

    const imported = await ledger.import([
      { id: 'fixed-id', type: 'expense', amount: 12, category: 'transport', date: '2026-11-09' },
      { type: 'income', amount: 100, category: 'gift', date: '2026-11-10' },
    ])
    assert.equal(imported, 2)
    assert.ok((await ledger.snapshot()).some((entry) => entry.id === 'fixed-id'))

    await ledger.clear()
    assert.equal((await ledger.snapshot()).length, 0)
    assert.deepEqual(await new FileStore(file).load(), new Map())
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

await checkAsync('ledger rejects updates and deletes for unknown ids', async () => {
  const ledger = new Ledger(() => new FileStore(join(tmpdir(), 'dsh-bookkeeping-unused', 'ledger.json')))
  await assert.rejects(() => ledger.update('00000000-0000-0000-0000-000000000000', { amount: 1 }), LedgerError)
  await assert.rejects(() => ledger.remove('missing-id'), LedgerError)
})

check('package metadata has no private flag that would block publishing', () => {
  assert.notEqual(manifest.private, true)
  assert.equal(typeof manifest.description, 'string')
  assert.ok(manifest.description.length > 10)
})

// ── result ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} check(s) failed.\n`)
  process.exitCode = 1
} else {
  process.stdout.write('\nAll checks passed.\n')
}
