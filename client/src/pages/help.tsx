/**
 * help.tsx — Shahrokh Family Financial Planner
 * Complete help and documentation page covering every feature,
 * calculation methodology, and FAQ.
 */

import { useState, useMemo } from "react";
import {
  LayoutDashboard, Receipt, Home, TrendingUp, Bitcoin,
  FileText, Calculator, Activity, Settings, Shield,
  Trash2, Cloud, FileSpreadsheet, FileDown, Search,
  ChevronDown, ChevronRight, Info, AlertTriangle, CheckCircle,
  HelpCircle, BookOpen, Zap, Database,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  color: string;
  content: React.ReactNode;
}

// ─── Reusable sub-components ──────────────────────────────────────────────────

function Callout({ type, children }: { type: "info" | "warning" | "tip"; children: React.ReactNode }) {
  const styles = {
    info:    { bg: "hsl(210,50%,10%)",  border: "hsl(210,60%,35%)", icon: <Info className="w-3.5 h-3.5 shrink-0 text-blue-400" />,    text: "text-blue-300"    },
    warning: { bg: "hsl(40,50%,10%)",   border: "hsl(43,60%,35%)",  icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-yellow-400" />, text: "text-yellow-300" },
    tip:     { bg: "hsl(142,50%,8%)",   border: "hsl(142,50%,30%)", icon: <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-400" />, text: "text-emerald-300" },
  };
  const s = styles[type];
  return (
    <div className="flex gap-2.5 rounded-lg px-3 py-2.5 text-xs my-3"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}>
      {s.icon}
      <span className={s.text}>{children}</span>
    </div>
  );
}

function Formula({ label, formula, description }: { label: string; formula: string; description?: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 my-2">
      <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wider">{label}</p>
      <code className="text-sm font-mono" style={{ color: "hsl(43,85%,65%)" }}>{formula}</code>
      {description && <p className="text-xs text-muted-foreground mt-1.5">{description}</p>}
    </div>
  );
}

function FieldList({ fields }: { fields: { name: string; desc: string }[] }) {
  return (
    <div className="space-y-1.5 my-3">
      {fields.map(f => (
        <div key={f.name} className="flex gap-2 text-xs">
          <span className="font-semibold text-foreground whitespace-nowrap min-w-[140px]">{f.name}</span>
          <span className="text-muted-foreground">{f.desc}</span>
        </div>
      ))}
    </div>
  );
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return <div className="text-sm leading-relaxed text-muted-foreground space-y-3">{children}</div>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold uppercase tracking-wider mt-4 mb-2" style={{ color: "hsl(43,85%,65%)" }}>{children}</h3>;
}

// ─── Section content definitions ─────────────────────────────────────────────

const SECTIONS: Section[] = [
  // ── Dashboard ───────────────────────────────────────────────────────────────
  {
    id: "dashboard",
    icon: <LayoutDashboard className="w-4 h-4" />,
    title: "Dashboard",
    color: "hsl(43,85%,55%)",
    content: (
      <SectionBody>
        <p>The Dashboard is your financial command centre. It aggregates data from every other section — snapshot values, property, stocks, crypto, and expenses — into a single real-time view of your household wealth.</p>

        <H3>KPI Cards</H3>
        <FieldList fields={[
          { name: "Net Worth",        desc: "Total assets minus total liabilities. Updates instantly when you save any financial data." },
          { name: "Monthly Surplus",  desc: "Monthly income minus monthly expenses from the Financial Snapshot." },
          { name: "Total Investments",desc: "Sum of stock portfolio value + crypto portfolio value (calculated from holdings × current price)." },
          { name: "Property Equity",  desc: "PPOR current value minus mortgage balance. Does not include investment property equity." },
          { name: "Debt Balance",     desc: "Mortgage + all other debts entered in the snapshot." },
          { name: "10-Year Forecast", desc: "Projected net worth in year 10, based on asset growth rates, contributions, and monthly surplus." },
          { name: "Passive Income",   desc: "Estimated rental income + dividend income from year 1 of the forecast." },
          { name: "Savings Rate",     desc: "Monthly surplus ÷ monthly income, expressed as a percentage." },
        ]} />

        <H3>Financial Snapshot</H3>
        <p>The snapshot stores your key financial balances. Click <strong className="text-foreground">Edit</strong> to update values, then Save. These feed every calculation in the app.</p>
        <FieldList fields={[
          { name: "PPOR",             desc: "Principal Place of Residence — your home's current estimated value." },
          { name: "Cash",             desc: "Total liquid cash across all bank accounts and offset accounts." },
          { name: "Super",            desc: "Combined superannuation balance for the household." },
          { name: "Cars",             desc: "Estimated current market value of all vehicles." },
          { name: "Iran Property",    desc: "Any overseas property value (estimated in AUD)." },
          { name: "Mortgage",         desc: "Outstanding PPOR mortgage balance." },
          { name: "Other Debts",      desc: "Car loans, personal loans, credit card balances, HECS, etc." },
          { name: "Monthly Income",   desc: "Combined take-home income (after tax) for the household." },
          { name: "Monthly Expenses", desc: "Estimated total monthly spending (used for forecast when no actuals exist)." },
        ]} />

        <H3>Charts</H3>
        <FieldList fields={[
          { name: "10-Year Net Worth Growth", desc: "Projects net worth year-by-year using growth rates for each asset class." },
          { name: "Asset Allocation",          desc: "Pie chart showing the percentage breakdown of all assets." },
          { name: "Monthly Cash Flow",         desc: "Bar chart of income vs expenses vs surplus based on snapshot values." },
          { name: "Expense Breakdown",         desc: "Pie chart of spending by category from the Expenses table." },
          { name: "Master Cash Flow Forecast", desc: "Line chart 2025–2035. Past months use actual expenses; future months use snapshot assumptions." },
          { name: "Year-by-Year Table",        desc: "Detailed 10-year projection table with 16 columns covering every asset class and liability." },
        ]} />

        <Callout type="info">
          The "Sync From Cloud" button forces a fresh pull from Supabase and invalidates all local caches. Use this if data looks stale after making changes on another device.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Expenses ─────────────────────────────────────────────────────────────────
  {
    id: "expenses",
    icon: <Receipt className="w-4 h-4" />,
    title: "Expenses",
    color: "hsl(0,72%,51%)",
    content: (
      <SectionBody>
        <p>The Expenses page tracks every household transaction. Data here is used in the Master Cash Flow Forecast to replace estimated expenses with actual figures for months that have passed.</p>

        <H3>Adding an Expense</H3>
        <p>Click <strong className="text-foreground">Add Expense</strong> or press the + button. Fill in the form and press Save or hit <kbd className="bg-secondary px-1.5 py-0.5 rounded text-xs text-foreground">Enter</kbd>.</p>
        <FieldList fields={[
          { name: "Date",            desc: "Transaction date (YYYY-MM-DD). Used for monthly grouping in charts." },
          { name: "Amount",          desc: "Amount in AUD. Must be greater than zero." },
          { name: "Category",        desc: "One of 17 preset categories (Mortgage, Childcare, Groceries, etc.)." },
          { name: "Sub-category",    desc: "Optional free-text label for finer classification." },
          { name: "Description",     desc: "Free-text description of the transaction." },
          { name: "Payment Method",  desc: "Bank Transfer, Credit Card, Debit Card, Cash, Offset Account, BPAY." },
          { name: "Family Member",   desc: "Roham, Fara, Yara, Jana, or Family." },
          { name: "Recurring",       desc: "Tick if this is a regular recurring payment. Used for double-count detection." },
          { name: "Notes",           desc: "Optional additional notes." },
        ]} />

        <H3>Filters</H3>
        <p>Filter the table before selecting rows for bulk delete or analysis. Filters apply to all analytics cards and charts on the page.</p>
        <FieldList fields={[
          { name: "Search",          desc: "Searches description, category, and notes fields." },
          { name: "Year / Month",    desc: "Filter by calendar year or specific month." },
          { name: "Category",        desc: "Show only a specific spending category." },
          { name: "Advanced",        desc: "Date range, sub-category, family member, payment method." },
        ]} />

        <H3>Bulk Delete</H3>
        <p>Click any row (or its checkbox) to select it. Once rows are selected a red toolbar appears:</p>
        <ul className="list-disc pl-4 space-y-1 text-xs">
          <li>Select page — selects all rows on the current page (20 rows)</li>
          <li>Select all X filtered — selects every row matching current filters</li>
          <li>Select all X records — selects every expense in the database</li>
          <li>Delete X records — opens the confirmation modal</li>
        </ul>
        <Callout type="warning">
          Bulk delete requires password <strong>YaraJana2025</strong> + ticking the confirmation checkbox. An optional Excel backup export is offered before deletion.
        </Callout>

        <H3>Excel Import / Export</H3>
        <FieldList fields={[
          { name: "Export",          desc: "Downloads all expenses as an Excel file." },
          { name: "Template",        desc: "Downloads a blank Excel template with correct column headers." },
          { name: "Import Excel",    desc: "Uploads an Excel file. Each row is saved as an individual expense to Supabase." },
        ]} />

        <H3>Analytics</H3>
        <p>Charts update dynamically based on the current filter selection:</p>
        <FieldList fields={[
          { name: "Spending by Category", desc: "Pie chart of filtered expenses grouped by category." },
          { name: "Monthly Spend Trend",  desc: "Bar chart of total spend per calendar month." },
          { name: "Weekly Spend Trend",   desc: "Line chart of total spend per week." },
          { name: "Avg Monthly by Cat",   desc: "Average monthly spend per category as a horizontal bar." },
        ]} />
      </SectionBody>
    ),
  },

  // ── Property ─────────────────────────────────────────────────────────────────
  {
    id: "property",
    icon: <Home className="w-4 h-4" />,
    title: "Property",
    color: "hsl(142,60%,45%)",
    content: (
      <SectionBody>
        <p>The Property page is an Australian investment property simulator. Each property card models a full purchase, hold, and sale lifecycle with date-aware cash flow projections.</p>

        <H3>Form Sections</H3>
        <FieldList fields={[
          { name: "Purchase Details",  desc: "Name, type, purchase date, settlement date, purchase price, deposit, stamp duty (QLD auto-estimated), legal fees, building & pest, loan setup fees." },
          { name: "Loan Details",      desc: "Loan amount (auto = price − deposit), interest rate, loan type (P&I or Interest Only), loan term, IO period dates. Monthly repayment auto-calculated." },
          { name: "Current Status",    desc: "Current value and annual capital growth % used for projections." },
          { name: "Rental Income",     desc: "Rental start date, weekly rent, annual rental growth %, vacancy %, management fee %." },
          { name: "Running Costs",     desc: "Annual: insurance, council rates, water, maintenance, body corporate, land tax, renovation costs." },
          { name: "Sale Planning",     desc: "Planned sale date, selling costs %, CGT estimate (50% discount if held > 12 months)." },
        ]} />

        <H3>Auto-Calculated Outputs</H3>
        <Formula label="Monthly Repayment (P&I)"
          formula="P × r(1+r)^n / ((1+r)^n − 1)"
          description="Where P = loan amount, r = monthly rate (annual rate ÷ 12), n = total months." />
        <Formula label="Monthly Cash Flow"
          formula="(Weekly Rent × 52/12 × (1 − Vacancy%) × (1 − Mgmt Fee%)) − Monthly Repayment − (Annual Costs / 12)"
          description="Positive = cash flow positive property. Negative = negatively geared." />
        <Formula label="Gross Yield"
          formula="(Weekly Rent × 52 / Current Value) × 100" />
        <Formula label="Net Yield"
          formula="((Weekly Rent × 52 − Annual Costs) / Current Value) × 100" />
        <Formula label="LVR"
          formula="(Loan Balance / Current Value) × 100" />
        <Formula label="Property Equity"
          formula="Current Value − Loan Balance" />
        <Formula label="QLD Stamp Duty (estimate)"
          formula="Sliding scale: 1% up to $350k, 3.5% on $350k–$540k, 4.5% on excess over $540k (simplified estimate)" />
        <Formula label="CGT Estimate"
          formula="(Sale Price − Purchase Price − Costs) × 50% discount if held > 12 months"
          description="Added to taxable income in the Tax Calculator. Does not reduce dashboard net worth automatically." />

        <H3>Date-Aware Projections</H3>
        <p>If a property's purchase date is in the future, the chart and year-by-year table show $0 for all values (value, equity, loan, cash flow) before that year. This prevents future purchases from distorting current net worth calculations.</p>

        <Callout type="info">
          Investment property values and loan balances feed into the 10-year net worth projection on the Dashboard. Only properties with a past or present purchase date contribute to current net worth.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Stocks ───────────────────────────────────────────────────────────────────
  {
    id: "stocks",
    icon: <TrendingUp className="w-4 h-4" />,
    title: "Stocks",
    color: "hsl(188,60%,48%)",
    content: (
      <SectionBody>
        <p>The Stocks page is a manual portfolio tracker. There is no live market data feed — all prices are entered manually. This keeps the app offline-capable and avoids third-party API dependencies.</p>

        <H3>Per-Stock Fields</H3>
        <FieldList fields={[
          { name: "Ticker",             desc: "ASX or US stock ticker code (e.g. NVDA, VAS)." },
          { name: "Company Name",       desc: "Display name for the holding." },
          { name: "Units Owned",        desc: "Number of shares/units currently held." },
          { name: "Average Buy Price",  desc: "Your average cost per unit across all purchases." },
          { name: "Current Price",      desc: "Latest market price — enter manually when you want to update." },
          { name: "Monthly DCA",        desc: "Dollar amount added each month via dollar-cost averaging." },
          { name: "Expected Return %",  desc: "Annual expected return used for 10-year projection." },
          { name: "Projection Years",   desc: "How many years to project forward (default 10)." },
          { name: "Target Allocation %", desc: "Your desired allocation to this stock as % of total portfolio." },
        ]} />

        <H3>Auto-Calculated Fields</H3>
        <Formula label="Current Value"    formula="Units Owned × Current Price" />
        <Formula label="Total Invested"   formula="Units Owned × Average Buy Price" />
        <Formula label="Unrealised G/L"   formula="Current Value − Total Invested" />
        <Formula label="Gain/Loss %"      formula="(Current Value − Total Invested) / Total Invested × 100" />
        <Formula label="Actual Allocation"formula="Current Value / Total Portfolio Value × 100" />
        <Formula label="10-Year Forecast" formula="FV = PV × (1 + r)^n + PMT × ((1 + r)^n − 1) / r"
          description="Where PV = current value, r = monthly return, n = months, PMT = monthly DCA." />

        <H3>Portfolio Summary</H3>
        <p>Above the table, four KPI cards show: Total Invested, Current Portfolio Value, Total Unrealised Gain/Loss, and combined gain/loss percentage. The allocation pie shows actual vs target drift.</p>

        <Callout type="tip">
          The total stock portfolio value is fed back into the Dashboard's Asset Allocation chart and Net Worth calculation automatically.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Crypto ───────────────────────────────────────────────────────────────────
  {
    id: "crypto",
    icon: <Bitcoin className="w-4 h-4" />,
    title: "Crypto",
    color: "hsl(43,85%,55%)",
    content: (
      <SectionBody>
        <p>The Crypto page works identically to Stocks but is tailored for cryptocurrency holdings. Holdings are stored with up to 8 decimal places for precision with small-denomination assets.</p>

        <H3>Per-Asset Fields</H3>
        <FieldList fields={[
          { name: "Symbol",            desc: "Crypto ticker (BTC, ETH, SOL, etc.)." },
          { name: "Asset Name",        desc: "Full name (Bitcoin, Ethereum, etc.)." },
          { name: "Units Owned",       desc: "Amount of the asset held (up to 8 decimal places)." },
          { name: "Average Buy Price", desc: "Average cost per unit in AUD." },
          { name: "Current Price",     desc: "Latest price in AUD — enter manually." },
          { name: "Monthly DCA",       desc: "Regular monthly purchase amount." },
          { name: "Expected Return %", desc: "Annual growth rate used for projection." },
        ]} />

        <H3>Calculations</H3>
        <Formula label="Current Value"   formula="Units × Current Price" />
        <Formula label="Total Invested"  formula="Units × Average Buy Price" />
        <Formula label="Unrealised G/L"  formula="Current Value − Total Invested" />

        <Callout type="warning">
          Crypto valuations are volatile. The expected return % you set is used for long-term projection only. The current value shown is based on your manually entered current price — update it regularly for accurate net worth figures.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Reports ──────────────────────────────────────────────────────────────────
  {
    id: "reports",
    icon: <FileText className="w-4 h-4" />,
    title: "Reports",
    color: "hsl(270,60%,60%)",
    content: (
      <SectionBody>
        <p>The Reports page lets you export your full financial picture, save scenario snapshots, and review a high-level summary of all data in one place.</p>

        <H3>Export Options</H3>
        <FieldList fields={[
          { name: "Export Excel",    desc: "Exports all tables (snapshot, expenses, properties, stocks, crypto, projections) as separate sheets in a single Excel workbook." },
          { name: "Export PDF",      desc: "Generates a formatted PDF report containing net worth summary, asset allocation, 10-year projection, and expense breakdown." },
          { name: "Export JSON",     desc: "Full raw backup of all data in JSON format. Can be re-imported via Settings > Import Backup." },
        ]} />

        <H3>Scenarios</H3>
        <p>A scenario is a saved snapshot of your current data at a point in time. Save a scenario before making major changes so you can compare different strategies (e.g. "Buy IP in 2027" vs "Invest in ETFs instead").</p>
        <FieldList fields={[
          { name: "Save Scenario",    desc: "Saves the current snapshot, properties, stocks, and crypto data as a named scenario." },
          { name: "Load Scenario",    desc: "Restores all data to the saved scenario state." },
          { name: "Delete Scenario",  desc: "Bulk delete with password confirmation." },
        ]} />

        <Callout type="info">
          PDF export uses jsPDF + autoTable. Charts are not included in the PDF — only tabular data. For a visual report, use the Export Excel option which includes chart-ready data.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Tax Calculator ───────────────────────────────────────────────────────────
  {
    id: "tax",
    icon: <Calculator className="w-4 h-4" />,
    title: "Tax Calculator",
    color: "hsl(20,80%,55%)",
    content: (
      <SectionBody>
        <p>The Tax Calculator estimates Australian income tax for both household members based on 2024-25 ATO tax brackets. All results are estimates only and do not constitute tax advice.</p>

        <H3>Income Tax Brackets (2024-25)</H3>
        <div className="rounded-lg overflow-hidden border border-border text-xs my-3">
          <table className="w-full">
            <thead><tr className="bg-secondary/50"><th className="text-left px-3 py-2 font-semibold">Taxable Income</th><th className="text-left px-3 py-2 font-semibold">Rate</th></tr></thead>
            <tbody className="divide-y divide-border">
              {[
                ["$0 – $18,200", "Nil"],
                ["$18,201 – $45,000", "19c per $1 over $18,200"],
                ["$45,001 – $120,000", "$5,092 + 32.5c per $1 over $45,000"],
                ["$120,001 – $180,000", "$29,467 + 37c per $1 over $120,000"],
                ["$180,001+", "$51,667 + 45c per $1 over $180,000"],
              ].map(([range, rate]) => (
                <tr key={range} className="hover:bg-secondary/20">
                  <td className="px-3 py-1.5 text-muted-foreground">{range}</td>
                  <td className="px-3 py-1.5">{rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H3>Additional Levies & Offsets</H3>
        <FieldList fields={[
          { name: "Medicare Levy",    desc: "2% of taxable income. Phase-in applies for incomes between $26,000–$32,500." },
          { name: "LITO",             desc: "Low Income Tax Offset: up to $700 for income under $37,500. Reduces to $0 at $66,667." },
          { name: "LMITO",            desc: "Low and Middle Income Tax Offset: $675 for incomes $37,000–$126,000." },
        ]} />

        <H3>Investment Property Section</H3>
        <p>Enter rental income and property expenses to calculate negative gearing. The negative gearing amount (when expenses exceed income) reduces your taxable income. Click <strong className="text-foreground">Auto-fill</strong> next to any property to pull its data directly from the Property page.</p>
        <Formula label="Negative Gearing"
          formula="Rental Income − (Interest + Rates + Insurance + Maintenance + Other Costs)"
          description="Negative result = negatively geared. Reduces taxable income by that amount." />

        <H3>Capital Gains Tax</H3>
        <Formula label="Capital Gain"
          formula="Sale Price − Purchase Price − Acquisition/Selling Costs" />
        <Formula label="CGT with Discount"
          formula="Capital Gain × 50% (if asset held > 12 months)"
          description="The discounted gain is added to taxable income for the year of sale." />

        <Callout type="warning">
          This calculator is a planning tool only. Actual tax will differ based on your specific circumstances, deductions, and ATO assessments. Always consult a registered tax agent for advice.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Net Worth Timeline ────────────────────────────────────────────────────────
  {
    id: "timeline",
    icon: <TrendingUp className="w-4 h-4" />,
    title: "Net Worth Timeline",
    color: "hsl(188,60%,48%)",
    content: (
      <SectionBody>
        <p>The Net Worth Timeline page shows a detailed month-by-month and year-by-year projection of your household wealth from today to 2035, with four interactive chart views.</p>

        <H3>Data Sources</H3>
        <FieldList fields={[
          { name: "Past months",   desc: "Uses actual expenses from the Expenses table where available." },
          { name: "Future months", desc: "Uses Monthly Income and Monthly Expenses from the Financial Snapshot." },
          { name: "Property",      desc: "Each property grows at its Capital Growth % per year. Loans reduce by P&I repayments." },
          { name: "Stocks",        desc: "Portfolio grows at the weighted average Expected Return %, plus monthly DCA additions." },
          { name: "Crypto",        desc: "Same methodology as stocks." },
          { name: "Super",         desc: "Grows at 8% p.a. by default (configurable in Settings)." },
          { name: "Cash",          desc: "Current cash + accumulated monthly surplus over time." },
        ]} />

        <H3>Charts</H3>
        <FieldList fields={[
          { name: "Net Worth over Time",       desc: "Gold area chart showing total net worth (assets − liabilities) year by year." },
          { name: "Assets vs Liabilities",     desc: "Stacked area chart showing total assets and total liabilities separately." },
          { name: "Cash Flow over Time",       desc: "Line chart of income, expenses, and net cash flow per period." },
          { name: "Property Equity over Time", desc: "Area chart of combined property equity as mortgage balances reduce." },
        ]} />

        <H3>Actual vs Forecast Logic</H3>
        <p>The model blends actual data with forecasts to give the most accurate possible picture:</p>
        <ul className="list-disc pl-4 space-y-1 text-xs">
          <li>For any month where expense records exist in the Expenses table, actual total spending is used instead of the snapshot estimate.</li>
          <li>For future months with no data, the snapshot's monthly_expenses value is used.</li>
          <li>The model checks for double-counting: if your snapshot's monthly_expenses already includes mortgage and childcare, but those also appear as individual expense records, the actual month's total is used directly — not added on top of the snapshot figure.</li>
        </ul>

        <Callout type="tip">
          Switch between Monthly and Annual view using the toggle at the top of the page. Annual view shows the full 10-year span; Monthly view shows the last 12 and next 12 months in detail.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Data Health ──────────────────────────────────────────────────────────────
  {
    id: "data-health",
    icon: <Activity className="w-4 h-4" />,
    title: "Data Health",
    color: "hsl(142,60%,45%)",
    content: (
      <SectionBody>
        <p>The Data Health page is your data maintenance hub. It shows the state of your Supabase sync, detects data quality issues, and provides tools to clean, backup, and restore data.</p>

        <H3>Status Indicators</H3>
        <FieldList fields={[
          { name: "Supabase Connection", desc: "Green = connected and responding. Red = unable to reach the database. Tested on page load." },
          { name: "Last Synced",         desc: "Timestamp of the most recent successful sync (from localStorage)." },
          { name: "Record Counts",       desc: "Number of rows in each Supabase table: expenses, properties, stocks, crypto, timeline, scenarios." },
        ]} />

        <H3>Data Quality Checks</H3>
        <FieldList fields={[
          { name: "Duplicate Expenses",  desc: "Expenses sharing the same date + amount + category. Common after re-importing a file." },
          { name: "Missing Dates",       desc: "Expenses with a null or empty date field." },
          { name: "Missing Categories",  desc: "Expenses with no category assigned." },
          { name: "Invalid Amounts",     desc: "Expenses with an amount of $0 or less, or a non-numeric value." },
          { name: "Large Expenses",      desc: "Any single expense over $5,000 is flagged for review." },
        ]} />

        <H3>Actions</H3>
        <FieldList fields={[
          { name: "Sync from Cloud",         desc: "Pulls all data fresh from Supabase and overwrites the local cache." },
          { name: "Clear Cache & Reload",    desc: "Clears all localStorage sf_* keys, then fetches fresh from Supabase." },
          { name: "Export Full Backup JSON", desc: "Exports all tables as a single JSON file." },
          { name: "Export Expenses Excel",   desc: "Exports only the expenses table as xlsx." },
          { name: "Delete Duplicates",       desc: "Shows duplicate groups and allows selective deletion. Requires password + checkbox." },
        ]} />

        <Callout type="tip">
          Run a Data Health check after every large Excel import to catch duplicates before they distort your expense analytics and cash flow forecasts.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Settings ─────────────────────────────────────────────────────────────────
  {
    id: "settings",
    icon: <Settings className="w-4 h-4" />,
    title: "Settings",
    color: "hsl(220,10%,60%)",
    content: (
      <SectionBody>
        <p>The Settings page lets you configure forecast assumptions, manage your profile, and backup or restore all data.</p>

        <H3>Forecast Assumptions</H3>
        <FieldList fields={[
          { name: "Inflation Rate",         desc: "Used to adjust real returns in long-term projections. Default: 3%." },
          { name: "PPOR Growth Rate",       desc: "Annual capital growth applied to your home value. Default: 6%." },
          { name: "Super Return Rate",      desc: "Annual return on superannuation. Default: 8%." },
          { name: "Safe Withdrawal Rate",   desc: "Used to estimate sustainable passive income from investments. Default: 4%." },
          { name: "Risk Profile",           desc: "Conservative / Moderate / Aggressive. May influence default expected return suggestions." },
        ]} />

        <H3>User Profile</H3>
        <FieldList fields={[
          { name: "Display Name",  desc: "Your name as shown in the app." },
          { name: "Currency",      desc: "Display currency (AUD default)." },
          { name: "Timezone",      desc: "Australia/Brisbane default." },
        ]} />

        <H3>Backup & Restore</H3>
        <FieldList fields={[
          { name: "Export All Data",  desc: "Downloads a full JSON backup of all tables." },
          { name: "Import Backup",    desc: "Restores from a previously exported JSON backup. Merges with existing data." },
        ]} />
      </SectionBody>
    ),
  },

  // ── Privacy Mode ─────────────────────────────────────────────────────────────
  {
    id: "privacy",
    icon: <Shield className="w-4 h-4" />,
    title: "Privacy Mode",
    color: "hsl(270,60%,60%)",
    content: (
      <SectionBody>
        <p>Privacy Mode hides all sensitive financial values from the screen without affecting any calculations, database values, exports, or Supabase sync.</p>

        <H3>How to Toggle</H3>
        <p>The <strong className="text-foreground">Show Values / Hide Values</strong> button is in the top navigation bar. It is visible on every page after login.</p>
        <ul className="list-disc pl-4 space-y-1 text-xs">
          <li>Default state: <strong className="text-foreground">Hidden</strong> (Privacy Mode ON) on first login</li>
          <li>Your preference is saved to localStorage and persists across page refreshes and sessions</li>
          <li>Each device/browser stores its own privacy preference independently</li>
        </ul>

        <H3>What Is Hidden</H3>
        <ul className="list-disc pl-4 space-y-1 text-xs">
          <li>All dollar amounts: replaced with <code className="bg-secondary px-1 rounded">$••••••</code></li>
          <li>All percentages: replaced with <code className="bg-secondary px-1 rounded">•••%</code></li>
          <li>Dashboard KPI values, snapshot values, totals</li>
          <li>Expense amounts, property values, stock/crypto values</li>
          <li>10-year projection table values</li>
        </ul>

        <H3>What Is Not Affected</H3>
        <ul className="list-disc pl-4 space-y-1 text-xs">
          <li>Labels and headings remain visible</li>
          <li>Charts still render (data is calculated normally)</li>
          <li>All calculations run on real numbers</li>
          <li>Supabase sync continues normally</li>
          <li>Exports always include real values</li>
        </ul>

        <Callout type="info">
          Privacy Mode is designed for screen-sharing or working in a public space. Toggle it off when you need to review actual numbers.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Bulk Delete ───────────────────────────────────────────────────────────────
  {
    id: "bulk-delete",
    icon: <Trash2 className="w-4 h-4" />,
    title: "Bulk Delete",
    color: "hsl(0,72%,51%)",
    content: (
      <SectionBody>
        <p>Bulk delete is available on: Expenses, Property, Stocks, Crypto, and Reports (scenarios). It always requires password + checkbox confirmation and can never be triggered by a single click.</p>

        <H3>Step-by-Step for Expenses</H3>
        <ol className="list-decimal pl-4 space-y-1.5 text-xs">
          <li>Apply filters if you want to target a specific subset (e.g. all expenses from 2024)</li>
          <li>Click any row to select it, or use the checkbox column on the left</li>
          <li>Use the red toolbar that appears: <em>Select page</em>, <em>Select all filtered</em>, or <em>Select all records</em></li>
          <li>Click <strong className="text-foreground">Delete X records</strong></li>
          <li>In the modal: optionally click <strong className="text-foreground">Export backup before deleting</strong></li>
          <li>Enter the password: <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground">YaraJana2025</code></li>
          <li>Tick "I understand this action cannot be undone"</li>
          <li>Click the final red <strong className="text-foreground">Delete</strong> button</li>
        </ol>

        <H3>After Deletion</H3>
        <p>Deleted records are removed from Supabase immediately and the local cache is updated. The table, dashboard totals, and all charts refresh automatically. There is no undo.</p>

        <Callout type="warning">
          Always export a backup before running a large bulk delete. The backup is an Excel file containing all selected records that you can re-import if needed.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Supabase Sync ─────────────────────────────────────────────────────────────
  {
    id: "supabase",
    icon: <Cloud className="w-4 h-4" />,
    title: "Supabase Sync",
    color: "hsl(142,60%,45%)",
    content: (
      <SectionBody>
        <p>Supabase is the cloud database that powers cross-device synchronisation. Your data is stored in a PostgreSQL database hosted on Supabase's Australian infrastructure and accessible from any device without a backend server.</p>

        <H3>How Sync Works</H3>
        <FieldList fields={[
          { name: "On Save",         desc: "Every save operation writes to Supabase first, then updates the local browser cache." },
          { name: "On Page Load",    desc: "Every page navigation fetches fresh data from Supabase (staleTime = 0). TanStack Query always re-fetches on mount." },
          { name: "On Tab Focus",    desc: "Switching back to the app tab triggers a background refetch from Supabase." },
          { name: "localStorage",    desc: "Used as a fallback cache only. If Supabase is unreachable, the last cached values are shown." },
        ]} />

        <H3>Tables Used</H3>
        <div className="rounded-lg overflow-hidden border border-border text-xs my-3">
          <table className="w-full">
            <thead><tr className="bg-secondary/50"><th className="text-left px-3 py-2 font-semibold">Table</th><th className="text-left px-3 py-2 font-semibold">Contents</th></tr></thead>
            <tbody className="divide-y divide-border">
              {[
                ["sf_snapshot", "Single row (id = shahrokh-family-main). All financial snapshot fields."],
                ["sf_expenses", "All expense records. Integer auto-increment PK."],
                ["sf_properties", "All property records with all simulator fields."],
                ["sf_stocks", "All stock holdings."],
                ["sf_crypto", "All crypto holdings."],
                ["sf_timeline", "Timeline events for the net worth timeline."],
                ["sf_scenarios", "Saved report scenarios."],
              ].map(([table, desc]) => (
                <tr key={table} className="hover:bg-secondary/20">
                  <td className="px-3 py-1.5 font-mono" style={{ color: "hsl(43,85%,65%)" }}>{table}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H3>Console Log Reference</H3>
        <FieldList fields={[
          { name: "[SF] Loaded from Supabase", desc: "Data was successfully read from the cloud database." },
          { name: "[SF] Saved to Supabase",    desc: "A write operation succeeded." },
          { name: "[SF] Fallback to local cache", desc: "Supabase was unreachable; local data was used instead." },
        ]} />

        <Callout type="tip">
          If your data looks out of sync between desktop and mobile, use the <strong>Sync from Cloud</strong> button on the Dashboard or the Data Health page. This forces a full re-read from Supabase.
        </Callout>
      </SectionBody>
    ),
  },

  // ── Excel Import / Export ─────────────────────────────────────────────────────
  {
    id: "excel",
    icon: <FileSpreadsheet className="w-4 h-4" />,
    title: "Excel Import / Export",
    color: "hsl(142,60%,45%)",
    content: (
      <SectionBody>
        <p>The app can import and export data in Excel (.xlsx) format. This is the primary way to bulk-load expense history or extract data for external analysis.</p>

        <H3>Importing Expenses</H3>
        <ol className="list-decimal pl-4 space-y-1.5 text-xs">
          <li>Go to the Expenses page</li>
          <li>Click <strong className="text-foreground">Template</strong> to download the correct column format</li>
          <li>Fill in your data following the template structure</li>
          <li>Click <strong className="text-foreground">Import Excel</strong> and select your file</li>
          <li>Each row is validated and saved to Supabase as an individual expense</li>
        </ol>

        <H3>Template Column Order</H3>
        <FieldList fields={[
          { name: "Column A: Date",           desc: "Format: YYYY-MM-DD (e.g. 2026-01-15)" },
          { name: "Column B: Amount",         desc: "Numeric, in AUD (e.g. 2500)" },
          { name: "Column C: Category",       desc: "Must match one of the 17 preset categories" },
          { name: "Column D: Sub-category",   desc: "Optional free text" },
          { name: "Column E: Description",    desc: "Optional free text" },
          { name: "Column F: Payment Method", desc: "Optional (Bank Transfer, Credit Card, etc.)" },
          { name: "Column G: Family Member",  desc: "Optional (Roham Shahrokh, Fara Ghiyasi, etc.)" },
          { name: "Column H: Recurring",      desc: "Yes or No" },
          { name: "Column I: Notes",          desc: "Optional free text" },
        ]} />

        <Callout type="warning">
          After importing, go to Data Health to check for duplicate records — especially if you import the same file twice by mistake.
        </Callout>

        <H3>Exporting</H3>
        <FieldList fields={[
          { name: "Expenses Export",    desc: "All expenses as a single sheet with all columns." },
          { name: "Reports Export",     desc: "Multi-sheet workbook: summary, expenses, properties, stocks, crypto, projections." },
          { name: "Backup Export",      desc: "Pre-delete backup from the BulkDelete modal. Contains only selected records." },
          { name: "Data Health Export", desc: "Full backup JSON or expenses-only xlsx from the Data Health page." },
        ]} />
      </SectionBody>
    ),
  },

  // ── PDF Export ────────────────────────────────────────────────────────────────
  {
    id: "pdf",
    icon: <FileDown className="w-4 h-4" />,
    title: "PDF Export",
    color: "hsl(0,72%,51%)",
    content: (
      <SectionBody>
        <p>PDF export is available from the Reports page. It generates a formatted financial report using jsPDF with autoTable for structured data presentation.</p>

        <H3>What Is Included</H3>
        <ul className="list-disc pl-4 space-y-1 text-xs">
          <li>Cover page: Family name, date, and report period</li>
          <li>Executive summary: Net worth, assets, liabilities, surplus, savings rate</li>
          <li>Asset allocation table</li>
          <li>10-year net worth projection table</li>
          <li>Expense summary by category</li>
          <li>Property portfolio summary</li>
          <li>Stocks and crypto holdings</li>
        </ul>

        <H3>What Is Not Included</H3>
        <ul className="list-disc pl-4 space-y-1 text-xs">
          <li>Charts and graphs (PDF is text/table only)</li>
          <li>Full expense transaction history (too large for PDF; use Excel export)</li>
        </ul>

        <Callout type="info">
          For a full visual report including charts, export to Excel and open in Excel or Google Sheets where the data columns can be charted.
        </Callout>
      </SectionBody>
    ),
  },
];

// ─── Calculation Methodology ──────────────────────────────────────────────────

const FORMULAS = [
  { label: "Net Worth",         formula: "Total Assets − Total Liabilities" },
  { label: "Total Assets",      formula: "PPOR + Cash + Super + Cars + Iran Property + Investment Properties + Stocks (at current price) + Crypto (at current price)" },
  { label: "Total Liabilities", formula: "PPOR Mortgage + Investment Property Loans + Other Debts" },
  { label: "Monthly Surplus",   formula: "Monthly Income − Monthly Expenses" },
  { label: "Savings Rate",      formula: "Monthly Surplus ÷ Monthly Income × 100" },
  { label: "Property Equity",   formula: "Current Property Value − Outstanding Loan Balance" },
  { label: "Investment Growth", formula: "FV = PV × (1 + r)^n + DCA × ((1 + r)^n − 1) / r  (compound with contributions)" },
  { label: "Cash Flow (Month)", formula: "Income − Living Expenses − Mortgage Repayment − Investment Contributions + Rental Income" },
  { label: "10-Year Forecast",  formula: "Σ (Each asset grown at its rate) − Σ (Liabilities reduced by repayments), evaluated each year 1–10" },
  { label: "Monthly Repayment", formula: "P × r(1+r)^n ÷ ((1+r)^n − 1)  where r = annual rate ÷ 12, n = term × 12" },
  { label: "Gross Rental Yield",formula: "(Weekly Rent × 52) ÷ Property Value × 100" },
  { label: "Negative Gearing",  formula: "Rental Income − (Loan Interest + Property Expenses). Negative result reduces taxable income." },
];

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "Why do my numbers change after refreshing the page?",
    a: "When you refresh, the app re-fetches all data from Supabase. If the numbers change, it means the local cache was different from the cloud database. This usually happens if a save partially failed — the data you see after refresh is the canonical version from Supabase.",
  },
  {
    q: "Why does mobile now show the same data as desktop?",
    a: "The Phase 2 sync fix changed all read operations to go directly to Supabase first (instead of localStorage). Every page navigation now fetches fresh from the cloud, so both devices always show the same current data. staleTime is set to 0, which means TanStack Query always refetches on component mount.",
  },
  {
    q: "What does Privacy Mode actually do?",
    a: "It replaces displayed dollar amounts with $•••••• and percentages with •••%. It only affects what is rendered on screen. All calculations, Supabase data, localStorage cache, and exports are completely unaffected. Toggle it with the Show/Hide Values button in the top bar.",
  },
  {
    q: "How do I safely delete all imported expenses from a specific import batch?",
    a: "Go to Expenses → filter by the date the import was done (use Date From / Date To in Advanced filters, set both to the import date). Then click the header checkbox to select all on the current page, use 'Select all X filtered' from the toolbar to get all of them, export a backup first, then delete. Verify in Data Health afterwards.",
  },
  {
    q: "How do I export a report to share with my accountant?",
    a: "Go to Reports → click Export Excel for a full multi-sheet workbook, or Export PDF for a formatted document. The Excel export is more comprehensive and includes all raw data across sheets.",
  },
  {
    q: "How do I add a property I plan to buy in the future?",
    a: "On the Property page, add a new property and set the Purchase Date to the future date (e.g. 2028-01-01). The projection chart and year-by-year table will show $0 for that property in all years before 2028, then include it from 2028 onwards. This prevents future purchases from inflating your current net worth.",
  },
  {
    q: "How does DCA (Dollar Cost Averaging) affect the forecast?",
    a: "Monthly DCA amounts entered on the Stocks or Crypto pages are added to the monthly cash flow model as investment contributions. They compound forward using the expected return %. The 10-year forecast formula is FV = PV(1+r)^n + PMT × ((1+r)^n − 1)/r, where PMT is the monthly DCA amount.",
  },
  {
    q: "Why is my savings rate showing 0% or a strange number?",
    a: "The savings rate is calculated from the Financial Snapshot on the Dashboard: Monthly Surplus ÷ Monthly Income. If Monthly Income is set to $0 or the division returns infinity, the rate shows 0. Update the Snapshot with your current income and expenses.",
  },
  {
    q: "Can both Roham and Fara log in at the same time?",
    a: "Yes — both accounts access the same shared Supabase database. If both make changes simultaneously, the last save wins (Supabase uses UPSERT with a fixed record ID for the snapshot). For collections (expenses, stocks, etc.) each creates separate rows so there is no conflict.",
  },
  {
    q: "What happens if I lose internet access?",
    a: "The app falls back to the localStorage cache. You can still view all data (from the last sync). Saves will fail silently and are not queued — you will need to re-save when connectivity is restored. The [SF] Fallback to local cache log message will appear in browser console.",
  },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [openFaqs, setOpenFaqs] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"sections" | "formulas" | "faq">("sections");

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleFaq = (i: number) => {
    setOpenFaqs(prev => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  };

  const expandAll = () => setOpenSections(new Set(SECTIONS.map(s => s.id)));
  const collapseAll = () => setOpenSections(new Set());

  // Filter sections by search query
  const q = search.toLowerCase();
  const filteredSections = useMemo(() => {
    if (!q) return SECTIONS;
    return SECTIONS.filter(s => s.title.toLowerCase().includes(q));
  }, [q]);

  const filteredFormulas = useMemo(() => {
    if (!q) return FORMULAS;
    return FORMULAS.filter(f => f.label.toLowerCase().includes(q) || f.formula.toLowerCase().includes(q));
  }, [q]);

  const filteredFaqs = useMemo(() => {
    if (!q) return FAQS;
    return FAQS.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [q]);

  // Auto-expand sections that match search
  const searchOpenIds = useMemo(() => {
    if (!q) return openSections;
    return new Set([...openSections, ...filteredSections.map(s => s.id)]);
  }, [q, filteredSections, openSections]);

  return (
    <div className="space-y-5 pb-10 max-w-4xl mx-auto">

      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5" style={{ color: "hsl(43,85%,55%)" }} />
            <h1 className="text-xl font-bold">Help &amp; Documentation</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Everything you need to know about the Shahrokh Family Financial Planner — features, formulas, and FAQs.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <Zap className="w-3.5 h-3.5" style={{ color: "hsl(43,85%,55%)" }} />
          <span>Phase 2 · Version 2.0</span>
        </div>
      </div>

      {/* ─── Search ──────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search documentation..."
          className="pl-9 h-10 text-sm"
        />
      </div>

      {/* ─── Quick navigation cards ───────────────────────────── */}
      {!q && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { id: "dashboard",   icon: <LayoutDashboard className="w-4 h-4" />, label: "Dashboard",  color: "hsl(43,85%,55%)" },
            { id: "expenses",    icon: <Receipt className="w-4 h-4" />,         label: "Expenses",   color: "hsl(0,72%,51%)" },
            { id: "property",    icon: <Home className="w-4 h-4" />,            label: "Property",   color: "hsl(142,60%,45%)" },
            { id: "stocks",      icon: <TrendingUp className="w-4 h-4" />,      label: "Stocks",     color: "hsl(188,60%,48%)" },
            { id: "crypto",      icon: <Bitcoin className="w-4 h-4" />,         label: "Crypto",     color: "hsl(43,85%,55%)" },
            { id: "tax",         icon: <Calculator className="w-4 h-4" />,      label: "Tax Calc",   color: "hsl(20,80%,55%)" },
            { id: "privacy",     icon: <Shield className="w-4 h-4" />,          label: "Privacy",    color: "hsl(270,60%,60%)" },
            { id: "bulk-delete", icon: <Trash2 className="w-4 h-4" />,          label: "Bulk Delete",color: "hsl(0,72%,51%)" },
            { id: "supabase",    icon: <Cloud className="w-4 h-4" />,           label: "Sync",       color: "hsl(142,60%,45%)" },
            { id: "excel",       icon: <FileSpreadsheet className="w-4 h-4" />, label: "Excel",      color: "hsl(142,60%,45%)" },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab("sections");
                setOpenSections(prev => new Set([...prev, item.id]));
                setTimeout(() => {
                  document.getElementById(`section-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 50);
              }}
              className="rounded-xl border border-border bg-card p-3 flex flex-col items-center gap-1.5 text-xs font-medium transition-all hover:border-primary/40 hover:bg-secondary/40 text-center"
            >
              <span style={{ color: item.color }}>{item.icon}</span>
              <span className="text-muted-foreground">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ─── Tabs ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["sections", "formulas", "faq"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px capitalize ${
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "sections" ? "Sections" : tab === "formulas" ? "Formulas" : "FAQ"}
          </button>
        ))}
        {activeTab === "sections" && !q && (
          <div className="ml-auto flex gap-2 pb-1">
            <button onClick={expandAll}   className="text-xs text-muted-foreground hover:text-foreground transition-colors">Expand all</button>
            <span className="text-muted-foreground text-xs">·</span>
            <button onClick={collapseAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Collapse all</button>
          </div>
        )}
      </div>

      {/* ─── Sections tab ─────────────────────────────────────── */}
      {activeTab === "sections" && (
        <div className="space-y-2">
          {filteredSections.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No sections match your search.</p>
          )}
          {filteredSections.map(section => {
            const isOpen = searchOpenIds.has(section.id);
            return (
              <div
                key={section.id}
                id={`section-${section.id}`}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <button
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/20 transition-colors"
                  onClick={() => toggleSection(section.id)}
                >
                  <span style={{ color: section.color }}>{section.icon}</span>
                  <span className="flex-1 text-sm font-semibold text-foreground">{section.title}</span>
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  }
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 border-t border-border/60">
                    {section.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Formulas tab ─────────────────────────────────────── */}
      {activeTab === "formulas" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-4 h-4" style={{ color: "hsl(43,85%,55%)" }} />
              <h2 className="text-sm font-bold">Calculation Methodology</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              All calculations are performed client-side in the browser using JavaScript. No data is sent to an external calculation service. Formulas are applied consistently across all pages.
            </p>
            {filteredFormulas.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No formulas match your search.</p>
            )}
            {filteredFormulas.map(f => (
              <Formula key={f.label} label={f.label} formula={f.formula} />
            ))}
          </div>

          {/* Actual vs forecast callout */}
          {!q && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-bold mb-3">Actual vs Forecast Logic</h2>
              <SectionBody>
                <p>The Master Cash Flow Forecast and Net Worth Timeline blend actual data with projections:</p>
                <ul className="list-disc pl-4 space-y-1.5 text-xs mt-2">
                  <li><strong className="text-foreground">Historical months</strong> — any month where expense records exist in the Expenses table uses the sum of those actual records as the expense figure for that month.</li>
                  <li><strong className="text-foreground">Future months</strong> — no expense records exist, so the snapshot's monthly_expenses value is used.</li>
                  <li><strong className="text-foreground">Double-count guard</strong> — if the snapshot's monthly_expenses already includes mortgage and the Expenses table also contains a mortgage payment for the same month, the actual month total is used as-is (not added on top of the snapshot estimate).</li>
                  <li><strong className="text-foreground">Investment properties</strong> — rental income is added from the purchase date onwards; loan repayments and expenses are subtracted from the same date.</li>
                </ul>
              </SectionBody>
            </div>
          )}
        </div>
      )}

      {/* ─── FAQ tab ──────────────────────────────────────────── */}
      {activeTab === "faq" && (
        <div className="space-y-2">
          {filteredFaqs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No FAQs match your search.</p>
          )}
          {filteredFaqs.map((faq, i) => {
            const isOpen = openFaqs.has(i);
            return (
              <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-secondary/20 transition-colors"
                  onClick={() => toggleFaq(i)}
                >
                  <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(43,85%,55%)" }} />
                  <span className="flex-1 text-sm font-medium text-foreground">{faq.q}</span>
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  }
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 pt-1 border-t border-border/60">
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Footer ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 text-center">
        <p className="text-xs text-muted-foreground">
          Shahrokh Family Financial Planner · Phase 2 · Built for Roham, Fara, Yara &amp; Jana · Brisbane, QLD · Australia
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          All financial figures are estimates only and do not constitute financial or tax advice.
        </p>
      </div>

    </div>
  );
}
