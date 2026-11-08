/**
 * Ledger model, validation, summaries, and persistence adapters for the
 * dsh-bookkeeping plugin.
 *
 * The host half owns every record. Data is kept in DSH's storage service
 * (the `json` KV backend, a `bookkeeping` unit with one document per entry)
 * and falls back to `<DSH_HOME>/plugin-data/bookkeeping/ledger.json` when the
 * storage service is unavailable. Nothing leaves this machine.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Allowed record directions. */
export const TYPES = ['expense', 'income']

/**
 * Known category ids. The host accepts any short label so custom categories
 * survive an import, while the UI and the agent tools offer these presets.
 */
export const CATEGORY_IDS = [
  'food', 'transport', 'shopping', 'housing', 'entertainment', 'medical', 'education',
  'salary', 'bonus', 'investment', 'parttime', 'gift', 'other',
]

/** Human labels used in agent-tool text (the UI localizes its own copy). */
export const CATEGORY_LABELS = {
  food: '餐饮',
  transport: '交通',
  shopping: '购物',
  housing: '居住',
  entertainment: '娱乐',
  medical: '医疗',
  education: '教育',
  salary: '工资',
  bonus: '奖金',
  investment: '理财',
  parttime: '兼职',
  gift: '红包',
  other: '其他',
}

/** KV unit declaration for the DSH storage service (`json` backend). */
export const STORAGE_UNIT = {
  name: 'bookkeeping_ledger',
  version: 1,
  tables: ['entries'],
  hasGlobal: false,
  layout: 'per-record',
}

const MAX_AMOUNT = 100000000
const MAX_NOTE = 200
const MAX_CATEGORY = 40
const MAX_ID = 64

/** A user-facing validation or lookup failure; routes answer it with 400. */
export class LedgerError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LedgerError'
  }
}

function roundMoney(value) {
  return Math.round(value * 100) / 100
}

/** Local calendar date as `YYYY-MM-DD` (never UTC to avoid an off-by-one day). */
export function localToday(now = new Date()) {
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Whether a value is a real `YYYY-MM-DD` calendar date. */
export function isDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1900 || year > 2100) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

/** Validate and round one positive money amount. */
export function normalizeAmount(value) {
  const amount = typeof value === 'string' ? Number(value) : value
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new LedgerError('amount must be a finite number')
  }
  if (amount <= 0) throw new LedgerError('amount must be greater than 0')
  if (amount > MAX_AMOUNT) throw new LedgerError('amount is too large')
  return roundMoney(amount)
}

function normalizeText(value, field, max) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new LedgerError(`${field} must be a string`)
  return value.trim().slice(0, max)
}

function normalizeId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID) {
    throw new LedgerError('id is invalid')
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new LedgerError('id is invalid')
  return value
}

/**
 * Validate one record. Without `partial`, every field is required-or-default;
 * with `partial`, only supplied fields are validated and returned so the
 * caller can merge them into an existing record.
 */
export function normalizeEntry(raw, options = {}) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const partial = options.partial === true
  const next = {}

  if (!partial || source.type !== undefined) {
    if (!TYPES.includes(source.type)) {
      throw new LedgerError('type must be "expense" or "income"')
    }
    next.type = source.type
  }
  if (!partial || source.amount !== undefined) {
    next.amount = normalizeAmount(source.amount)
  }
  if (!partial || source.category !== undefined) {
    let category = normalizeText(source.category, 'category', MAX_CATEGORY)
    if (category.length === 0) category = 'other'
    next.category = category
  }
  if (!partial || source.note !== undefined) {
    next.note = normalizeText(source.note, 'note', MAX_NOTE)
  }
  if (!partial || source.date !== undefined) {
    const date = source.date === undefined ? localToday() : source.date
    if (!isDateString(date)) throw new LedgerError('date must be a YYYY-MM-DD calendar date')
    next.date = date
  }
  return next
}

/** Newest first: date descending, then creation time descending. */
export function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) return right.date < left.date ? -1 : 1
    return String(right.createdAt ?? '') < String(left.createdAt ?? '') ? -1 : 1
  })
}

