/**
 * Host half of the dsh-bookkeeping plugin.
 *
 * Responsibilities:
 * - own the ledger records (validation + persistence through `ledger.js`);
 * - expose them to the Web UI through DSH's authenticated exact-Fetch routes
 *   (`GET/POST /api/bookkeeping`, same-origin browser cookie, owner peers only);
 * - register agent tools so the model can record and query entries from chat.
 *
 * The Client half (`client.js`) never talks to the filesystem; it renders the
 * Ledger panel and calls this host route.
 */
import {
  CATEGORY_IDS,
  CATEGORY_LABELS,
  Ledger,
  LedgerError,
  createStore,
  summarizeEntries,
  TYPES,
} from './ledger.js'

/**
 * Exact Fetch-route path. `connection.fetch` matches the request's full
 * pathname against this key, and DSH mounts that registry under `/api`, so the
 * `/api` channel prefix is part of the registered path. The browser calls the
 * same URL (a relative same-origin `/api/bookkeeping`).
 */
export const ROUTE_PATH = '/api/bookkeeping'

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function formatMoney(amount) {
  return `¥${Number(amount).toFixed(2)}`
}

function categoryLabel(id) {
  return CATEGORY_LABELS[id] || id
}

function describeEntry(entry) {
  const direction = entry.type === 'income' ? '收入' : '支出'
  const note = entry.note ? `，${entry.note}` : ''
  return `${entry.date} ${direction} ${formatMoney(entry.amount)}（${categoryLabel(entry.category)}${note}）`
}

function textResult(text) {
  return [{ type: 'text', text }]
}

/**
 * One page/section may be open on several entries; every mutation answers the
 * authoritative sorted record list so clients can replace their local view.
 */
async function mutate(ledger, action, body) {
  switch (action) {
    case 'add': {
      const entry = await ledger.add(body.entry ?? body)
      return { changed: [entry.id], entries: await ledger.snapshot() }
    }
    case 'update': {
      if (typeof body.id !== 'string') throw new LedgerError('id is required')
      const entry = await ledger.update(body.id, body.patch ?? {})
      return { changed: [entry.id], entries: await ledger.snapshot() }
    }
    case 'delete': {
      if (typeof body.id !== 'string') throw new LedgerError('id is required')
      const entry = await ledger.remove(body.id)
      return { changed: [entry.id], entries: await ledger.snapshot() }
    }
    case 'import': {
      const imported = await ledger.import(body.entries)
      return { changed: [], imported, entries: await ledger.snapshot() }
    }
    case 'clear': {
      const removed = await ledger.clear()
      return { changed: [], removed, entries: await ledger.snapshot() }
    }
    default:
      throw new LedgerError('unknown action')
  }
}

/** Route handler shared by the Web bridge (single caller, single ledger). */
async function handleRequest(ledger, request) {
  try {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const entries = await ledger.snapshot()
      return jsonResponse({ ok: true, entries })
    }
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
    }
    let body
    try {
      body = await request.json()
    } catch {
      throw new LedgerError('request body must be JSON')
    }
    if (body === null || typeof body !== 'object') throw new LedgerError('request body must be an object')
    const result = await mutate(ledger, body.action, body)
    return jsonResponse({ ok: true, ...result })
  } catch (error) {
    if (error instanceof LedgerError) {
      return jsonResponse({ ok: false, error: error.message }, 400)
    }
    return jsonResponse({ ok: false, error: 'internal storage failure' }, 500)
  }
}

const CATEGORY_HINT = CATEGORY_IDS.join(', ')

