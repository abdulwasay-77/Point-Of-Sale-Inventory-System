
const prisma = require('../../config/db');
const { findBestMatch } = require('../../utils/fuzzyMatch');
const { userHasPermission } = require('../../utils/effectivePermissions');
const { PERMISSIONS, PERMISSION_MODULE_MAP } = require('../../config/permissions');
const ProductsService = require('../products/products.service');
const InventoryService = require('../inventory/inventory.service');
const ReportsService = require('../reports/reports.service');
const DashboardService = require('../dashboard/dashboard.service');
const PurchasesService = require('../purchases/purchases.service');
const CustomersService = require('../customers/customers.service');
const SuppliersService = require('../suppliers/suppliers.service');
const VariationsService = require('../variations/variations.service');
const KitsService = require('../kits/kits.service');
const WarehousesService = require('../warehouses/warehouses.service');
const TransfersService = require('../transfers/transfers.service');
const PayrollService = require('../payroll/payroll.service');
const ExpensesService = require('../expenses/expenses.service');
const CreditService = require('../credit/credit.service');
const InstallmentsService = require('../installments/installments.service');
const { getDefaultWarehouseId } = require('../../utils/defaultWarehouse');

const AFFIRMATIVE = /^(yes|yep|yeah|y|confirm|do it|go ahead|sure|ok|okay)\.?!?$/i;
const NEGATIVE = /^(no|nope|n|cancel|nevermind|never mind|stop)\.?!?$/i;
const SKIP = /^(skip|none|n\/a|-)$/i;

/**
 * Rule-based intent engine for the internal staff chatbot.
 *
 * Two kinds of multi-turn state get passed back and forth as `pendingAction`
 * (the frontend just echoes back whatever the previous reply gave it):
 *
 *  - mode: 'confirm' — a fully-specified action is proposed; the next
 *    message must be yes/no.
 *  - mode: 'collect' — the action was recognized but is missing required
 *    info (e.g. "add a customer" with no name); the bot asks one question
 *    at a time until it has everything, THEN moves to 'confirm'.
 *
 * Every "answer" intent queries live data — nothing here is hardcoded.
 */
class ChatbotService {
  async handleMessage({ message, pendingAction, user, business }) {
    const trimmed = (message || '').trim();

    if (pendingAction?.mode === 'collect') {
      return this.continueCollection(pendingAction, trimmed, user, business);
    }

    if (pendingAction?.mode === 'confirm') {
      if (AFFIRMATIVE.test(trimmed)) return this.executeAction(pendingAction, user, business);
      if (NEGATIVE.test(trimmed)) return { reply: 'Okay, cancelled — nothing was changed.', pendingAction: null };
      // User asked something else instead of confirming — drop the pending
      // action and treat this as a brand new message rather than erroring.
    }

    const result = await this.matchIntent(trimmed, user, business, pendingAction?.session);
    return this.attachSession(result, pendingAction?.session);
  }

  async matchIntent(text, user, business, session) {
    const msg = text.toLowerCase();

    const contextual = await this.contextFollowUp(msg, user, business, session);
    if (contextual) return contextual;

    for (const intent of this.getIntents()) {
      const match = intent.pattern.exec(msg);
      if (match) {
        return intent.handler(match, user, business, text, session);
      }
    }

    return this.helpReply(user, business, "I didn't quite catch that.");
  }