/**
 * Totals for one `YYYY-MM` month (or the whole ledger when `month` is null),
 * including a per-category breakdown sorted by amount.
 */
export function summarizeEntries(entries, month = null) {
  const scope = month === null || month === undefined
    ? entries
    : entries.filter((entry) => typeof entry.date === 'string' && entry.date.startsWith(month))
  let income = 0
  let expense = 0
  const groups = new Map()
  for (const entry of scope) {
    const amount = Number(entry.amount) || 0
    if (entry.type === 'income') income += amount
    else expense += amount
    const key = `${entry.type}:${entry.category}`
    const group = groups.get(key) ?? { type: entry.type, category: entry.category, amount: 0, count: 0 }
    group.amount += amount
    group.count += 1
    groups.set(key, group)
  }
  return {
    month: month ?? null,
    count: scope.length,
    income: roundMoney(income),
    expense: roundMoney(expense),
    balance: roundMoney(income - expense),
    byCategory: [...groups.values()]
      .map((group) => ({ ...group, amount: roundMoney(group.amount) }))
      .sort((left, right) => right.amount - left.amount),
  }
}

/**
 * Storage adapter over the DSH storage service's KV unit: one JSON document per
 * entry, so a point write replaces exactly one record.
 */
export class KvUnitStore {
  constructor(unit) {
    this.unit = unit
    this.kind = 'storage'
  }

  async load() {
    const loaded = await this.unit.loadAll()
    const records = (loaded && loaded.tables && loaded.tables.entries) || {}
    const map = new Map()
    for (const [id, record] of Object.entries(records)) {
      if (record !== null && typeof record === 'object') map.set(id, record)
    }
    return map
  }

  async put(entry) {
    await this.unit.putRecord('entries', entry.id, entry)
  }

  async remove(id) {
    await this.unit.deleteRecord('entries', id)
  }

  async replaceAll(entries, previous) {
    const keep = new Set(entries.map((entry) => entry.id))
    for (const id of previous ?? []) {
      if (!keep.has(id)) await this.unit.deleteRecord('entries', id)
    }
    for (const entry of entries) await this.unit.putRecord('entries', entry.id, entry)
  }

  async close() {
    await this.unit.close()
  }
}

/** Plain JSON-file fallback store, atomic on every publication. */
export class FileStore {
  constructor(file) {
    this.file = file
    this.kind = 'file'
  }