/** One operation, two callers: these use the same Ledger methods as the route. */
function toolDefinitions(ledger) {
  return [
    {
      name: 'bookkeeping_add',
      description:
        'Record one income or expense entry in the local bookkeeping ledger (记账). '
        + 'Call this whenever the user asks to record, log, or remember a transaction, e.g. "记一笔午饭 25 元" or "收到工资 8000". '
        + 'amount is a positive number of yuan; never pass a negative value for a refund — record the direction in `type`.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['expense', 'income'],
            description: '"expense" for money spent, "income" for money received',
          },
          amount: {
            type: 'number',
            description: 'positive amount in yuan, for example 25.5',
          },
          category: {
            type: 'string',
            description: `optional category id (${CATEGORY_HINT}); defaults to "other"`,
          },
          note: {
            type: 'string',
            description: 'optional short note, for example "午饭" or "地铁"',
          },
          date: {
            type: 'string',
            description: 'optional YYYY-MM-DD date; defaults to today',
          },
        },
        required: ['type', 'amount'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => textResult(String(value)),
      },
      async execute(args) {
        const entry = await ledger.add({
          type: args.type,
          amount: args.amount,
          category: args.category,
          note: args.note,
          date: args.date,
        })
        return `已记账：${describeEntry(entry)}（id: ${entry.id}）`
      },
    },
    {
      name: 'bookkeeping_query',
      description:
        'Read the local bookkeeping ledger. action "list" returns matching entries with ids; '
        + 'action "summary" returns income/expense/balance totals and a category breakdown. '
        + 'Filter by month (YYYY-MM), direction (expense/income), or category id.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'summary'],
            description: '"list" (default) lists entries; "summary" returns totals',
          },
          month: {
            type: 'string',
            description: 'optional YYYY-MM month filter; omit to cover the whole ledger',
          },
          type: {
            type: 'string',
            enum: ['expense', 'income'],
            description: 'optional direction filter',
          },
          category: {
            type: 'string',
            description: `optional category id (${CATEGORY_HINT})`,
          },
          limit: {
            type: 'integer',
            description: 'maximum entries listed, 1-200 (default 50)',
          },
        },
        additionalProperties: false,
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => textResult(String(value)),
      },
      async execute(args) {
        const action = args && args.action === 'summary' ? 'summary' : 'list'
        const month = typeof args.month === 'string' && /^\d{4}-\d{2}$/.test(args.month) ? args.month : null
        const entries = await ledger.snapshot()
        let scope = entries
        if (month !== null) scope = scope.filter((entry) => entry.date.startsWith(month))
        if (TYPES.includes(args.type)) scope = scope.filter((entry) => entry.type === args.type)
        if (typeof args.category === 'string' && args.category.length > 0) {
          scope = scope.filter((entry) => entry.category === args.category)
        }
        const totals = summarizeEntries(scope, null)
        const scopeLabel = month === null ? '全部记录' : month
        if (action === 'summary') {
          if (totals.count === 0) return `${scopeLabel}没有记录。`
          const lines = [
            `${scopeLabel}：${totals.count} 笔，收入 ${formatMoney(totals.income)}，支出 ${formatMoney(totals.expense)}，结余 ${formatMoney(totals.balance)}`,
            '分类明细：',
            ...totals.byCategory.map((group) => {
              const direction = group.type === 'income' ? '收入' : '支出'
              return `- ${categoryLabel(group.category)}（${direction}）：${formatMoney(group.amount)}（${group.count} 笔）`
            }),
          ]
          return lines.join('\n')
        }
        if (scope.length === 0) return `${scopeLabel}没有符合条件的记录。`
        const limit = Number.isInteger(args.limit) ? Math.min(Math.max(args.limit, 1), 200) : 50
        const listed = scope.slice(0, limit)
        const lines = [
          `${scopeLabel}：${totals.count} 笔，收入 ${formatMoney(totals.income)}，支出 ${formatMoney(totals.expense)}，结余 ${formatMoney(totals.balance)}`,
          ...listed.map((entry) => `- ${describeEntry(entry)}（id: ${entry.id}）`),
        ]
        if (scope.length > listed.length) lines.push(`（另有 ${scope.length - listed.length} 笔未列出，可加 limit）`)
        return lines.join('\n')
      },
    },
    {
      name: 'bookkeeping_delete',
      description:
        'Delete one bookkeeping entry by its id. Ids are shown by bookkeeping_query "list". '
        + 'Only call this when the user explicitly wants a record removed.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'entry id from bookkeeping_query list output' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => textResult(String(value)),
      },
      async execute(args) {
        const removed = await ledger.remove(args.id)
        return `已删除：${describeEntry(removed)}`
      },
    },
  ]
}

export function apply(ctx) {
  const ledger = new Ledger(() => createStore(ctx))

  // Release the opened storage unit when this plugin unloads, so a later
  // activation can reopen the same unit instead of falling back to a file.
  ctx.effect(() => {
    return async () => {
      const store = ledger.store
      if (store === null) return
      try {
        if (typeof store.close === 'function') await store.close()
      } catch {
        // Best effort: the fiber is already being torn down.
      }
    }
  })

  // Browser API: exact Fetch route whose path includes the `/api` channel
  // prefix (the shared handler matches the request's full pathname). Only
  // authenticated owner peers reach it; DSH's connection bridge enforces the
  // browser cookie and Host/Origin trust.
  ctx.inject(['connection'], (connectionCtx) => {
    connectionCtx.effect(() => {
      const registration = connectionCtx.connection.fetch.register({
        path: ROUTE_PATH,
        methods: ['GET', 'HEAD', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => handleRequest(ledger, request),
      })
      return async () => {
        const dispose = await registration
        await dispose()
      }
    })
  })

  // Agent tools: same operations, callable from chat. The registry owns
  // removal; the tool descriptions teach the model the local ledger.
  ctx.inject(['tools'], (toolsCtx) => {
    toolsCtx.effect(() => {
      const disposers = toolDefinitions(ledger).map((definition) => toolsCtx.tools.register(definition))
      return () => {
        for (const dispose of disposers) dispose()
      }
    })
  })
}