  getIntents() {
    return [
      { pattern: /^(hi|hello|hey|good (morning|afternoon|evening))\b/i, handler: this.greet.bind(this) },
      { pattern: /what can you do|help me|^help$/i, handler: this.greet.bind(this) },

      { pattern: /what needs my attention|morning briefing|daily summary/i, handler: this.attentionDigest.bind(this) },
      { pattern: /what variations|list variations|variations do we have/i, handler: this.variationsList.bind(this) },
      { pattern: /values? for\s+(.+)/i, handler: this.variationValues.bind(this) },
      { pattern: /what'?s? in (?:kit|bundle)\s+(.+)/i, handler: this.kitContents.bind(this) },
      { pattern: /can we build\s+(\d+)\s+(?:of\s+)?(.+)/i, handler: this.kitAvailability.bind(this) },
      { pattern: /stock of\s+(.+?)\s+in\s+(.+)/i, handler: this.warehouseStock.bind(this) },
      { pattern: /stock across warehouses|warehouse stock/i, handler: this.warehouseOverview.bind(this) },
      { pattern: /pending transfers?|unreceived transfers?/i, handler: this.pendingTransfers.bind(this) },
      { pattern: /this month'?s payroll|monthly payroll|payroll total/i, handler: this.monthlyPayroll.bind(this) },
      { pattern: /(.+?)'?s salary/i, handler: this.employeeSalary.bind(this) },
      { pattern: /expense budget status|budget status/i, handler: this.expenseBudgetStatus.bind(this) },
      { pattern: /who'?s? over budget this month|over budget/i, handler: this.expensesOverBudget.bind(this) },
      { pattern: /(.+?)'?s expenses? this month/i, handler: this.employeeExpenses.bind(this) },
      { pattern: /who owes us money|total outstanding credit|outstanding credit$/i, handler: this.creditOutstanding.bind(this) },
      { pattern: /outstanding credit for\s+(.+)/i, handler: this.customerCredit.bind(this) },
      { pattern: /overdue installments?/i, handler: this.overdueInstallments.bind(this) },
      { pattern: /installment plans? for\s+(.+)/i, handler: this.customerInstallments.bind(this) },
      { pattern: /how many active installment plans?/i, handler: this.activeInstallments.bind(this) },
      { pattern: /undo (?:my )?last action/i, handler: this.undoLastAction.bind(this) },

      { pattern: /low stock|running low|need(s)? (a )?restock|reorder/i, handler: this.lowStock.bind(this) },
      {
        pattern: /how (much|many)\s+(.*?)\s+(do we have|is left|are left|in stock|left)/i,
        handler: this.stockQuery.bind(this),
      },
      { pattern: /stock (?:level|count|of|for)\s+(.+)/i, handler: this.stockQuery.bind(this) },
      { pattern: /(.+?)\s+stock\s*(?:level|count)?$/i, handler: this.stockQuery.bind(this) },

      // Bare / generic queries — no specific product named, so answer with
      // guidance + a live example instead of failing to match at all.
      { pattern: /\bstock levels?\b|\bshow (?:me )?(?:the )?stock\b|\binventory (?:overview|summary)?\b/i, handler: this.stockOverview.bind(this) },
      { pattern: /\b(?:product |all )?prices?\b(?!\s+of\s+\S)/i, handler: this.priceListHelp.bind(this) },

      { pattern: /price of\s+(.+)|how much (?:is|does)\s+(.+?)\s+cost/i, handler: this.priceQuery.bind(this) },
      { pattern: /tell me about\s+(.+)|details (?:of|for)\s+(.+)|info(?:rmation)? (?:on|about)\s+(.+)/i, handler: this.productInfo.bind(this) },

      { pattern: /what categories|list categories|categories do we have/i, handler: this.categoryList.bind(this) },
      { pattern: /how many products?\b/i, handler: this.totalProducts.bind(this) },
      { pattern: /how many customers?\b/i, handler: this.totalCustomers.bind(this) },

      { pattern: /today'?s sales|sales today|how much.*(sold|sell).*today/i, handler: this.todaySales.bind(this) },
      { pattern: /this month'?s sales|monthly sales|sales this month/i, handler: this.monthlySales.bind(this) },
      { pattern: /dashboard|overview|store summary/i, handler: this.dashboardSummary.bind(this) },

      {
        pattern: /contact (?:info|number|details) (?:for|of)\s+(.+)|find customer\s+(.+)|phone number of\s+(.+)/i,
        handler: this.customerLookup.bind(this),
      },
      {
        pattern: /who supplies\s+(.+)|supplier (?:for|of)\s+(.+)|contact (?:for|of) supplier\s+(.+)/i,
        handler: this.supplierLookup.bind(this),
      },

      { pattern: /how do i add a product|how to (?:add|create) a product/i, handler: () => this.howTo('Go to Products → "Add Product", fill in the name, SKU, category, price and starting stock, then save. You can attach a photo too.') },
      { pattern: /how do i record a purchase|how to record a purchase/i, handler: () => this.howTo('Go to Purchases → "New Purchase", pick the supplier, add each product with quantity and cost price, then save — stock updates automatically.') },
      { pattern: /how do i (?:checkout|use pos|make a sale)|how to (?:checkout|use pos)/i, handler: () => this.howTo('Go to POS, search or scan a product to add it to the cart, pick a customer (optional), then hit Checkout to generate the invoice.') },
      { pattern: /how do i add a customer|how to add a customer/i, handler: () => this.howTo('Go to Customers → "Add Customer" and fill in their name, phone, and address — or just tell me "add a customer" and I\'ll ask you for the details right here.') },

      // Actions — fully specified in one message: propose immediately.
      {
        pattern: /(?:add|increase)\s+(\d+)\s+(?:units? of\s+)?(.+?)\s+(?:to|for)\s+stock|(?:add|increase)\s+stock of\s+(.+?)\s+by\s+(\d+)/i,
        handler: this.proposeStockAdjust.bind(this),
      },
      { pattern: /set stock of\s+(.+?)\s+to\s+(\d+)/i, handler: this.proposeSetStock.bind(this) },
      {
        pattern: /record (?:a )?purchase of\s+(\d+)\s+(.+?)\s+from\s+(.+?)\s+at\s+(\d+(?:\.\d+)?)/i,
        handler: this.proposeRecordPurchase.bind(this),
      },
      {
        pattern: /(?:add|create) (?:a |new )?customer (?:named |called )?(.+?)(?:\s+with phone\s+(.+))?$/i,
        handler: this.proposeCreateCustomer.bind(this),
      },

      // Actions — recognized intent but missing required info: start a
      // guided collection flow instead of failing.
      { pattern: /(?:add|increase|adjust)\s+stock\b|\badjust\s+(?:the\s+)?stock\b/i, handler: () => this.startCollection('ADJUST_STOCK') },
      { pattern: /record\s+(?:a\s+)?purchase\b|\bnew purchase\b/i, handler: () => this.startCollection('RECORD_PURCHASE') },
      { pattern: /(?:add|create)\s+(?:a\s+|new\s+)?customer\b/i, handler: () => this.startCollection('CREATE_CUSTOMER') },
    ];
  }

  // ---------- Read-only intents ----------

  async greet(_match, user, business) {
    return this.helpReply(user, business, 'Hi!');
    /*
    return {
      reply:
        "Hi! I can answer questions about stock, prices, sales, customers and suppliers, or perform a few limited actions (adjusting stock, recording a purchase, adding a customer) if you have permission — I'll ask for any missing details and always confirm before doing anything. Try \"how much Wash Basin do we have\" or just \"add a customer\".",
      pendingAction: null,
    };
    */
  }

  /** Checks the same permission-to-module mapping used by the role UI,
   * so the chatbot never creates a second, drifting feature map. */
  async canAccess(user, business, permission) {
    const requiredModule = PERMISSION_MODULE_MAP[permission];
    if (requiredModule && !business?.enabled_modules?.includes(requiredModule)) return { allowed: false, reason: 'module' };
    return (await userHasPermission(user.userId, permission)) ? { allowed: true } : { allowed: false, reason: 'permission' };
  }

  async requireAccess(user, business, permission) {
    const access = await this.canAccess(user, business, permission);
    if (access.allowed) return null;
    return { reply: access.reason === 'module' ? "That feature isn't part of your business plan." : "You don't have permission to view that information.", pendingAction: null };
  }

  async helpReply(user, business, prefix) {
    const topics = [
      ['stock, low-stock alerts, and product prices', PERMISSIONS.INVENTORY_VIEW], ['sales and dashboard summaries', PERMISSIONS.SALES_VIEW],
      ['customers and suppliers', PERMISSIONS.CUSTOMERS_MANAGE], ['variations', PERMISSIONS.VARIATIONS_MANAGE], ['kits and bundles', PERMISSIONS.KITS_MANAGE],
      ['warehouses and transfers', PERMISSIONS.TRANSFERS_VIEW], ['payroll', PERMISSIONS.PAYROLL_MANAGE], ['expense budgets', PERMISSIONS.EXPENSES_MANAGE],
      ['customer credit', PERMISSIONS.CREDIT_MANAGE], ['installment plans', PERMISSIONS.INSTALLMENTS_MANAGE],
    ];
    const allowed = [];
    for (const [label, permission] of topics) if ((await this.canAccess(user, business, permission)).allowed) allowed.push(label);
    const actions = [];
    for (const [label, permission] of [['adjust stock', PERMISSIONS.PRODUCTS_EDIT], ['record purchases', PERMISSIONS.PURCHASES_CREATE], ['add customers', PERMISSIONS.CUSTOMERS_MANAGE]]) {
      if ((await this.canAccess(user, business, permission)).allowed && (await userHasPermission(user.userId, PERMISSIONS.CHATBOT_ACTIONS))) actions.push(label);
    }
    return { reply: `${prefix} I can help with ${allowed.length ? allowed.join(', ') : 'the features your account can access'}.${actions.length ? ` I can also ${actions.join(', ')} after you explicitly confirm.` : ''}`, pendingAction: null };
  }

  /** The client already round-trips pendingAction, so a small context-only
   * state object gives deterministic pronouns without a database session. */
  attachSession(result, previousSession) {
    if (result.pendingAction?.mode === 'confirm' || result.pendingAction?.mode === 'collect') {
      return { ...result, pendingAction: { ...result.pendingAction, session: previousSession } };
    }
    const session = { ...(previousSession || {}) };
    if (result.context) session.entity = result.context;
    return { ...result, pendingAction: Object.keys(session).length ? { mode: 'context', session } : null };
  }

  async contextFollowUp(msg, _user, _business, session) {
    const entity = session?.entity;
    if (entity?.type !== 'product' || !/\b(it|its|that)\b/.test(msg)) return null;
    const product = await ProductsService.getById(entity.id);
    if (/price|cost/.test(msg)) return { reply: `${product.name} is priced at ${product.price} (PKR).`, data: product, context: entity, pendingAction: null };
    if (/stock|how many/.test(msg)) return { reply: `${product.name} (${product.sku}) currently has ${product.stock} in stock.`, data: product, context: entity, pendingAction: null };
    return null;
  }

  async lowStock() {
    const items = await InventoryService.getLowStock();
    if (items.length === 0) {
      return { reply: "Nothing is currently low on stock — you're all good.", pendingAction: null };
    }
    const lines = items.slice(0, 10).map((p) => `• ${p.name} (${p.sku}) — ${p.stock} left`);
    return { reply: `${items.length} product(s) are low on stock:\n${lines.join('\n')}`, data: items, pendingAction: null };
  }

  async stockOverview() {
    const [all, low] = await Promise.all([InventoryService.getAll(), InventoryService.getLowStock()]);
    const example = all[0] ? ` — try asking "how much ${all[0].name} do we have" for one specifically.` : '';
    return {
      reply: `You have ${all.length} products tracked, ${low.length} of them below their reorder threshold.${example} Or ask "what's low on stock" for the full list.`,
      pendingAction: null,
    };
  }

  async priceListHelp() {
    const products = await ProductsService.getAll();
    const examples = products.slice(0, 3).map((p) => p.name);
    return {
      reply: `I can look up a specific product's price — try "price of ${examples[0] || 'a product'}"${examples[1] ? `, or "how much does ${examples[1]} cost"` : ''}. For the full price list, check the Products page.`,
      pendingAction: null,
    };
  }

  async resolveProduct(name) {
    const products = await ProductsService.getAll();
    return findBestMatch(name.trim(), products, { minScore: 0.4 });
  }

  async stockQuery(match) {
    const name = (match[2] || match[1] || '').trim();
    if (!name) return this.stockOverview();
    const found = await this.resolveProduct(name);
    if (!found) return { reply: `I couldn't find a product matching "${name}".`, pendingAction: null };
    const p = found.match;
    return {
      reply: `${p.name} (${p.sku}) currently has ${p.stock} in stock${p.lowStock ? " — that's below the reorder threshold." : '.'}`,
      data: p, context: { type: 'product', id: p.id, name: p.name },
      pendingAction: null,
    };
  }

  async priceQuery(match) {
    const name = (match[1] || match[2] || '').trim();
    const found = await this.resolveProduct(name);
    if (!found) return { reply: `I couldn't find a product matching "${name}".`, pendingAction: null };
    const p = found.match;
    return { reply: `${p.name} is priced at ${p.price} (PKR).`, data: p, context: { type: 'product', id: p.id, name: p.name }, pendingAction: null };
  }

  async productInfo(match) {
    const name = (match[1] || match[2] || match[3] || '').trim();
    const found = await this.resolveProduct(name);
    if (!found) return { reply: `I couldn't find a product matching "${name}".`, pendingAction: null };
    const p = found.match;
    return {
      reply: `${p.name} — SKU ${p.sku}, category ${p.category}, priced at ${p.price} PKR, ${p.stock} in stock.`,
      data: p, context: { type: 'product', id: p.id, name: p.name },
      pendingAction: null,
    };
  }

  async categoryList() {
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    if (categories.length === 0) return { reply: 'No categories have been created yet.', pendingAction: null };
    return { reply: `Categories: ${categories.map((c) => c.name).join(', ')}.`, pendingAction: null };
  }

  async totalProducts() {
    const count = await prisma.product.count({ where: { is_active: true } });
    return { reply: `There are ${count} active products in the catalog.`, pendingAction: null };
  }

  async totalCustomers() {
    const count = await prisma.customer.count({ where: { is_active: true, name: { not: 'Walk-in Customer' } } });
    return { reply: `There are ${count} customers on file.`, pendingAction: null };
  }

  async todaySales() {
    const report = await ReportsService.todaySales();
    return { reply: `Today: ${report.count} sale(s) totaling ${report.total.toFixed(2)} PKR.`, data: report, pendingAction: null };
  }

  async monthlySales() {
    const report = await ReportsService.monthlySales();
    return { reply: `This month: ${report.count} sale(s) totaling ${report.total.toFixed(2)} PKR.`, data: report, pendingAction: null };
  }

  async dashboardSummary() {
    const summary = await DashboardService.getSummary();
    return {
      reply: `${summary.totalProducts} products, ${summary.totalCustomers} customers, ${summary.todaysSales.toFixed(2)} PKR in sales today, and ${summary.lowStockCount} product(s) low on stock.`,
      data: summary,
      pendingAction: null,
    };
  }

  async customerLookup(match) {
    const name = (match[1] || match[2] || match[3] || '').trim();
    const customersRes = await CustomersService.getAll();
    const found = findBestMatch(name, customersRes, { minScore: 0.4 });
    if (!found) return { reply: `I couldn't find a customer matching "${name}".`, pendingAction: null };
    const c = found.match;
    return { reply: `${c.name} — phone ${c.phone}${c.address ? `, address: ${c.address}` : ''}.`, data: c, pendingAction: null };
  }

  async supplierLookup(match) {
    const name = (match[1] || match[2] || match[3] || '').trim();
    const suppliers = await SuppliersService.getAll();
    const found = findBestMatch(name, suppliers, { minScore: 0.4 });
    if (found) {
      const s = found.match;
      return { reply: `${s.name} — phone ${s.phone}${s.address ? `, address: ${s.address}` : ''}.`, data: s, pendingAction: null };
    }
    const productMatch = await this.resolveProduct(name);
    if (productMatch) {
      return { reply: `I don't track a specific supplier per product yet — check the Purchases page for past orders of ${productMatch.match.name}.`, pendingAction: null };
    }
    return { reply: `I couldn't find a supplier or product matching "${name}".`, pendingAction: null };
  }

  async variationsList(_match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.VARIATIONS_MANAGE); if (denied) return denied;
    const variations = await VariationsService.getAll();
    return { reply: variations.length ? `Variations: ${variations.map((v) => `${v.name} (${v.values.length} values)`).join(', ')}.` : 'No variations have been created yet.', pendingAction: null };
  }

  async variationValues(match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.VARIATIONS_MANAGE); if (denied) return denied;
    const variations = await VariationsService.getAll(); const found = findBestMatch(match[1].trim(), variations, { minScore: 0.4 });
    if (!found) return { reply: `I couldn't find a variation matching "${match[1].trim()}".`, pendingAction: null };
    const v = found.match; return { reply: `${v.name}: ${v.values.map((x) => x.value).join(', ') || 'no values yet'}.`, data: v, pendingAction: null };
  }

  async kitContents(match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.KITS_MANAGE); if (denied) return denied;
    const kits = await KitsService.getAll(); const found = findBestMatch(match[1].trim(), kits, { minScore: 0.4 });
    if (!found) return { reply: `I couldn't find a kit matching "${match[1].trim()}".`, pendingAction: null };
    const k = found.match; return { reply: `${k.name} contains: ${k.components.map((c) => `${c.quantity} × ${c.product}`).join(', ')}. You can build ${k.availableQty} now.`, data: k, pendingAction: null };
  }

  async kitAvailability(match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.KITS_MANAGE); if (denied) return denied;
    const qty = Number(match[1]); const kits = await KitsService.getAll(); const found = findBestMatch(match[2].trim(), kits, { minScore: 0.4 });
    if (!found) return { reply: `I couldn't find a kit matching "${match[2].trim()}".`, pendingAction: null };
    const k = found.match; return { reply: k.availableQty >= qty ? `Yes — ${k.name} can build ${qty}; ${k.availableQty} are available from current component stock.` : `Not yet — ${k.name} can build ${k.availableQty}, short of the ${qty} requested.`, data: k, pendingAction: null };
  }

  async warehouseStock(match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.WAREHOUSES_MANAGE); if (denied) return denied;
    const product = await this.resolveProduct(match[1]); if (!product) return { reply: `I couldn't find a product matching "${match[1]}".`, pendingAction: null };
    const warehouses = await WarehousesService.getAll(); const warehouse = findBestMatch(match[2].trim(), warehouses, { minScore: 0.4 });
    if (!warehouse) return { reply: `I couldn't find a warehouse matching "${match[2].trim()}".`, pendingAction: null };
    const level = product.match.byWarehouse.find((x) => x.warehouseId === warehouse.match.id);
    return { reply: `${product.match.name} has ${level?.quantity || 0} in ${warehouse.match.name}.`, data: { product: product.match, warehouse: warehouse.match }, pendingAction: null };
  }

  async warehouseOverview(_match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.WAREHOUSES_MANAGE); if (denied) return denied;
    const warehouses = await WarehousesService.getAll();
    return { reply: warehouses.length ? `Warehouse stock: ${warehouses.map((w) => `${w.name} (${w.totalStock})`).join(', ')}.` : 'No warehouses have been created yet.', data: warehouses, pendingAction: null };
  }

  async pendingTransfers(_match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.TRANSFERS_VIEW); if (denied) return denied;
    const transfers = await TransfersService.getAll(); const pending = transfers.filter((t) => !['COMPLETED', 'RECEIVED'].includes(t.status));
    return { reply: pending.length ? `${pending.length} transfer(s) are pending: ${pending.slice(0, 5).map((t) => `${t.product} (${t.from} → ${t.to})`).join(', ')}.` : 'There are no pending transfers.', data: pending, pendingAction: null };
  }