  async load() {
    const map = new Map()
    let text
    try {
      text = await readFile(this.file, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') return map
      throw error
    }
    let document
    try {
      document = JSON.parse(text)
    } catch {
      throw new LedgerError(`ledger file is malformed: ${this.file}`)
    }
    const records = document && Array.isArray(document.entries) ? document.entries : []
    for (const record of records) {
      if (record !== null && typeof record === 'object' && typeof record.id === 'string') {
        map.set(record.id, record)
      }
    }
    return map
  }

  async replaceAll(entries) {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 })
    const document = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: sortEntries(entries),
    }
    const temporary = `${this.file}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.file)
  }

  async close() {}
}

/**
 * The in-memory ledger with serialized mutations. A mutation updates memory,
 * persists, and only then resolves; a failed persistence restores memory.
 */
export class Ledger {
  /**
   * `storeSource` is a store, a promise of one, or a zero-argument factory
   * returning either. A factory defers opening until the first ledger use, so
   * a service mounted after this plugin still gets picked up.
   */
  constructor(storeSource) {
    this.storeSource = storeSource
    this.store = null
    this.entries = new Map()
    this.readyPromise = null
    this.queue = Promise.resolve()
  }

  async getStore() {
    if (this.store === null) {
      const source = typeof this.storeSource === 'function' ? this.storeSource() : this.storeSource
      this.store = await source
    }
    return this.store
  }

  async ready() {
    if (this.readyPromise === null) {
      this.readyPromise = (async () => {
        const store = await this.getStore()
        const map = await store.load()
        this.entries = map instanceof Map ? map : new Map()
        return this
      })()
    }
    return this.readyPromise
  }

  async snapshot() {
    await this.ready()
    return sortEntries([...this.entries.values()])
  }

  serial(operation) {
    const run = this.queue.then(operation)
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }

  async persistAll(previousIds) {
    const store = await this.getStore()
    await store.replaceAll([...this.entries.values()], previousIds)
  }

  add(raw) {
    return this.serial(async () => {
      await this.ready()
      const now = new Date().toISOString()
      const base = normalizeEntry(raw)
      const entry = { id: randomUUID(), ...base, createdAt: now, updatedAt: now }
      this.entries.set(entry.id, entry)
      try {
        const store = await this.getStore()
        if (store.kind === 'storage') await store.put(entry)
        else await store.replaceAll([...this.entries.values()])
      } catch (error) {
        this.entries.delete(entry.id)
        throw error
      }
      return entry
    })
  }

  update(id, patch) {
    return this.serial(async () => {
      await this.ready()
      const key = normalizeId(id)
      const existing = this.entries.get(key)
      if (existing === undefined) throw new LedgerError('entry not found')
      const merged = normalizeEntry(patch, { partial: true })
      const next = { ...existing, ...merged, updatedAt: new Date().toISOString() }
      this.entries.set(key, next)
      try {
        const store = await this.getStore()
        if (store.kind === 'storage') await store.put(next)
        else await store.replaceAll([...this.entries.values()])
      } catch (error) {
        this.entries.set(key, existing)
        throw error
      }
      return next
    })
  }

  remove(id) {
    return this.serial(async () => {
      await this.ready()
      const key = normalizeId(id)
      const existing = this.entries.get(key)
      if (existing === undefined) throw new LedgerError('entry not found')
      this.entries.delete(key)
      try {
        const store = await this.getStore()
        if (store.kind === 'storage') await store.remove(key)
        else await store.replaceAll([...this.entries.values()])
      } catch (error) {
        this.entries.set(key, existing)
        throw error
      }
      return existing
    })
  }

  import(rawEntries) {
    return this.serial(async () => {
      await this.ready()
      if (!Array.isArray(rawEntries)) throw new LedgerError('entries must be an array')
      if (rawEntries.length > 10000) throw new LedgerError('too many entries to import')
      const now = new Date().toISOString()
      const previousIds = [...this.entries.keys()]
      let imported = 0
      for (const raw of rawEntries) {
        const source = raw !== null && typeof raw === 'object' ? raw : {}
        const base = normalizeEntry(source)
        const id = typeof source.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(source.id)
          ? source.id
          : randomUUID()
        const existing = this.entries.get(id)
        const createdAt = typeof source.createdAt === 'string'
          ? source.createdAt
          : (existing && existing.createdAt) || now
        this.entries.set(id, { id, ...base, createdAt, updatedAt: now })
        imported += 1
      }
      try {
        await this.persistAll(previousIds)
      } catch (error) {
        // Reload the authoritative snapshot after a failed bulk write.
        this.readyPromise = null
        this.entries = new Map()
        await this.ready().catch(() => {})
        throw error
      }
      return imported
    })
  }

  clear() {
    return this.serial(async () => {
      await this.ready()
      const previousIds = [...this.entries.keys()]
      this.entries.clear()
      try {
        await this.persistAll(previousIds)
      } catch (error) {
        this.readyPromise = null
        this.entries = new Map()
        await this.ready().catch(() => {})
        throw error
      }
      return previousIds.length
    })
  }
}

/**
 * Open the ledger store for this profile. Prefers DSH's storage service
 * (storage-json backend), then a plain JSON file under the DSH home.
 */
export async function createStore(ctx) {
  const storage = ctx !== null && typeof ctx.get === 'function' ? ctx.get('storage') : undefined
  if (storage && storage.backend && typeof storage.backend.names === 'function') {
    let names = []
    try {
      names = storage.backend.names()
    } catch {
      names = []
    }
    for (const name of names) {
      try {
        const backend = storage.backend.get(name)
        if (!backend || !backend.kv) continue
        const unit = await backend.kv.open(STORAGE_UNIT)
        return new KvUnitStore(unit)
      } catch {
        // Try the next backend; the JSON file fallback below always exists.
      }
    }
  }
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return new FileStore(join(home, 'plugin-data', 'bookkeeping', 'ledger.json'))
}
