import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Financial Snapshot ───────────────────────────────────────────────
export const financialSnapshot = sqliteTable("financial_snapshot", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ppor: real("ppor").default(1510000),
  cash: real("cash").default(220000),
  super_balance: real("super_balance").default(85000),
  stocks: real("stocks").default(0),
  crypto: real("crypto").default(0),
  cars: real("cars").default(65000),
  iran_property: real("iran_property").default(150000),
  mortgage: real("mortgage").default(1200000),
  other_debts: real("other_debts").default(19000),
  monthly_income: real("monthly_income").default(22000),
  monthly_expenses: real("monthly_expenses").default(14540),
  updated_at: text("updated_at").default(new Date().toISOString()),
});

// ─── Expense Categories ───────────────────────────────────────────────
export const expenseCategories = sqliteTable("expense_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").default("#C4A55A"),
  icon: text("icon").default("circle"),
});

// ─── Expense Entries ──────────────────────────────────────────────────
export const expenseEntries = sqliteTable("expense_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  amount: real("amount").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory").default(""),
  description: text("description").default(""),
  payment_method: text("payment_method").default(""),
  family_member: text("family_member").default(""),
  recurring: integer("recurring", { mode: "boolean" }).default(false),
  notes: text("notes").default(""),
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertExpenseSchema = createInsertSchema(expenseEntries).omit({ id: true, created_at: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenseEntries.$inferSelect;

// ─── Properties ───────────────────────────────────────────────────────
export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").default("investment"), // ppor | investment
  purchase_price: real("purchase_price").default(0),
  current_value: real("current_value").default(0),
  purchase_date: text("purchase_date").default(""),
  loan_amount: real("loan_amount").default(0),
  interest_rate: real("interest_rate").default(6.0),
  loan_type: text("loan_type").default("PI"), // PI | IO
  loan_term: integer("loan_term").default(30),
  weekly_rent: real("weekly_rent").default(0),
  rental_growth: real("rental_growth").default(3.0),
  vacancy_rate: real("vacancy_rate").default(2.0),
  management_fee: real("management_fee").default(8.0),
  council_rates: real("council_rates").default(2000),
  insurance: real("insurance").default(2000),
  maintenance: real("maintenance").default(2000),
  capital_growth: real("capital_growth").default(6.0),
  deposit: real("deposit").default(0),
  stamp_duty: real("stamp_duty").default(0),
  legal_fees: real("legal_fees").default(2000),
  selling_costs: real("selling_costs").default(2.5),
  projection_years: integer("projection_years").default(10),
  notes: text("notes").default(""),
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertPropertySchema = createInsertSchema(properties).omit({ id: true, created_at: true });
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;

// ─── Stocks ───────────────────────────────────────────────────────────
export const stocks = sqliteTable("stocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  name: text("name").default(""),
  current_price: real("current_price").default(0),
  current_holding: real("current_holding").default(0),
  allocation_pct: real("allocation_pct").default(0),
  expected_return: real("expected_return").default(10),
  start_date: text("start_date").default(""),
  monthly_dca: real("monthly_dca").default(0),
  dca_start_date: text("dca_start_date").default(""),
  dca_end_date: text("dca_end_date").default(""),
  annual_lump_sum: real("annual_lump_sum").default(0),
  lump_sum_date: text("lump_sum_date").default(""),
  projection_years: integer("projection_years").default(10),
  notes: text("notes").default(""),
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertStockSchema = createInsertSchema(stocks).omit({ id: true, created_at: true });
export type InsertStock = z.infer<typeof insertStockSchema>;
export type Stock = typeof stocks.$inferSelect;

// ─── Crypto ───────────────────────────────────────────────────────────
export const cryptoAssets = sqliteTable("crypto_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  current_price: real("current_price").default(0),
  current_holding: real("current_holding").default(0),
  allocation_pct: real("allocation_pct").default(0),
  expected_return: real("expected_return").default(20),
  start_date: text("start_date").default(""),
  monthly_dca: real("monthly_dca").default(0),
  dca_start: text("dca_start").default(""),
  dca_end: text("dca_end").default(""),
  lump_sum_amount: real("lump_sum_amount").default(0),
  lump_sum_date: text("lump_sum_date").default(""),
  projection_years: integer("projection_years").default(10),
  notes: text("notes").default(""),
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertCryptoSchema = createInsertSchema(cryptoAssets).omit({ id: true, created_at: true });
export type InsertCrypto = z.infer<typeof insertCryptoSchema>;
export type Crypto = typeof cryptoAssets.$inferSelect;

// ─── Income Sources ───────────────────────────────────────────────────
export const incomeSources = sqliteTable("income_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  family_member: text("family_member").default(""),
  amount: real("amount").notNull(),
  frequency: text("frequency").default("monthly"),
  type: text("type").default("salary"),
  start_date: text("start_date").default(""),
  end_date: text("end_date").default(""),
  notes: text("notes").default(""),
});

// ─── Scenarios ────────────────────────────────────────────────────────
export const scenarios = sqliteTable("scenarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").default(""),
  type: text("type").default("general"),
  data: text("data").default("{}"),
  created_at: text("created_at").default(new Date().toISOString()),
  updated_at: text("updated_at").default(new Date().toISOString()),
});

// ─── Settings ─────────────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updated_at: text("updated_at").default(new Date().toISOString()),
});

// ─── Timeline Events ─────────────────────────────────────────────────
export const timelineEvents = sqliteTable("timeline_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").default(""),
  event_date: text("event_date").notNull(),
  type: text("type").default("general"),
  amount: real("amount").default(0),
  impact: text("impact").default("positive"),
  category: text("category").default("other"),
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertTimelineEventSchema = createInsertSchema(timelineEvents).omit({ id: true, created_at: true });
export type InsertTimelineEvent = z.infer<typeof insertTimelineEventSchema>;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