  async monthlyPayroll(_match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.PAYROLL_MANAGE); if (denied) return denied;
    const now = new Date(); const records = await PayrollService.getRecords(); const current = records.filter((r) => new Date(r.periodStart).getMonth() === now.getMonth() && new Date(r.periodStart).getFullYear() === now.getFullYear());
    const total = current.reduce((sum, r) => sum + r.totalPayable, 0); return { reply: `This month's payroll: ${current.length} record(s), totaling ${total.toFixed(2)} PKR.`, data: current, pendingAction: null };
  }

  async employeeSalary(match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.PAYROLL_MANAGE); if (denied) return denied;
    const employees = await PayrollService.getAllEmployees(); const found = findBestMatch(match[1].trim(), employees, { minScore: 0.4 });
    if (!found) return { reply: `I couldn't find an employee matching "${match[1].trim()}".`, pendingAction: null };
    const e = found.match; return { reply: `${e.name}'s base salary is ${e.baseSalary.toFixed(2)} PKR.`, data: e, pendingAction: null };
  }

  async expenseBudgetStatus(_match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.EXPENSES_MANAGE); if (denied) return denied;
    const budget = await ExpensesService.getBudgetSummary(); return { reply: `Expense budget: ${budget.currentBalance.toFixed(2)} PKR remaining of ${budget.totalAmount.toFixed(2)} PKR (${budget.spent.toFixed(2)} spent).`, data: budget, pendingAction: null };
  }

  async expensesOverBudget(_match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.EXPENSES_MANAGE); if (denied) return denied;
    const budget = await ExpensesService.getBudgetSummary(); return { reply: budget.currentBalance < 0 ? `The expense budget is overrun by ${Math.abs(budget.currentBalance).toFixed(2)} PKR.` : 'No expense budget overrun — the current budget is within its limit.', data: budget, pendingAction: null };
  }

  async employeeExpenses(match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.EXPENSES_MANAGE); if (denied) return denied;
    const employees = await PayrollService.getAllEmployees(); const found = findBestMatch(match[1].trim(), employees, { minScore: 0.4 });
    if (!found) return { reply: `I couldn't find an employee matching "${match[1].trim()}".`, pendingAction: null };
    const history = await ExpensesService.getHistory({ employeeId: found.match.id, range: 'monthly' }); return { reply: `${found.match.name}'s expenses this month: ${history.summary.count} item(s), ${history.summary.totalSpent.toFixed(2)} PKR.`, data: history, pendingAction: null };
  }

  async creditOutstanding(_match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.CREDIT_MANAGE); if (denied) return denied;
    const rows = await CreditService.getOutstanding(); const total = rows.reduce((sum, r) => sum + r.balanceDue, 0); const overdue = rows.filter((r) => r.isOverdue);
    return { reply: rows.length ? `${rows.length} customer credit balance(s) total ${total.toFixed(2)} PKR; ${overdue.length} are overdue. ${rows.slice(0, 5).map((r) => `${r.customerName} (${r.balanceDue.toFixed(2)})`).join(', ')}.` : 'No customers currently owe a credit balance.', data: rows, pendingAction: null };
  }

  async customerCredit(match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.CREDIT_MANAGE); if (denied) return denied;
    const customers = await CustomersService.getAll(); const found = findBestMatch(match[1].trim(), customers, { minScore: 0.4 });
    if (!found) return { reply: `I couldn't find a customer matching "${match[1].trim()}".`, pendingAction: null };
    const credit = await CreditService.getByCustomer(found.match.id); const outstanding = credit.invoices.reduce((sum, i) => sum + i.balanceDue, 0);
    return { reply: `${found.match.name} has ${outstanding.toFixed(2)} PKR outstanding credit.`, data: credit, pendingAction: null };
  }

  async overdueInstallments(_match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.INSTALLMENTS_MANAGE); if (denied) return denied;
    const plans = await InstallmentsService.getAll(); const overdue = plans.filter((p) => p.installments.some((i) => i.isOverdue));
    return { reply: overdue.length ? `${overdue.length} installment plan(s) have overdue payments: ${overdue.slice(0, 5).map((p) => p.customerName).join(', ')}.` : 'There are no overdue installment payments.', data: overdue, pendingAction: null };
  }

  async customerInstallments(match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.INSTALLMENTS_MANAGE); if (denied) return denied;
    const customers = await CustomersService.getAll(); const found = findBestMatch(match[1].trim(), customers, { minScore: 0.4 });
    if (!found) return { reply: `I couldn't find a customer matching "${match[1].trim()}".`, pendingAction: null };
    const plans = (await InstallmentsService.getAll()).filter((p) => p.customerId === found.match.id); return { reply: plans.length ? `${found.match.name} has ${plans.length} installment plan(s): ${plans.map((p) => `${p.status} (${p.remainingCount} remaining)`).join(', ')}.` : `${found.match.name} has no installment plans.`, data: plans, pendingAction: null };
  }

  async activeInstallments(_match, user, business) {
    const denied = await this.requireAccess(user, business, PERMISSIONS.INSTALLMENTS_MANAGE); if (denied) return denied;
    const plans = await InstallmentsService.getAll(); const active = plans.filter((p) => p.status !== 'COMPLETED'); return { reply: `There are ${active.length} active installment plan(s).`, data: active, pendingAction: null };
  }

  /** Builds the briefing from the same module services as the individual
   * answers. Each probe is independently gated so unavailable areas stay
   * invisible instead of appearing as misleading empty sections. */
  async attentionDigest(_match, user, business) {
    const sections = [];
    if ((await this.canAccess(user, business, PERMISSIONS.INVENTORY_VIEW)).allowed) {
      const low = await InventoryService.getLowStock();
      if (low.length) sections.push(`Low stock (${low.length}): ${low.slice(0, 5).map((p) => p.name).join(', ')}`);
    }
    if ((await this.canAccess(user, business, PERMISSIONS.INSTALLMENTS_MANAGE)).allowed) {
      const overdue = (await InstallmentsService.getAll()).filter((p) => p.installments.some((i) => i.isOverdue));
      if (overdue.length) sections.push(`Overdue installments (${overdue.length}): ${overdue.slice(0, 5).map((p) => p.customerName).join(', ')}`);
    }
    if ((await this.canAccess(user, business, PERMISSIONS.CREDIT_MANAGE)).allowed) {
      const overdue = (await CreditService.getOutstanding()).filter((r) => r.isOverdue);
      if (overdue.length) sections.push(`Overdue customer credit (${overdue.length}): ${overdue.slice(0, 5).map((r) => `${r.customerName} (${r.balanceDue.toFixed(2)} PKR)`).join(', ')}`);
    }
    if ((await this.canAccess(user, business, PERMISSIONS.EXPENSES_MANAGE)).allowed) {
      const budget = await ExpensesService.getBudgetSummary();
      if (budget.currentBalance < 0) sections.push(`Expense budget overrun: ${Math.abs(budget.currentBalance).toFixed(2)} PKR`);
    }
    if ((await this.canAccess(user, business, PERMISSIONS.PURCHASES_VIEW)).allowed) {
      const purchases = await PurchasesService.getAll(); const pending = purchases.filter((p) => !['RECEIVED', 'COMPLETED'].includes(p.status));
      if (pending.length) sections.push(`Pending purchase orders (${pending.length}): ${pending.slice(0, 5).map((p) => p.poNumber).join(', ')}`);
    }
    return { reply: sections.length ? `Here is what needs attention:\n${sections.map((s) => `• ${s}`).join('\n')}` : 'Everything that you can view looks in good shape — nothing needs attention right now.', pendingAction: null };
  }

  howTo(instructions) {
    return { reply: instructions, pendingAction: null };
  }

  // ---------- Action intents — fully specified, propose directly ----------

  async proposeStockAdjust(match) {
    const qty = Number(match[1] || match[4]);
    const name = (match[2] || match[3] || '').trim();
    const found = await this.resolveProduct(name);
    if (!found) return { reply: `I couldn't find a product matching "${name}".`, pendingAction: null };
    const p = found.match;
    return {
      reply: `Add ${qty} units to "${p.name}" stock (currently ${p.stock}, would become ${p.stock + qty})? Reply "yes" to confirm.`,
      pendingAction: {
        mode: 'confirm',
        type: 'ADJUST_STOCK',
        description: `Add ${qty} units to ${p.name}`,
        payload: { productId: p.id, delta: qty },
      },
    };
  }

  async proposeSetStock(match) {
    const name = match[1].trim();
    const target = Number(match[2]);
    const found = await this.resolveProduct(name);
    if (!found) return { reply: `I couldn't find a product matching "${name}".`, pendingAction: null };
    const p = found.match;
    return {
      reply: `Set "${p.name}" stock from ${p.stock} to ${target}? Reply "yes" to confirm.`,
      pendingAction: { mode: 'confirm', type: 'SET_STOCK', description: `Set ${p.name} stock to ${target}`, payload: { productId: p.id, target } },
    };
  }

  async proposeRecordPurchase(match) {
    const qty = Number(match[1]);
    const productName = match[2].trim();
    const supplierName = match[3].trim();
    const costPrice = Number(match[4]);

    const [productFound, suppliers] = await Promise.all([this.resolveProduct(productName), SuppliersService.getAll()]);
    const supplierFound = findBestMatch(supplierName, suppliers, { minScore: 0.4 });

    if (!productFound) return { reply: `I couldn't find a product matching "${productName}".`, pendingAction: null };
    if (!supplierFound) return { reply: `I couldn't find a supplier matching "${supplierName}".`, pendingAction: null };

    const p = productFound.match;
    const s = supplierFound.match;
    return {
      reply: `Record a purchase of ${qty} × ${p.name} from ${s.name} at ${costPrice} each (total ${(qty * costPrice).toFixed(2)} PKR)? Reply "yes" to confirm.`,
      pendingAction: {
        mode: 'confirm',
        type: 'RECORD_PURCHASE',
        description: `Purchase ${qty} × ${p.name} from ${s.name}`,
        payload: { supplierId: s.id, items: [{ productId: p.id, quantity: qty, costPrice }] },
      },
    };
  }

  async proposeCreateCustomer(match) {
    const name = match[1].trim();
    const phone = (match[2] || '-').trim();
    return {
      reply: `Create a new customer "${name}"${phone !== '-' ? ` with phone ${phone}` : ''}? Reply "yes" to confirm.`,
      pendingAction: { mode: 'confirm', type: 'CREATE_CUSTOMER', description: `Create customer ${name}`, payload: { name, phone } },
    };
  }

  // ---------- Guided collection flows (recognized action, missing info) ----------

  /**
   * Defines what to ask, in what order, for each action that can be
   * started without enough info in the first message. Each step either
   * takes free text directly, or resolves it against live data first
   * (e.g. "product" has to match a real product before we move on).
   */
  getActionFlows() {
    return {
      CREATE_CUSTOMER: {
        steps: ['name', 'phone', 'address'],
        optional: ['phone', 'address'],
        prompt: {
          name: "Sure — what's the customer's name?",
          phone: "Got it. What's their phone number? (or say \"skip\")",
          address: 'And their address? (or say "skip")',
        },
        finalize: (data) => ({
          type: 'CREATE_CUSTOMER',
          description: `Create customer ${data.name}`,
          payload: { name: data.name, phone: data.phone === '-' ? '-' : data.phone, address: data.address },
          summary: `Create a new customer "${data.name}"${data.phone && data.phone !== '-' ? `, phone ${data.phone}` : ''}${data.address ? `, address ${data.address}` : ''}?`,
        }),
      },
      ADJUST_STOCK: {
        steps: ['product', 'delta'],
        prompt: {
          product: 'Sure — which product?',
          delta: 'How many units should I add? (use a negative number to reduce stock)',
        },
        resolve: {
          product: async (text) => {
            const found = await this.resolveProduct(text);
            return found ? { value: found.match, label: found.match.name } : null;
          },
        },
        parse: {
          delta: (text) => {
            const n = Number(text.replace(/[^\d.-]/g, ''));
            return Number.isFinite(n) && n !== 0 ? n : null;
          },
        },
        finalize: (data) => ({
          type: 'ADJUST_STOCK',
          description: `Adjust ${data.product.name} stock by ${data.delta}`,
          payload: { productId: data.product.id, delta: data.delta },
          summary: `${data.delta > 0 ? 'Add' : 'Remove'} ${Math.abs(data.delta)} units ${data.delta > 0 ? 'to' : 'from'} "${data.product.name}" stock (currently ${data.product.stock})?`,
        }),
      },
      RECORD_PURCHASE: {
        steps: ['supplier', 'product', 'quantity', 'costPrice'],
        prompt: {
          supplier: "Sure — what's the purchase for? Which supplier is it from?",
          product: 'Which product are you purchasing?',
          quantity: 'How many units?',
          costPrice: "What's the cost price per unit?",
        },
        resolve: {
          supplier: async (text) => {
            const suppliers = await SuppliersService.getAll();
            const found = findBestMatch(text, suppliers, { minScore: 0.4 });
            return found ? { value: found.match, label: found.match.name } : null;
          },
          product: async (text) => {
            const found = await this.resolveProduct(text);
            return found ? { value: found.match, label: found.match.name } : null;
          },
        },
        parse: {
          quantity: (text) => {
            const n = Number(text.replace(/[^\d.]/g, ''));
            return Number.isFinite(n) && n > 0 ? n : null;
          },
          costPrice: (text) => {
            const n = Number(text.replace(/[^\d.]/g, ''));
            return Number.isFinite(n) && n > 0 ? n : null;
          },
        },
        finalize: (data) => ({
          type: 'RECORD_PURCHASE',
          description: `Purchase ${data.quantity} × ${data.product.name} from ${data.supplier.name}`,
          payload: {
            supplierId: data.supplier.id,
            items: [{ productId: data.product.id, quantity: data.quantity, costPrice: data.costPrice }],
          },
          summary: `Record a purchase of ${data.quantity} × ${data.product.name} from ${data.supplier.name} at ${data.costPrice} each (total ${(data.quantity * data.costPrice).toFixed(2)} PKR)?`,
        }),
      },
    };
  }

  startCollection(type) {
    const flow = this.getActionFlows()[type];
    const firstStep = flow.steps[0];
    return {
      reply: flow.prompt[firstStep],
      pendingAction: { mode: 'collect', type, step: firstStep, data: {} },
    };
  }

  async continueCollection(pendingAction, text, user) {
    const flow = this.getActionFlows()[pendingAction.type];
    if (!flow) return { reply: "Sorry, I lost track of that — let's start over.", pendingAction: null };

    const { step, data } = pendingAction;
    const isOptional = flow.optional?.includes(step);

    if (isOptional && SKIP.test(text)) {
      // leave this field unset and move on
    } else if (flow.resolve?.[step]) {
      const resolved = await flow.resolve[step](text);
      if (!resolved) {
        return {
          reply: `I couldn't find a match for "${text}". Try again, or say "cancel" to stop.`,
          pendingAction,
        };
      }
      data[step] = resolved.value;
    } else if (flow.parse?.[step]) {
      const parsed = flow.parse[step](text);
      if (parsed === null) {
        return { reply: `That doesn't look like a valid value. ${flow.prompt[step]}`, pendingAction };
      }
      data[step] = parsed;
    } else {
      if (NEGATIVE.test(text)) return { reply: 'Okay, cancelled.', pendingAction: null };
      data[step] = text;
    }

    const currentIndex = flow.steps.indexOf(step);
    const nextStep = flow.steps[currentIndex + 1];

    if (nextStep) {
      return { reply: flow.prompt[nextStep], pendingAction: { mode: 'collect', type: pendingAction.type, step: nextStep, data } };
    }

    // All steps collected — move to confirmation.
    const finalized = flow.finalize(data);
    return {
      reply: `${finalized.summary} Reply "yes" to confirm.`,
      pendingAction: { mode: 'confirm', type: finalized.type, description: finalized.description, payload: finalized.payload },
    };
  }

  // ---------- Action execution ----------

  async executeAction(pendingAction, user, business) {
    const permissionMap = {
      ADJUST_STOCK: PERMISSIONS.PRODUCTS_EDIT,
      SET_STOCK: PERMISSIONS.PRODUCTS_EDIT,
      RECORD_PURCHASE: PERMISSIONS.PURCHASES_CREATE,
      CREATE_CUSTOMER: PERMISSIONS.CUSTOMERS_MANAGE,
    };

    const hasChatbotActions = await userHasPermission(user.userId, PERMISSIONS.CHATBOT_ACTIONS);
    if (!hasChatbotActions) {
      return {
        reply: "You don't have permission to let the chatbot perform actions. Ask an admin to grant it, or do this from the relevant page instead.",
        pendingAction: null,
      };
    }

    const requiredPermission = permissionMap[pendingAction.type];
    const access = requiredPermission ? await this.canAccess(user, business, requiredPermission) : { allowed: false };
    const hasPermission = access.allowed;
    if (!hasPermission) {
      return { reply: "You don't have permission to do that. Ask an admin, or use the relevant page instead.", pendingAction: null };
    }

    try {
      let result;
      switch (pendingAction.type) {
        case 'ADJUST_STOCK':
          result = await this.execAdjustStock(pendingAction.payload, user);
          return this.attachSession(result, { lastAction: { type: 'ADJUST_STOCK', payload: pendingAction.payload } });
        case 'SET_STOCK':
          result = await this.execSetStock(pendingAction.payload, user);
          return { ...result, pendingAction: { mode: 'context', session: { lastAction: { type: 'UNSAFE', label: 'setting stock' } } } };
        case 'RECORD_PURCHASE':
          result = await this.execRecordPurchase(pendingAction.payload, user);
          return { ...result, pendingAction: { mode: 'context', session: { lastAction: { type: 'UNSAFE', label: 'recording a purchase' } } } };
        case 'CREATE_CUSTOMER':
          result = await this.execCreateCustomer(pendingAction.payload);
          return { ...result, pendingAction: { mode: 'context', session: { lastAction: { type: 'UNSAFE', label: 'creating a customer' } } } };
        default:
          return { reply: "I don't recognize that action anymore — please ask again.", pendingAction: null };
      }
    } catch (error) {
      return { reply: `That didn't work: ${error.message}`, pendingAction: null };
    }
  }

  async undoLastAction(_match, user, business, _text, session) {
    const last = session?.lastAction;
    if (!last) return { reply: "I don't have a chatbot action from this session to undo.", pendingAction: null };
    if (last.type !== 'ADJUST_STOCK') return { reply: `I can't safely undo ${last.label || 'that action'} because it may have changed related records.`, pendingAction: null };
    const access = await this.canAccess(user, business, PERMISSIONS.PRODUCTS_EDIT);
    if (!access.allowed) return { reply: access.reason === 'module' ? "That feature isn't part of your business plan." : "You don't have permission to undo that stock adjustment.", pendingAction: null };
    const product = await ProductsService.getById(last.payload.productId);
    if (product.stock - last.payload.delta < 0) {
      return { reply: "I can't safely undo that adjustment because subsequent stock changes mean it would take stock below zero.", pendingAction: null };
    }
    const result = await this.execAdjustStock({ productId: last.payload.productId, delta: -last.payload.delta }, user);
    return { ...result, reply: `Undone — ${result.reply.replace(/^Done — /, '')}`, pendingAction: { mode: 'context', session: {} } };
  }

  async execAdjustStock({ productId, delta }, user) {
    const warehouseId = await getDefaultWarehouseId();
    const level = await prisma.stockLevel.findFirst({ where: { product_id: productId, warehouse_id: warehouseId } });
    if (level) {
      await prisma.stockLevel.update({ where: { id: level.id }, data: { quantity: { increment: delta } } });
    } else {
      await prisma.stockLevel.create({ data: { product_id: productId, warehouse_id: warehouseId, quantity: Math.max(0, delta) } });
    }
    await prisma.stockMovement.create({
      data: {
        product_id: productId,
        warehouse_id: warehouseId,
        movement_type: 'ADJUSTMENT',
        quantity: delta,
        reference_note: 'Adjusted via chatbot',
        created_by: user.userId,
      },
    });
    const product = await ProductsService.getById(productId);
    return { reply: `Done — ${product.name} is now at ${product.stock} in stock.`, pendingAction: null };
  }

  async execSetStock({ productId, target }, user) {
    const product = await ProductsService.getById(productId);
    await ProductsService.update(productId, { stock: target, created_by: user.userId }, null);
    const updated = await ProductsService.getById(productId);
    return { reply: `Done — ${product.name} stock is now ${updated.stock}.`, pendingAction: null };
  }

  async execRecordPurchase({ supplierId, items }, user) {
    const purchase = await PurchasesService.create({ supplierId, items, createdBy: user.userId });
    return { reply: `Done — purchase recorded (${purchase.poNumber}), stock updated.`, pendingAction: null };
  }

  async execCreateCustomer({ name, phone, address }) {
    const customer = await CustomersService.create({ name, phone: phone && phone !== '-' ? phone : '-', address: address || null });
    return { reply: `Done — added customer "${customer.name}".`, pendingAction: null };
  }
}

module.exports = new ChatbotService();
