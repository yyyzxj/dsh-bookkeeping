/**
 * Client (browser) half of the dsh-bookkeeping plugin.
 *
 * Loaded by DSH's dynamic client-module loader as the package's `./client`
 * export. The factory only registers a lazy module; all plugin work happens in
 * `apply(ctx)`:
 * - `sidebar.panellist`: global panel icon whose list id addresses the main
 *   panel `bookkeeping`;
 * - `main` (keyed by `bookkeeping`): the full Ledger page.
 *
 * Data lives in the Host half and is reached through DSH's authenticated
 * exact-Fetch route `GET/POST /api/bookkeeping`. Rendering uses only theme
 * tokens (`--dsw-alias-*`) and the module table's React, so the page matches
 * the host in light and dark mode with no build step.
 */
window.__ModuleLoader__.load({
  id: 'dsh-bookkeeping',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'bookkeeping'
    const API_PATH = '/api/bookkeeping'
    const EXPENSE_CATEGORIES = ['food', 'transport', 'shopping', 'housing', 'entertainment', 'medical', 'education', 'other']
    const INCOME_CATEGORIES = ['salary', 'bonus', 'investment', 'parttime', 'gift', 'other']
    const ALL_CATEGORIES = Array.from(new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]))
    const PANEL_ID = 'bookkeeping'

    const ZH = {
      'nav.label': '记账本',
      'title': '记账本',
      'subtitle': '记录每一笔收支，月度汇总与分类分析一目了然。',
      'badge.local': '仅本机',
      'action.refresh': '刷新',
      'action.export': '导出',
      'action.import': '导入',
      'action.cancel': '取消',
      'action.delete': '删除',
      'action.edit': '编辑',
      'action.confirmDelete': '确定删除这笔记录？',
      'action.save': '保存修改',
      'action.add': '记一笔',
      'action.retry': '重试',
      'summary.expense': '支出',
      'summary.income': '收入',
      'summary.balance': '结余',
      'summary.hint.month': '当前月份合计',
      'summary.hint.all': '全部记录合计',
      'summary.breakdownTitle': '分类占比',
      'summary.breakdownEmpty': '还没有记录，先在左侧记一笔吧。',
      'form.titleAdd': '记一笔',
      'form.titleEdit': '编辑记录',
      'form.typeExpense': '支出',
      'form.typeIncome': '收入',
      'form.amount': '金额（元）',
      'form.amountPlaceholder': '0.00',
      'form.category': '分类',
      'form.date': '日期',
      'form.note': '备注',
      'form.notePlaceholder': '例如：午饭、地铁、工资',
      'form.invalidAmount': '请输入大于 0 的金额',
      'toolbar.prevMonth': '上个月',
      'toolbar.nextMonth': '下个月',
      'toolbar.all': '全部',
      'toolbar.typeAll': '全部',
      'toolbar.searchPlaceholder': '搜索备注或分类',
      'toolbar.categoryAll': '全部分类',
      'list.empty': '这个月还没有记录。',
      'list.emptyFiltered': '没有符合筛选条件的记录。',
      'list.count': '共 {n} 笔',
      'list.more': '还有 {n} 条记录，请用筛选查看。',
      'status.saved': '已记一笔。',
      'status.updated': '已保存修改。',
      'status.deleted': '已删除。',
      'status.imported': '已导入 {n} 条记录。',
      'status.loading': '正在读取账本…',
      'status.footer': '数据由本机 DSH 服务保存，不会上传云端。',
      'error.load': '读取账本失败：{msg}',
      'error.save': '保存失败：{msg}',
      'error.importBad': '导入文件格式不正确：需要导出的 JSON 文件或记录数组。',
      'day.total': '合计',
      'range.all': '全部时间',
      'cat.food': '餐饮',
      'cat.transport': '交通',
      'cat.shopping': '购物',
      'cat.housing': '居住',
      'cat.entertainment': '娱乐',
      'cat.medical': '医疗',
      'cat.education': '教育',
      'cat.salary': '工资',
      'cat.bonus': '奖金',
      'cat.investment': '理财',
      'cat.parttime': '兼职',
      'cat.gift': '红包',
      'cat.other': '其他',
    }

    const EN = {
      'nav.label': 'Ledger',
      'title': 'Ledger',
      'subtitle': 'Track every income and expense, with monthly totals and category breakdowns.',
      'badge.local': 'Local only',
      'action.refresh': 'Refresh',
      'action.export': 'Export',
      'action.import': 'Import',
      'action.cancel': 'Cancel',
      'action.delete': 'Delete',
      'action.edit': 'Edit',
      'action.confirmDelete': 'Delete this entry?',
      'action.save': 'Save changes',
      'action.add': 'Add entry',
      'action.retry': 'Retry',
      'summary.expense': 'Expenses',
      'summary.income': 'Income',
      'summary.balance': 'Balance',
      'summary.hint.month': 'Current month',
      'summary.hint.all': 'All records',
      'summary.breakdownTitle': 'Category breakdown',
      'summary.breakdownEmpty': 'No records yet. Add the first one.',
      'form.titleAdd': 'Add an entry',
      'form.titleEdit': 'Edit entry',
      'form.typeExpense': 'Expense',
      'form.typeIncome': 'Income',
      'form.amount': 'Amount (CNY)',
      'form.amountPlaceholder': '0.00',
      'form.category': 'Category',
      'form.date': 'Date',
      'form.note': 'Note',
      'form.notePlaceholder': 'e.g. lunch, metro, salary',
      'form.invalidAmount': 'Enter an amount greater than 0',
      'toolbar.prevMonth': 'Previous month',
      'toolbar.nextMonth': 'Next month',
      'toolbar.all': 'All',
      'toolbar.typeAll': 'All',
      'toolbar.searchPlaceholder': 'Search notes or categories',
      'toolbar.categoryAll': 'All categories',
      'list.empty': 'No records for this month yet.',
      'list.emptyFiltered': 'No records match the current filters.',
      'list.count': '{n} entries',
      'list.more': '{n} more entries — narrow the filters to see them.',
      'status.saved': 'Entry added.',
      'status.updated': 'Changes saved.',
      'status.deleted': 'Entry deleted.',
      'status.imported': 'Imported {n} entries.',
      'status.loading': 'Loading ledger…',
      'status.footer': 'Stored by your local DSH host. Nothing is uploaded.',
      'error.load': 'Could not load the ledger: {msg}',
      'error.save': 'Could not save: {msg}',
      'error.importBad': 'Unrecognized import file: expected an exported JSON file or an array of entries.',
      'day.total': 'Total',
      'range.all': 'All time',
      'cat.food': 'Food',
      'cat.transport': 'Transport',
      'cat.shopping': 'Shopping',
      'cat.housing': 'Housing',
      'cat.entertainment': 'Entertainment',
      'cat.medical': 'Health',
      'cat.education': 'Education',
      'cat.salary': 'Salary',
      'cat.bonus': 'Bonus',
      'cat.investment': 'Investment',
      'cat.parttime': 'Side job',
      'cat.gift': 'Gift',
      'cat.other': 'Other',
    }

    const CSS = [
      '.bk-root{height:100%;min-height:0;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1.45}',
      '.bk-shell{max-width:1000px;margin:0 auto;padding:26px 28px 64px;display:flex;flex-direction:column;gap:16px}',
      '.bk-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}',
      '.bk-headline{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.bk-mark{display:inline-flex;color:var(--dsw-alias-brand-primary)}',
      '.bk-title{margin:0;font-size:20px;font-weight:600;letter-spacing:.01em}',
      '.bk-badge{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 8px;white-space:nowrap}',
      '.bk-sub{margin:6px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px}',
      '.bk-head-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '.bk-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:9px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;transition:background .15s ease,border-color .15s ease,filter .15s ease;white-space:nowrap}',
      '.bk-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
      '.bk-btn:disabled{opacity:.5;cursor:default}',
      '.bk-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.bk-btn--primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}',
      '.bk-btn--primary:hover{background:var(--dsw-alias-brand-primary);filter:brightness(1.07)}',
      '.bk-btn--danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.bk-btn--danger:hover{background:var(--dsw-alias-state-error-primary);color:#fff}',
      '.bk-btn--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.bk-btn--ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.bk-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px}',
      '.bk-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
      '.bk-stat{padding:14px 16px}',
      '.bk-stat-label{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.bk-stat-value{margin-top:4px;font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.01em}',
      '.bk-stat-hint{margin-top:2px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.bk-tone-expense{color:var(--dsw-alias-state-error-primary)}',
      '.bk-tone-income{color:var(--dsw-alias-state-success-primary)}',
      '.bk-tone-balance{color:var(--dsw-alias-brand-primary)}',
      '.bk-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:14px;align-items:start}',
      '.bk-form{padding:16px}',
      '.bk-card-title{margin:0 0 12px;font-size:14px;font-weight:600}',
      '.bk-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
      '.bk-field{display:flex;flex-direction:column;gap:5px;min-width:0}',
      '.bk-field--wide{grid-column:1 / -1}',
      '.bk-label{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.bk-input,.bk-select{font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:7px 9px;min-width:0;width:100%;box-sizing:border-box}',
      '.bk-input:hover,.bk-select:hover{border-color:var(--dsw-alias-border-l2)}',
      '.bk-input:focus,.bk-select:focus{outline:none;border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}',
      '.bk-input--amount{font-variant-numeric:tabular-nums}',
      '.bk-seg{display:inline-flex;background:var(--dsw-alias-bg-layer-2);border-radius:9px;padding:2px;gap:2px}',
      '.bk-seg-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;padding:5px 12px;border-radius:7px;cursor:pointer;white-space:nowrap}',
      '.bk-seg-btn[data-active="true"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.14)}',
      '.bk-seg-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.bk-form-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:12px}',
      '.bk-form-error{color:var(--dsw-alias-state-error-primary);font-size:12.5px;margin-right:auto}',
      '.bk-breakdown{padding:16px;display:flex;flex-direction:column;min-height:100%;box-sizing:border-box}',
      '.bk-cat{display:flex;flex-direction:column;gap:9px;margin-top:4px}',
      '.bk-cat-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 10px;font-size:12.5px;align-items:center}',
      '.bk-cat-name{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bk-cat-value{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
      '.bk-bar{grid-column:1 / -1;height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
      '.bk-bar-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary)}',
      '.bk-bar-fill--income{background:var(--dsw-alias-state-success-primary)}',
      '.bk-bar-fill--expense{background:var(--dsw-alias-state-error-primary)}',
      '.bk-muted{color:var(--dsw-alias-label-secondary);font-size:12.5px}',
      '.bk-ledger{overflow:hidden}',
      '.bk-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.bk-month{display:inline-flex;align-items:center;gap:2px;background:var(--dsw-alias-bg-layer-2);border-radius:9px;padding:2px}',
      '.bk-month-label{min-width:108px;text-align:center;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;padding:0 4px;white-space:nowrap}',
      '.bk-icon-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:15px;line-height:1;padding:6px 8px;border-radius:7px;cursor:pointer}',
      '.bk-icon-btn:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.bk-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.bk-toolbar-spacer{flex:1 1 auto}',
      '.bk-search{width:190px;max-width:100%}',
      '.bk-select--compact{width:auto;min-width:112px}',
      '.bk-list{display:flex;flex-direction:column}',
      '.bk-day{border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.bk-day:last-child{border-bottom:0}',
      '.bk-day-head{display:flex;justify-content:space-between;gap:10px;padding:8px 16px;font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}',
      '.bk-row{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.bk-day .bk-row:first-of-type{border-top:0}',
      '.bk-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}',
      '.bk-dot--expense{background:var(--dsw-alias-state-error-primary)}',
      '.bk-dot--income{background:var(--dsw-alias-state-success-primary)}',
      '.bk-row-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px}',
      '.bk-row-title{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bk-row-sub{font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.bk-row-amount{margin-left:auto;font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.bk-row-actions{display:flex;gap:2px;flex:none;opacity:0;transition:opacity .12s ease}',
      '.bk-row:hover .bk-row-actions,.bk-row:focus-within .bk-row-actions{opacity:1}',
      '@media (hover:none){.bk-row-actions{opacity:1}}',
      '.bk-confirm{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.bk-empty{padding:38px 16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px}',
      '.bk-empty-title{font-size:14px;color:var(--dsw-alias-label-primary);margin-bottom:4px}',
      '.bk-banner{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-error-primary);font-size:13px}',
      '.bk-status{font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:0 2px}',
      '.bk-hidden{display:none}',
      '@media (max-width:860px){.bk-grid{grid-template-columns:minmax(0,1fr)}.bk-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.bk-shell{padding:20px 16px 48px}.bk-fields{grid-template-columns:minmax(0,1fr)}.bk-search{width:100%}}',
      '@media (max-width:560px){.bk-summary{grid-template-columns:minmax(0,1fr)}.bk-head-actions{width:100%}}',
    ].join('\n')

    // ── small helpers ───────────────────────────────────────────────────────

    function pad2(value) {
      return `${value}`.padStart(2, '0')
    }

    function todayString(now = new Date()) {
      return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
    }

    function currentMonth() {
      const now = new Date()
      return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
    }

    function isMonthString(value) {
      return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
    }

    function shiftMonth(month, delta) {
      const parts = month.split('-').map(Number)
      const date = new Date(parts[0], parts[1] - 1 + delta, 1)
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
    }

    function formatMoney(value) {
      const amount = Number(value) || 0
      return `¥${amount.toFixed(2)}`
    }

    function amountText(entry) {
      return `${entry.type === 'income' ? '+' : '-'}${formatMoney(entry.amount)}`
    }

    function fill(template, values) {
      let text = template
      for (const [key, value] of Object.entries(values)) text = text.replaceAll(`{${key}}`, String(value))
      return text
    }

    function localeTagOf(locale) {
      try {
        const snapshot = locale && typeof locale.getLocale === 'function' ? locale.getLocale() : null
        const active = snapshot && snapshot.active ? String(snapshot.active) : ''
        return active.startsWith('zh') ? 'zh-CN' : 'en-US'
      } catch {
        return 'en-US'
      }
    }

    function monthLabel(month, localeTag) {
      if (!isMonthString(month)) return month
      const parts = month.split('-').map(Number)
      try {
        return new Intl.DateTimeFormat(localeTag, { year: 'numeric', month: 'long' }).format(new Date(parts[0], parts[1] - 1, 1))
      } catch {
        return month
      }
    }

    function dayLabel(date, localeTag) {
      if (typeof date !== 'string') return date
      const parts = date.split('-').map(Number)
      try {
        return new Intl.DateTimeFormat(localeTag, { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(parts[0], parts[1] - 1, parts[2], 12))
      } catch {
        return date
      }
    }

    const EMPTY_SUMMARY = { count: 0, income: 0, expense: 0, balance: 0, byCategory: [] }

    function computeSummary(entries) {
      let income = 0
      let expense = 0
      const groups = new Map()
      for (const entry of entries) {
        const amount = Number(entry.amount) || 0
        if (entry.type === 'income') income += amount
        else expense += amount
        const key = `${entry.type}:${entry.category}`
        const group = groups.get(key) || { type: entry.type, category: entry.category, amount: 0, count: 0 }
        group.amount += amount
        group.count += 1
        groups.set(key, group)
      }
      return {
        count: entries.length,
        income: Math.round(income * 100) / 100,
        expense: Math.round(expense * 100) / 100,
        balance: Math.round((income - expense) * 100) / 100,
        byCategory: Array.from(groups.values()).sort((left, right) => right.amount - left.amount),
      }
    }

    function categoriesFor(type) {
      return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    }

    function sortEntries(entries) {
      return [...entries].sort((left, right) => {
        if (left.date !== right.date) return right.date < left.date ? -1 : 1
        return String(right.createdAt || '') < String(left.createdAt || '') ? -1 : 1
      })
    }

    // ── host API ────────────────────────────────────────────────────────────

    async function requestJson(request) {
      const response = await fetch(API_PATH, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...request,
        headers: { accept: 'application/json', ...(request && request.headers ? request.headers : {}) },
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
        throw new Error(message)
      }
      if (payload === null || payload.ok !== true) {
        throw new Error(payload && typeof payload.error === 'string' ? payload.error : 'unexpected host response')
      }
      return payload
    }

    async function loadEntries() {
      const payload = await requestJson({ method: 'GET' })
      return Array.isArray(payload.entries) ? payload.entries : []
    }

    async function sendAction(action) {
      const payload = await requestJson({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action),
      })
      return Array.isArray(payload.entries) ? payload.entries : []
    }

    function downloadJson(entries) {
      const exported = {
        plugin: 'dsh-bookkeeping',
        version: 1,
        exportedAt: new Date().toISOString(),
        entries,
      }
      const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = globalThis.document.createElement('a')
      anchor.href = url
      anchor.download = `dsh-bookkeeping-${todayString()}.json`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    // ── locale subscription ────────────────────────────────────────────────

    function useLocaleRevision(locale) {
      const [revision, setRevision] = useState(0)
      useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => setRevision((value) => value + 1))
      }, [locale])
      return revision
    }

    // ── components ─────────────────────────────────────────────────────────

    class PageBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch(error) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('[bookkeeping] page render failed', error)
        }
      }

      render() {
        if (this.state.failed) {
          return h(
            'div',
            { className: 'bk-root' },
            h(
              'div',
              { className: 'bk-shell' },
              h(
                'div',
                { className: 'bk-card', style: { padding: '18px' } },
                h('h1', { className: 'bk-title' }, '记账本'),
                h('p', { className: 'bk-muted' }, '页面渲染失败，请刷新后重试。 / The page failed to render; please refresh.'),
              ),
            ),
          )
        }
        return this.props.children
      }
    }

    function LedgerIcon(props) {
      const size = typeof props.size === 'number' && props.size > 0 ? props.size : 20
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block', color: props.active ? 'var(--dsw-alias-brand-primary)' : 'inherit' },
        },
        h('circle', { cx: 12, cy: 12, r: 8.6 }),
        h('path', { d: 'M8.6 7.6 12 11.9l3.4-4.3' }),
        h('path', { d: 'M12 11.9v5.2' }),
        h('path', { d: 'M8.8 12.9h6.4M8.8 15.2h6.4' }),
      )
    }

    function SummaryCard(props) {
      return h(
        'div',
        { className: `bk-card bk-stat` },
        h('div', { className: 'bk-stat-label' }, props.label),
        h('div', { className: `bk-stat-value ${props.tone}` }, props.value),
        h('div', { className: 'bk-stat-hint' }, props.hint),
      )
    }

    function Breakdown(props) {
      const { t, summary } = props
      const rows = summary.byCategory.slice(0, 6)
      const maximum = rows.length > 0 ? rows[0].amount : 0
      return h(
        'div',
        { className: 'bk-card bk-breakdown' },
        h('h2', { className: 'bk-card-title' }, t('summary.breakdownTitle')),
        rows.length === 0
          ? h('p', { className: 'bk-muted', style: { margin: 0 } }, t('summary.breakdownEmpty'))
          : h(
              'div',
              { className: 'bk-cat' },
              rows.map((group) => {
                const ratio = maximum > 0 ? Math.max(4, Math.round((group.amount / maximum) * 100)) : 0
                return h(
                  'div',
                  { className: 'bk-cat-row', key: `${group.type}:${group.category}` },
                  h('span', { className: 'bk-cat-name' }, t(`cat.${group.category}`)),
                  h('span', { className: 'bk-cat-value' }, formatMoney(group.amount)),
                  h(
                    'div',
                    { className: 'bk-bar' },
                    h('div', {
                      className: `bk-bar-fill bk-bar-fill--${group.type === 'income' ? 'income' : 'expense'}`,
                      style: { width: `${ratio}%` },
                    }),
                  ),
                )
              }),
            ),
      )
    }

    function EntryForm(props) {
      const { t, initial, saving, onSubmit, onCancel, formError } = props
      const [type, setType] = useState(initial && initial.type ? initial.type : 'expense')
      const [amount, setAmount] = useState(initial ? `${initial.amount}` : '')
      const [category, setCategory] = useState(initial && initial.category ? initial.category : 'food')
      const [date, setDate] = useState(initial && initial.date ? initial.date : todayString())
      const [note, setNote] = useState(initial && initial.note ? initial.note : '')
      const [localError, setLocalError] = useState('')
      const editing = Boolean(initial)
      const visibleCategories = categoriesFor(type)

      useEffect(() => {
        if (!visibleCategories.includes(category)) setCategory(visibleCategories[0])
      }, [type])

      function submit(event) {
        event.preventDefault()
        const value = Number(amount)
        if (!Number.isFinite(value) || value <= 0) {
          setLocalError(t('form.invalidAmount'))
          return
        }
        setLocalError('')
        onSubmit({ type, amount: Math.round(value * 100) / 100, category, date, note: note.trim() })
      }

      return h(
        'form',
        { className: 'bk-card bk-form', onSubmit: submit },
        h('h2', { className: 'bk-card-title' }, editing ? t('form.titleEdit') : t('form.titleAdd')),
        h(
          'div',
          { className: 'bk-fields' },
          h(
            'div',
            { className: 'bk-field bk-field--wide' },
            h(
              'div',
              { className: 'bk-seg', role: 'tablist' },
              [
                ['expense', t('form.typeExpense')],
                ['income', t('form.typeIncome')],
              ].map(([value, label]) =>
                h(
                  'button',
                  {
                    key: value,
                    type: 'button',
                    className: 'bk-seg-btn',
                    'data-active': type === value ? 'true' : 'false',
                    role: 'tab',
                    'aria-selected': type === value,
                    onClick: () => setType(value),
                  },
                  label,
                ),
              ),
            ),
          ),
          h(
            'label',
            { className: 'bk-field' },
            h('span', { className: 'bk-label' }, t('form.amount')),
            h('input', {
              className: 'bk-input bk-input--amount',
              type: 'number',
              inputMode: 'decimal',
              step: '0.01',
              min: '0.01',
              placeholder: t('form.amountPlaceholder'),
              value: amount,
              onChange: (event) => setAmount(event.target.value),
              'aria-label': t('form.amount'),
            }),
          ),
          h(
            'label',
            { className: 'bk-field' },
            h('span', { className: 'bk-label' }, t('form.category')),
            h(
              'select',
              {
                className: 'bk-select',
                value: category,
                onChange: (event) => setCategory(event.target.value),
                'aria-label': t('form.category'),
              },
              visibleCategories.map((id) => h('option', { key: id, value: id }, t(`cat.${id}`))),
            ),
          ),
          h(
            'label',
            { className: 'bk-field' },
            h('span', { className: 'bk-label' }, t('form.date')),
            h('input', {
              className: 'bk-input',
              type: 'date',
              value: date,
              onChange: (event) => setDate(event.target.value),
              'aria-label': t('form.date'),
            }),
          ),
          h(
            'label',
            { className: 'bk-field' },
            h('span', { className: 'bk-label' }, t('form.note')),
            h('input', {
              className: 'bk-input',
              type: 'text',
              maxLength: 200,
              placeholder: t('form.notePlaceholder'),
              value: note,
              onChange: (event) => setNote(event.target.value),
              'aria-label': t('form.note'),
            }),
          ),
        ),
        h(
          'div',
          { className: 'bk-form-actions' },
          localError || formError
            ? h('span', { className: 'bk-form-error', role: 'alert' }, localError || formError)
            : null,
          editing
            ? h('button', { type: 'button', className: 'bk-btn bk-btn--ghost', onClick: onCancel, disabled: saving }, t('action.cancel'))
            : null,
          h(
            'button',
            { type: 'submit', className: 'bk-btn bk-btn--primary', disabled: saving },
            editing ? t('action.save') : t('action.add'),
          ),
        ),
      )
    }

    function EntryRow(props) {
      const { t, entry, confirming, saving, onEdit, onAskDelete, onCancelDelete, onDelete } = props
      const categoryId = entry.category
      const categoryText = t(`cat.${categoryId}`)
      const knownCategory = categoryText !== `cat.${categoryId}`
      return h(
        'div',
        { className: 'bk-row' },
        h('span', { className: `bk-dot bk-dot--${entry.type === 'income' ? 'income' : 'expense'}` }),
        h(
          'div',
          { className: 'bk-row-main' },
          h('div', { className: 'bk-row-title' }, entry.note ? entry.note : knownCategory ? categoryText : categoryId),
          h(
            'div',
            { className: 'bk-row-sub' },
            entry.note && knownCategory ? h('span', null, categoryText) : null,
          ),
        ),
        h(
          'span',
          { className: `bk-row-amount ${entry.type === 'income' ? 'bk-tone-income' : 'bk-tone-expense'}` },
          amountText(entry),
        ),
        confirming
          ? h(
              'div',
              { className: 'bk-confirm' },
              h('span', null, t('action.confirmDelete')),
              h(
                'button',
                { type: 'button', className: 'bk-btn bk-btn--danger', onClick: () => onDelete(entry.id), disabled: saving },
                t('action.delete'),
              ),
              h(
                'button',
                { type: 'button', className: 'bk-btn bk-btn--ghost', onClick: onCancelDelete, disabled: saving },
                t('action.cancel'),
              ),
            )
          : h(
              'div',
              { className: 'bk-row-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'bk-icon-btn',
                  title: t('action.edit'),
                  'aria-label': t('action.edit'),
                  onClick: () => onEdit(entry),
                },
                '✎',
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'bk-icon-btn',
                  title: t('action.delete'),
                  'aria-label': t('action.delete'),
                  onClick: () => onAskDelete(entry.id),
                },
                '🗑',
              ),
            ),
      )
    }

    function LedgerPage(props) {
      const { t, locale } = props
      useLocaleRevision(locale)
      const localeTag = localeTagOf(locale)
      const formRef = useRef(null)

      const [entries, setEntries] = useState([])
      const [status, setStatus] = useState('loading')
      const [error, setError] = useState('')
      const [saving, setSaving] = useState(false)
      const [notice, setNotice] = useState('')
      const [editing, setEditing] = useState(null)
      const [confirmingId, setConfirmingId] = useState(null)
      const [formVersion, setFormVersion] = useState(0)
      const [formError, setFormError] = useState('')
      const [month, setMonth] = useState(currentMonth())
      const [typeFilter, setTypeFilter] = useState('all')
      const [categoryFilter, setCategoryFilter] = useState('all')
      const [query, setQuery] = useState('')
      const fileInputRef = useRef(null)

      const refresh = useCallback(async () => {
        setStatus('loading')
        setError('')
        try {
          const loaded = sortEntries(await loadEntries())
          setEntries(loaded)
          setStatus('ready')
        } catch (failure) {
          setStatus('error')
          setError(fill(t('error.load'), { msg: failure && failure.message ? failure.message : String(failure) }))
        }
      }, [t])

      useEffect(() => {
        refresh()
      }, [refresh])

      const applyMutation = useCallback(
        async (action) => {
          setSaving(true)
          setFormError('')
          setError('')
          try {
            const loaded = sortEntries(await sendAction(action))
            setEntries(loaded)
            setStatus('ready')
            return true
          } catch (failure) {
            setError(fill(t('error.save'), { msg: failure && failure.message ? failure.message : String(failure) }))
            return false
          } finally {
            setSaving(false)
          }
        },
        [t],
      )

      const handleAdd = useCallback(
        async (payload) => {
          const ok = await applyMutation({ action: 'add', entry: payload })
          if (ok) {
            setNotice(t('status.saved'))
            setFormVersion((value) => value + 1)
          }
          return ok
        },
        [applyMutation, t],
      )

      const handleUpdate = useCallback(
        async (payload) => {
          if (!editing) return false
          const ok = await applyMutation({ action: 'update', id: editing.id, patch: payload })
          if (ok) {
            setNotice(t('status.updated'))
            setEditing(null)
            setFormVersion((value) => value + 1)
          }
          return ok
        },
        [applyMutation, editing, t],
      )

      const handleDelete = useCallback(
        async (id) => {
          const ok = await applyMutation({ action: 'delete', id })
          if (ok) {
            setNotice(t('status.deleted'))
            setConfirmingId(null)
          }
          return ok
        },
        [applyMutation, t],
      )

      const startEdit = useCallback((entry) => {
        setEditing(entry)
        setConfirmingId(null)
        setFormError('')
        if (formRef.current && typeof formRef.current.scrollIntoView === 'function') {
          formRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }, [])

      const scoped = useMemo(() => {
        if (!isMonthString(month)) return entries
        return entries.filter((entry) => typeof entry.date === 'string' && entry.date.startsWith(month))
      }, [entries, month])

      const summary = useMemo(() => computeSummary(scoped), [scoped])

      const visible = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return scoped.filter((entry) => {
          if (typeFilter !== 'all' && entry.type !== typeFilter) return false
          if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false
          if (needle.length > 0) {
            const categoryText = t(`cat.${entry.category}`)
            const haystack = `${entry.note || ''} ${entry.category} ${categoryText}`.toLowerCase()
            if (!haystack.includes(needle)) return false
          }
          return true
        })
      }, [scoped, typeFilter, categoryFilter, query, t])

      const groups = useMemo(() => {
        const map = new Map()
        for (const entry of visible) {
          const list = map.get(entry.date) || []
          list.push(entry)
          map.set(entry.date, list)
        }
        return Array.from(map.entries()).sort((left, right) => (left[0] < right[0] ? 1 : -1))
      }, [visible])

      const categoryOptions = useMemo(() => {
        if (typeFilter === 'income') return INCOME_CATEGORIES
        if (typeFilter === 'expense') return EXPENSE_CATEGORIES
        return ALL_CATEGORIES
      }, [typeFilter])

      const rangeHint = isMonthString(month) ? t('summary.hint.month') : t('summary.hint.all')

      function exportFile() {
        downloadJson(entries)
        setNotice('')
      }

      function openImport() {
        if (fileInputRef.current) fileInputRef.current.click()
      }

      async function onImportFile(event) {
        const input = event.target
        const file = input.files && input.files[0] ? input.files[0] : null
        input.value = ''
        if (!file) return
        try {
          const text = await file.text()
          const parsed = JSON.parse(text)
          const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.entries) ? parsed.entries : null
          if (list === null) throw new Error('bad shape')
          const ok = await applyMutation({ action: 'import', entries: list })
          if (ok) setNotice(fill(t('status.imported'), { n: list.length }))
        } catch {
          setError(t('error.importBad'))
        }
      }

      function renderList() {
        if (status === 'loading' && entries.length === 0) {
          return h('div', { className: 'bk-empty' }, t('status.loading'))
        }
        if (scoped.length === 0) {
          return h(
            'div',
            { className: 'bk-empty' },
            h('div', { className: 'bk-empty-title' }, t('list.empty')),
            h('div', null, t('summary.breakdownEmpty')),
          )
        }
        if (visible.length === 0) {
          return h('div', { className: 'bk-empty' }, t('list.emptyFiltered'))
        }
        return h(
          'div',
          { className: 'bk-list' },
          groups.map(([date, dayEntries]) => {
            const daySummary = computeSummary(dayEntries)
            const parts = []
            if (daySummary.expense > 0) parts.push(`${t('summary.expense')} ${formatMoney(daySummary.expense)}`)
            if (daySummary.income > 0) parts.push(`${t('summary.income')} ${formatMoney(daySummary.income)}`)
            return h(
              'div',
              { className: 'bk-day', key: date },
              h(
                'div',
                { className: 'bk-day-head' },
                h('span', null, dayLabel(date, localeTag)),
                h('span', null, parts.join(' · ')),
              ),
              dayEntries.map((entry) =>
                h(EntryRow, {
                  key: entry.id,
                  t,
                  entry,
                  confirming: confirmingId === entry.id,
                  saving,
                  onEdit: startEdit,
                  onAskDelete: (id) => {
                    setConfirmingId(id)
                    setEditing(null)
                  },
                  onCancelDelete: () => setConfirmingId(null),
                  onDelete: handleDelete,
                }),
              ),
            )
          }),
        )
      }

      return h(
        'div',
        { className: 'bk-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'bk-shell' },
          h(
            'header',
            { className: 'bk-head' },
            h(
              'div',
              null,
              h(
                'div',
                { className: 'bk-headline' },
                h('span', { className: 'bk-mark' }, h(LedgerIcon, { size: 22 })),
                h('h1', { className: 'bk-title' }, t('title')),
                h('span', { className: 'bk-badge' }, t('badge.local')),
              ),
              h('p', { className: 'bk-sub' }, t('subtitle')),
            ),
            h(
              'div',
              { className: 'bk-head-actions' },
              h('button', { type: 'button', className: 'bk-btn', onClick: refresh, disabled: status === 'loading' }, t('action.refresh')),
              h('button', { type: 'button', className: 'bk-btn', onClick: exportFile }, t('action.export')),
              h('button', { type: 'button', className: 'bk-btn', onClick: openImport }, t('action.import')),
            ),
          ),
          error
            ? h(
                'div',
                { className: 'bk-banner', role: 'alert' },
                h('span', null, error),
                h('button', { type: 'button', className: 'bk-btn bk-btn--ghost', onClick: refresh }, t('action.retry')),
              )
            : null,
          h(
            'section',
            { className: 'bk-summary' },
            h(SummaryCard, { label: t('summary.expense'), value: formatMoney(summary.expense), tone: 'bk-tone-expense', hint: rangeHint }),
            h(SummaryCard, { label: t('summary.income'), value: formatMoney(summary.income), tone: 'bk-tone-income', hint: rangeHint }),
            h(SummaryCard, { label: t('summary.balance'), value: formatMoney(summary.balance), tone: 'bk-tone-balance', hint: rangeHint }),
          ),
          h(
            'section',
            { className: 'bk-grid' },
            h('div', { ref: formRef }, h(EntryForm, {
              key: editing ? String(editing.id) : `new-${formVersion}`,
              t,
              initial: editing,
              saving,
              formError,
              onSubmit: editing ? handleUpdate : handleAdd,
              onCancel: () => {
                setEditing(null)
                setFormError('')
                setFormVersion((value) => value + 1)
              },
            })),
            h(Breakdown, { t, summary }),
          ),
          h(
            'section',
            { className: 'bk-card bk-ledger' },
            h(
              'div',
              { className: 'bk-toolbar' },
              h(
                'div',
                { className: 'bk-month' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'bk-icon-btn',
                    title: t('toolbar.prevMonth'),
                    'aria-label': t('toolbar.prevMonth'),
                    onClick: () => setMonth((value) => (isMonthString(value) ? shiftMonth(value, -1) : currentMonth())),
                  },
                  '‹',
                ),
                h('span', { className: 'bk-month-label' }, isMonthString(month) ? monthLabel(month, localeTag) : t('range.all')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'bk-icon-btn',
                    title: t('toolbar.nextMonth'),
                    'aria-label': t('toolbar.nextMonth'),
                    onClick: () => setMonth((value) => (isMonthString(value) ? shiftMonth(value, 1) : currentMonth())),
                  },
                  '›',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'bk-seg-btn',
                    'data-active': month === 'all' ? 'true' : 'false',
                    onClick: () => setMonth((value) => (value === 'all' ? currentMonth() : 'all')),
                  },
                  t('toolbar.all'),
                ),
              ),
              h(
                'div',
                { className: 'bk-seg', role: 'tablist' },
                [
                  ['all', t('toolbar.typeAll')],
                  ['expense', t('form.typeExpense')],
                  ['income', t('form.typeIncome')],
                ].map(([value, label]) =>
                  h(
                    'button',
                    {
                      key: value,
                      type: 'button',
                      className: 'bk-seg-btn',
                      'data-active': typeFilter === value ? 'true' : 'false',
                      onClick: () => {
                        setTypeFilter(value)
                        setCategoryFilter('all')
                      },
                    },
                    label,
                  ),
                ),
              ),
              h(
                'select',
                {
                  className: 'bk-select bk-select--compact',
                  value: categoryFilter,
                  onChange: (event) => setCategoryFilter(event.target.value),
                  'aria-label': t('form.category'),
                },
                h('option', { value: 'all' }, t('toolbar.categoryAll')),
                categoryOptions.map((id) => h('option', { key: id, value: id }, t(`cat.${id}`))),
              ),
              h('span', { className: 'bk-toolbar-spacer' }),
              h('input', {
                className: 'bk-input bk-search',
                type: 'search',
                placeholder: t('toolbar.searchPlaceholder'),
                value: query,
                onChange: (event) => setQuery(event.target.value),
                'aria-label': t('toolbar.searchPlaceholder'),
              }),
            ),
            renderList(),
          ),
          h(
            'footer',
            { className: 'bk-status' },
            h('span', null, notice ? notice : status === 'error' ? '' : fill(t('list.count'), { n: visible.length })),
            h('span', null, t('status.footer')),
          ),
        ),
        h('input', {
          ref: fileInputRef,
          type: 'file',
          accept: 'application/json,.json',
          className: 'bk-hidden',
          onChange: onImportFile,
        }),
      )
    }

    // ── plugin ──────────────────────────────────────────────────────────────

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
        let translate = (key) => key
        if (locale && typeof locale.register === 'function' && typeof locale.bind === 'function') {
          try {
            locale.register(NS, 'zh', ZH)
            locale.register(NS, 'en', EN)
            translate = locale.bind(NS)
          } catch (error) {
            translate = (key) => (ZH[key] !== undefined ? ZH[key] : key)
          }
        } else {
          translate = (key) => (ZH[key] !== undefined ? ZH[key] : key)
        }

        const icon = (props) => h(LedgerIcon, props)
        const page = (props) => h(PageBoundary, null, h(LedgerPage, { ...props, locale, t: translate }))

        ctx.effect(() => {
          const disposeIcon = ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: 20,
                label: () => translate('nav.label'),
              },
              icon,
            ),
          )
          const disposePage = ctx.slots.inject('main', () =>
            ctx.slots.register({ name: 'main', key: PANEL_ID }, page),
          )
          return () => {
            if (typeof disposePage === 'function') disposePage()
            if (typeof disposeIcon === 'function') disposeIcon()
          }
        })
      },
    }
  },
})
