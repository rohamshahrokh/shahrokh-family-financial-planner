/**
 * help.tsx — Shahrokh Family Financial Planner
 * Fully bilingual (English + Persian/Farsi) help and documentation page.
 * Language stored in localStorage key `sf_help_lang`.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import {
  LayoutDashboard, Receipt, Home, TrendingUp, Bitcoin,
  FileText, Calculator, Activity, Settings, Shield,
  Trash2, Cloud, FileSpreadsheet, FileDown, Search,
  ChevronDown, ChevronRight, Info, AlertTriangle, CheckCircle,
  HelpCircle, BookOpen, Zap, Database, Globe, Languages,
  Flame, Sword, BarChart3, TrendingDown, Building2, Clock, Brain,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = "en" | "fa";

interface SectionDef {
  id: string;
  icon: React.ReactNode;
  color: string;
  title: { en: string; fa: string };
  content: { en: React.ReactNode; fa: React.ReactNode };
  keywords: { en: string; fa: string };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Callout({
  type,
  children,
}: {
  type: "info" | "warning" | "tip";
  children: React.ReactNode;
}) {
  const styles = {
    info: {
      bg: "hsl(210,50%,10%)",
      border: "hsl(210,60%,35%)",
      icon: <Info className="w-3.5 h-3.5 shrink-0 text-blue-400" />,
      text: "text-blue-300",
    },
    warning: {
      bg: "hsl(40,50%,10%)",
      border: "hsl(43,60%,35%)",
      icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-yellow-400" />,
      text: "text-yellow-300",
    },
    tip: {
      bg: "hsl(142,50%,8%)",
      border: "hsl(142,50%,30%)",
      icon: <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-400" />,
      text: "text-emerald-300",
    },
  };
  const s = styles[type];
  return (
    <div
      className="flex gap-2.5 rounded-lg px-3 py-2.5 text-xs my-3"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      {s.icon}
      <span className={s.text}>{children}</span>
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="block rounded-md px-3 py-2 text-xs my-2 font-mono leading-relaxed"
      style={{
        background: "hsl(224,15%,8%)",
        border: "1px solid hsl(224,12%,20%)",
        color: "hsl(43,85%,65%)",
      }}
    >
      {children}
    </code>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto my-3 rounded-lg" style={{ border: "1px solid hsl(224,12%,20%)" }}>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([a, b], i) => (
            <tr
              key={i}
              style={{ background: i % 2 === 0 ? "hsl(224,15%,10%)" : "hsl(224,15%,12%)" }}
            >
              <td className="px-3 py-2 font-mono" style={{ color: "hsl(43,85%,65%)", borderRight: "1px solid hsl(224,12%,20%)" }}>{a}</td>
              <td className="px-3 py-2 text-muted-foreground">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PTag({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed mb-3">{children}</p>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground mb-2 mt-4">{children}</h3>;
}

function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-none space-y-1 mb-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-muted-foreground">
          <span style={{ color: "hsl(43,85%,55%)" }}>▸</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Section Definitions ──────────────────────────────────────────────────────

const SECTIONS: SectionDef[] = [
  // 1. Dashboard
  {
    id: "dashboard",
    icon: <LayoutDashboard className="w-4 h-4" />,
    color: "hsl(43,85%,55%)",
    title: { en: "Dashboard", fa: "داشبورد" },
    keywords: {
      en: "dashboard kpi net worth income expenses surplus cash flow savings rate cards",
      fa: "داشبورد ارزش خالص درآمد هزینه مازاد جریان نقدی پس انداز کارت",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Dashboard is your command centre — six KPI cards give you an instant financial
            snapshot. Each card auto-recalculates whenever you save data.
          </PTag>
          <H3>KPI Cards</H3>
          <UL items={[
            <><strong className="text-foreground">Net Worth</strong> — Total market value of everything you own minus everything you owe.</>,
            <><strong className="text-foreground">Monthly Income</strong> — Sum of all income sources for the selected period.</>,
            <><strong className="text-foreground">Monthly Expenses</strong> — Total outgoings for the selected period.</>,
            <><strong className="text-foreground">Monthly Surplus</strong> — How much you keep each month after expenses.</>,
            <><strong className="text-foreground">Cash Flow</strong> — Actual income/expense trend vs your forecast budget.</>,
            <><strong className="text-foreground">Savings Rate</strong> — The percentage of income that becomes savings.</>,
          ]} />
          <H3>Formulas</H3>
          <Formula>Net Worth = Total Assets − Total Liabilities</Formula>
          <Formula>Monthly Surplus = Monthly Income − Monthly Expenses</Formula>
          <Formula>Savings Rate = (Monthly Surplus ÷ Monthly Income) × 100</Formula>
          <Formula>Cash Flow = Actual Income/Expense compared against Forecast values</Formula>
          <Callout type="tip">
            A Savings Rate above 20% is generally considered healthy. Aim for 30%+ for accelerated
            wealth building.
          </Callout>
          <Callout type="info">
            All KPI cards respect Privacy Mode — values are masked as $•••••• when enabled.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            داشبورد مرکز فرماندهی مالی شماست — شش کارت آماری کلیدی یک تصویر فوری از وضعیت مالی شما ارائه می‌دهند.
            هر کارت به‌صورت خودکار پس از ذخیره داده بازمحاسبه می‌شود.
          </PTag>
          <H3>کارت‌های آماری</H3>
          <UL items={[
            <><strong className="text-foreground">ارزش خالص</strong> — ارزش کل دارایی‌ها منهای کل بدهی‌ها.</>,
            <><strong className="text-foreground">درآمد ماهانه</strong> — مجموع تمام منابع درآمد در دوره انتخابی.</>,
            <><strong className="text-foreground">هزینه‌های ماهانه</strong> — مجموع تمام هزینه‌ها در دوره انتخابی.</>,
            <><strong className="text-foreground">مازاد ماهانه</strong> — مقداری که پس از کسر هزینه‌ها باقی می‌ماند.</>,
            <><strong className="text-foreground">جریان نقدی</strong> — مقایسه درآمد/هزینه واقعی با پیش‌بینی.</>,
            <><strong className="text-foreground">نرخ پس‌انداز</strong> — درصدی از درآمد که پس‌انداز می‌شود.</>,
          ]} />
          <H3>فرمول‌ها</H3>
          <Formula>ارزش خالص = کل دارایی‌ها − کل بدهی‌ها</Formula>
          <Formula>مازاد ماهانه = درآمد ماهانه − هزینه‌های ماهانه</Formula>
          <Formula>نرخ پس‌انداز = (مازاد ماهانه ÷ درآمد ماهانه) × ۱۰۰</Formula>
          <Formula>جریان نقدی = مقایسه درآمد/هزینه واقعی با مقادیر پیش‌بینی‌شده</Formula>
          <Callout type="tip">
            نرخ پس‌انداز بالای ۲۰٪ به‌طور کلی مناسب است. برای ساخت ثروت سریع‌تر، هدف‌گذاری روی ۳۰٪ یا بیشتر توصیه می‌شود.
          </Callout>
          <Callout type="info">
            تمام کارت‌های آماری از حالت حریم خصوصی پشتیبانی می‌کنند — وقتی فعال باشد، مقادیر به‌صورت $•••••• نمایش داده می‌شوند.
          </Callout>
        </div>
      ),
    },
  },

  // 2. Expenses
  {
    id: "expenses",
    icon: <Receipt className="w-4 h-4" />,
    color: "hsl(0,72%,51%)",
    title: { en: "Expenses", fa: "هزینه‌ها" },
    keywords: {
      en: "expenses tracking source code groceries medical transport entertainment excel import filter bulk delete categories",
      fa: "هزینه ردیابی کد منبع خواربار پزشکی حمل و نقل سرگرمی اکسل واردات فیلتر حذف گروهی",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Expenses page is the core of day-to-day tracking. Every transaction is tagged with
            a source code that auto-maps to a category.
          </PTag>
          <H3>Source Code System</H3>
          <PTag>When importing or adding expenses, use these single/double-letter codes:</PTag>
          <Table rows={[
            ["D", "Groceries / Supermarket"],
            ["M", "Health / Medical"],
            ["T", "Transport / Fuel"],
            ["E", "Entertainment"],
            ["C", "Car Expenses"],
            ["B", "Shopping / Retail"],
            ["R", "Housing / Mortgage / Rent"],
            ["G", "Gifts"],
            ["S", "Fitness / Sport"],
            ["L", "Debt Repayment"],
            ["PI", "Insurance"],
            ["I", "Investment Costs"],
            ["U", "Utilities"],
            ["BB", "Kids Expenses"],
            ["CC", "Childcare"],
            ["TR", "Travel"],
          ]} />
          <H3>Excel Import (4-Column Format)</H3>
          <UL items={[
            <>Column A — <strong className="text-foreground">Date</strong> (DD/MM/YYYY or YYYY-MM-DD)</>,
            <>Column B — <strong className="text-foreground">Amount</strong> (numeric, no $ sign)</>,
            <>Column C — <strong className="text-foreground">Code</strong> (source code from table above)</>,
            <>Column D — <strong className="text-foreground">Description</strong> (free text note)</>,
          ]} />
          <Callout type="info">
            Download the template from the Import dialog to get the correct column headers.
            The importer shows a preview before committing — review it carefully.
          </Callout>
          <H3>Filters Available</H3>
          <UL items={[
            "Date range picker (from / to)",
            "Category dropdown (auto-populated from codes)",
            "Search by description keyword",
            "Amount range (min / max)",
          ]} />
          <H3>Bulk Delete</H3>
          <PTag>
            Select rows using checkboxes, then click Delete. A password confirmation modal
            appears. You must also check "I understand this cannot be undone." An optional
            backup export is offered before deletion.
          </PTag>
          <Callout type="warning">
            Deleted expenses are permanently removed from Supabase. Always export a backup first.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            صفحه هزینه‌ها هسته اصلی ردیابی روزانه است. هر تراکنش با یک کد منبع برچسب می‌خورد که به‌طور خودکار به دسته‌بندی تبدیل می‌شود.
          </PTag>
          <H3>سیستم کد منبع</H3>
          <PTag>هنگام واردات یا افزودن هزینه‌ها از این کدهای حرفی استفاده کنید:</PTag>
          <Table rows={[
            ["D", "خواربار / سوپرمارکت"],
            ["M", "بهداشت / پزشکی"],
            ["T", "حمل و نقل / سوخت"],
            ["E", "سرگرمی"],
            ["C", "خودرو / هزینه‌های خودرو"],
            ["B", "خرید / خرده‌فروشی"],
            ["R", "مسکن / وام مسکن / اجاره"],
            ["G", "هدایا"],
            ["S", "تناسب اندام / ورزش"],
            ["L", "بازپرداخت بدهی"],
            ["PI", "بیمه"],
            ["I", "هزینه‌های سرمایه‌گذاری"],
            ["U", "آب و برق و گاز"],
            ["BB", "هزینه‌های کودکان"],
            ["CC", "مراقبت از کودک"],
            ["TR", "سفر"],
          ]} />
          <H3>واردات اکسل (فرمت ۴ ستونی)</H3>
          <UL items={[
            <>ستون A — <strong className="text-foreground">تاریخ</strong> (DD/MM/YYYY یا YYYY-MM-DD)</>,
            <>ستون B — <strong className="text-foreground">مبلغ</strong> (عددی، بدون علامت $)</>,
            <>ستون C — <strong className="text-foreground">کد</strong> (کد منبع از جدول بالا)</>,
            <>ستون D — <strong className="text-foreground">توضیحات</strong> (متن آزاد)</>,
          ]} />
          <Callout type="info">
            الگوی اکسل را از پنجره واردات دانلود کنید تا سرستون‌های صحیح داشته باشید.
            قبل از ذخیره، پیش‌نمایش نمایش داده می‌شود — آن را با دقت بررسی کنید.
          </Callout>
          <H3>فیلترهای موجود</H3>
          <UL items={[
            "انتخابگر بازه تاریخ (از / تا)",
            "منوی دسته‌بندی (خودکار از کدها)",
            "جستجو بر اساس کلمه کلیدی توضیحات",
            "بازه مبلغ (حداقل / حداکثر)",
          ]} />
          <H3>حذف گروهی</H3>
          <PTag>
            سطرها را با چک‌باکس انتخاب کنید، سپس روی حذف کلیک کنید. یک پنجره تأیید رمز عبور ظاهر می‌شود.
            همچنین باید گزینه «می‌دانم که این عمل غیرقابل بازگشت است» را تأیید کنید.
            قبل از حذف، گزینه صادرات پشتیبان ارائه می‌شود.
          </PTag>
          <Callout type="warning">
            هزینه‌های حذف‌شده به‌طور دائمی از سوپابیس حذف می‌شوند. همیشه ابتدا نسخه پشتیبان صادر کنید.
          </Callout>
        </div>
      ),
    },
  },

  // 3. Property Calculator
  {
    id: "property",
    icon: <Home className="w-4 h-4" />,
    color: "hsl(188,60%,48%)",
    title: { en: "Property Calculator", fa: "ماشین‌حساب ملک" },
    keywords: {
      en: "property calculator stamp duty rental yield capital gains tax CGT roi investment QLD purchase",
      fa: "ماشین‌حساب ملک عوارض تمبر بازده اجاره مالیات بر عایدی سرمایه بازگشت سرمایه QLD خرید",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Property Calculator is a 6-section form for analysing residential investment
            properties. It includes purchase costs, ongoing expenses, rental income, capital
            growth, and CGT — all date-aware.
          </PTag>
          <H3>6 Sections</H3>
          <UL items={[
            "Purchase Details (price, settlement date, deposit, loan)",
            "Stamp Duty (QLD sliding-scale calculator, auto-computed)",
            "Rental Income (weekly rent, vacancy rate, annual projections)",
            "Ongoing Expenses (rates, insurance, management, maintenance)",
            "Capital Growth (growth rate %, hold period, future value projection)",
            "CGT & ROI (capital gains tax including 50% discount, final ROI)",
          ]} />
          <H3>Key Formulas</H3>
          <Formula>Stamp Duty (QLD) — Sliding scale based on purchase price:
  $0–$5,000       → NIL
  $5,001–$75,000  → $1.50 per $100 over $5,000
  $75,001–$540K   → $1,050 + $3.50 per $100 over $75,000
  $540K–$1M       → $17,325 + $4.50 per $100 over $540,000
  $1M+            → $38,025 + $5.75 per $100 over $1,000,000</Formula>
          <Formula>Gross Rental Yield = (Annual Rent ÷ Property Value) × 100</Formula>
          <Formula>Net Rental Yield = ((Annual Rent − Annual Expenses) ÷ Property Value) × 100</Formula>
          <Formula>Capital Gain = Sale Price − Purchase Price − Purchase Costs</Formula>
          <Formula>CGT Payable = Capital Gain × Marginal Rate (× 50% discount if held &gt;12 months)</Formula>
          <Formula>Annual ROI = (Net Rental Income + Capital Gain) ÷ Total Investment × 100</Formula>
          <Callout type="info">
            The 50% CGT discount applies to Australian residents who hold the property for more
            than 12 months before selling.
          </Callout>
          <Callout type="tip">
            All projection fields use the settlement/purchase date you enter to calculate
            holding periods automatically.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            ماشین‌حساب ملک یک فرم ۶ بخشی برای تحلیل سرمایه‌گذاری در مسکن است.
            شامل هزینه‌های خرید، هزینه‌های جاری، درآمد اجاره، رشد سرمایه و مالیات بر عایدی سرمایه — همه به‌صورت تاریخ‌محور.
          </PTag>
          <H3>۶ بخش اصلی</H3>
          <UL items={[
            "جزئیات خرید (قیمت، تاریخ تسویه، سپرده، وام)",
            "عوارض تمبر (محاسبه خودکار با مقیاس متغیر QLD)",
            "درآمد اجاره (اجاره هفتگی، نرخ خالی بودن، پیش‌بینی سالانه)",
            "هزینه‌های جاری (عوارض شهرداری، بیمه، مدیریت، نگهداری)",
            "رشد سرمایه (نرخ رشد٪، دوره نگهداری، پیش‌بینی ارزش آینده)",
            "مالیات بر عایدی سرمایه و ROI (شامل ۵۰٪ تخفیف CGT، بازگشت سرمایه نهایی)",
          ]} />
          <H3>فرمول‌های کلیدی</H3>
          <Formula>بازده اجاره ناخالص = (اجاره سالانه ÷ ارزش ملک) × ۱۰۰</Formula>
          <Formula>بازده اجاره خالص = ((اجاره سالانه − هزینه‌های سالانه) ÷ ارزش ملک) × ۱۰۰</Formula>
          <Formula>عایدی سرمایه = قیمت فروش − قیمت خرید − هزینه‌های خرید</Formula>
          <Formula>مالیات بر عایدی = عایدی × نرخ نهایی (× ۵۰٪ تخفیف اگر بیش از ۱۲ ماه نگهداری شده باشد)</Formula>
          <Formula>بازگشت سرمایه سالانه = (درآمد اجاره خالص + عایدی سرمایه) ÷ کل سرمایه‌گذاری × ۱۰۰</Formula>
          <Callout type="info">
            تخفیف ۵۰٪ CGT برای مقیم‌های استرالیا که ملک را بیش از ۱۲ ماه نگه داشته‌اند اعمال می‌شود.
          </Callout>
          <Callout type="tip">
            تمام فیلدهای پیش‌بینی از تاریخ تسویه/خرید که وارد می‌کنید برای محاسبه خودکار دوره نگهداری استفاده می‌کنند.
          </Callout>
        </div>
      ),
    },
  },

  // 4. Stocks Portfolio
  {
    id: "stocks",
    icon: <TrendingUp className="w-4 h-4" />,
    color: "hsl(142,60%,45%)",
    title: { en: "Stocks Portfolio", fa: "سبد سهام" },
    keywords: {
      en: "stocks portfolio ticker shares buy price current price sector unrealised PnL allocation drift",
      fa: "سهام سبد تیکر سهم قیمت خرید قیمت فعلی بخش سود زیان تخصیص انحراف",
    },
    content: {
      en: (
        <div>
          <PTag>
            Track your equity holdings across any exchange. The portfolio table shows real-time
            performance and allocation breakdown for each position.
          </PTag>
          <H3>Fields When Adding a Stock</H3>
          <UL items={[
            <><strong className="text-foreground">Ticker</strong> — Stock symbol (e.g. CBA, BHP, AAPL)</>,
            <><strong className="text-foreground">Shares</strong> — Number of units held</>,
            <><strong className="text-foreground">Avg Buy Price</strong> — Your average cost per share</>,
            <><strong className="text-foreground">Current Price</strong> — Latest market price per share</>,
            <><strong className="text-foreground">Sector</strong> — E.g. Financials, Resources, Technology</>,
          ]} />
          <H3>Calculations</H3>
          <Formula>Market Value = Current Price × Shares</Formula>
          <Formula>Cost Basis = Avg Buy Price × Shares</Formula>
          <Formula>Unrealised P&L = (Current Price − Avg Buy Price) × Shares</Formula>
          <Formula>Unrealised P&L % = ((Current Price − Avg Buy Price) ÷ Avg Buy Price) × 100</Formula>
          <Formula>Portfolio Allocation = (Stock Market Value ÷ Total Portfolio Value) × 100</Formula>
          <Formula>Allocation Drift = Actual Allocation % − Target Allocation %</Formula>
          <Callout type="tip">
            Update Current Price manually or via your broker statement. Automatic live price
            feeds are not included in this version.
          </Callout>
          <Callout type="info">
            The portfolio totals feed into the Net Worth KPI on the Dashboard automatically.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            سهام خود را در هر بورسی ردیابی کنید. جدول سبد سهام عملکرد به‌روز و تفکیک تخصیص هر موقعیت را نشان می‌دهد.
          </PTag>
          <H3>فیلدها هنگام افزودن سهام</H3>
          <UL items={[
            <><strong className="text-foreground">تیکر</strong> — نماد سهام (مثال: CBA، BHP، AAPL)</>,
            <><strong className="text-foreground">تعداد سهام</strong> — تعداد واحدهای نگهداری‌شده</>,
            <><strong className="text-foreground">میانگین قیمت خرید</strong> — میانگین هزینه هر سهم</>,
            <><strong className="text-foreground">قیمت فعلی</strong> — آخرین قیمت بازار به ازای هر سهم</>,
            <><strong className="text-foreground">بخش</strong> — مثال: مالی، معدن، فناوری</>,
          ]} />
          <H3>محاسبات</H3>
          <Formula>ارزش بازار = قیمت فعلی × تعداد سهام</Formula>
          <Formula>پایه هزینه = میانگین قیمت خرید × تعداد سهام</Formula>
          <Formula>سود/زیان تحقق‌نیافته = (قیمت فعلی − میانگین قیمت خرید) × تعداد سهام</Formula>
          <Formula>سود/زیان٪ = ((قیمت فعلی − میانگین قیمت خرید) ÷ میانگین قیمت خرید) × ۱۰۰</Formula>
          <Formula>تخصیص سبد = (ارزش بازار سهام ÷ کل ارزش سبد) × ۱۰۰</Formula>
          <Formula>انحراف تخصیص = تخصیص واقعی٪ − تخصیص هدف٪</Formula>
          <Callout type="tip">
            قیمت فعلی را به‌صورت دستی یا از طریق صورتحساب کارگزار خود به‌روز کنید.
          </Callout>
          <Callout type="info">
            مجموع سبد سهام به‌طور خودکار در کارت ارزش خالص داشبورد لحاظ می‌شود.
          </Callout>
        </div>
      ),
    },
  },

  // 5. Crypto Portfolio
  {
    id: "crypto",
    icon: <Bitcoin className="w-4 h-4" />,
    color: "hsl(43,85%,55%)",
    title: { en: "Crypto Portfolio", fa: "سبد رمزارز" },
    keywords: {
      en: "crypto bitcoin ethereum portfolio symbol quantity buy price current price PnL allocation digital assets",
      fa: "رمزارز بیت‌کوین اتریوم سبد نماد تعداد قیمت خرید قیمت فعلی سود زیان تخصیص دارایی دیجیتال",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Crypto Portfolio works identically to the Stocks section but is designed for
            digital assets. Track any cryptocurrency across exchanges.
          </PTag>
          <H3>Fields When Adding a Crypto</H3>
          <UL items={[
            <><strong className="text-foreground">Symbol</strong> — Crypto ticker (e.g. BTC, ETH, SOL)</>,
            <><strong className="text-foreground">Quantity</strong> — Amount of coins/tokens held</>,
            <><strong className="text-foreground">Avg Buy Price</strong> — Average cost per coin in AUD</>,
            <><strong className="text-foreground">Current Price</strong> — Latest market price per coin in AUD</>,
          ]} />
          <H3>Calculations (same as Stocks)</H3>
          <Formula>Market Value = Current Price × Quantity</Formula>
          <Formula>Unrealised P&L = (Current Price − Avg Buy Price) × Quantity</Formula>
          <Formula>Unrealised P&L % = ((Current Price − Avg Buy Price) ÷ Avg Buy Price) × 100</Formula>
          <Formula>Portfolio Allocation = (Coin Value ÷ Total Crypto Portfolio Value) × 100</Formula>
          <Callout type="warning">
            Crypto prices are highly volatile. Update Current Price regularly for accurate
            net worth calculations. Stale prices will be flagged in Data Health.
          </Callout>
          <Callout type="info">
            Australian tax rules treat crypto as a Capital Gains Tax (CGT) asset.
            Consult your accountant for disposal events.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            سبد رمزارز دقیقاً مانند بخش سهام کار می‌کند، اما برای دارایی‌های دیجیتال طراحی شده است.
            هر رمزارزی را در هر صرافی ردیابی کنید.
          </PTag>
          <H3>فیلدها هنگام افزودن رمزارز</H3>
          <UL items={[
            <><strong className="text-foreground">نماد</strong> — تیکر رمزارز (مثال: BTC، ETH، SOL)</>,
            <><strong className="text-foreground">تعداد</strong> — مقدار سکه/توکن نگهداری‌شده</>,
            <><strong className="text-foreground">میانگین قیمت خرید</strong> — میانگین هزینه هر سکه به دلار استرالیا</>,
            <><strong className="text-foreground">قیمت فعلی</strong> — آخرین قیمت بازار به ازای هر سکه به AUD</>,
          ]} />
          <H3>محاسبات (مشابه سهام)</H3>
          <Formula>ارزش بازار = قیمت فعلی × تعداد</Formula>
          <Formula>سود/زیان تحقق‌نیافته = (قیمت فعلی − میانگین قیمت خرید) × تعداد</Formula>
          <Formula>سود/زیان٪ = ((قیمت فعلی − میانگین قیمت خرید) ÷ میانگین قیمت خرید) × ۱۰۰</Formula>
          <Formula>تخصیص سبد = (ارزش سکه ÷ کل ارزش سبد رمزارز) × ۱۰۰</Formula>
          <Callout type="warning">
            قیمت رمزارزها بسیار نوسانی است. برای محاسبه دقیق ارزش خالص، قیمت فعلی را مرتباً به‌روز کنید.
            قیمت‌های کهنه در بخش سلامت داده علامت‌گذاری می‌شوند.
          </Callout>
          <Callout type="info">
            قوانین مالیاتی استرالیا رمزارز را به‌عنوان دارایی CGT تلقی می‌کند. برای رویدادهای فروش با حسابدار خود مشورت کنید.
          </Callout>
        </div>
      ),
    },
  },

  // 6. Reports & Scenarios
  {
    id: "reports",
    icon: <FileText className="w-4 h-4" />,
    color: "hsl(270,60%,60%)",
    title: { en: "Reports & Scenarios", fa: "گزارش‌ها و سناریوها" },
    keywords: {
      en: "reports scenarios what-if income expense projection bulk delete password forecast",
      fa: "گزارش سناریو فرضی درآمد هزینه پیش‌بینی حذف گروهی رمز عبور",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Reports page lets you model financial futures with what-if scenario planning.
            Compare multiple scenarios side-by-side against your actual data.
          </PTag>
          <H3>Creating a Scenario</H3>
          <UL items={[
            "Click New Scenario and give it a name (e.g. 'Buy Investment Property 2026')",
            "Adjust income projections — monthly or annual",
            "Adjust expense projections by category",
            "Set a projection horizon (1, 3, 5, or 10 years)",
            "Save — the scenario is stored in Supabase (sf_scenarios table)",
          ]} />
          <H3>Viewing Scenarios</H3>
          <UL items={[
            "Chart view overlays multiple scenarios for easy comparison",
            "Table view shows year-by-year net worth projection",
            "Delta column shows difference vs current actual trajectory",
          ]} />
          <H3>Bulk Delete Scenarios</H3>
          <PTag>
            Select one or more scenarios with checkboxes. Click Delete. Enter your app password
            and confirm the irreversibility checkbox. Scenarios are permanently removed from
            Supabase.
          </PTag>
          <Callout type="tip">
            Use scenarios for major life events: job change, property purchase, having children,
            early retirement. Keep your "Base Case" scenario as a reference.
          </Callout>
          <Callout type="warning">
            Scenario deletion is password-protected and requires explicit confirmation.
            There is no undo — export a backup first.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            صفحه گزارش‌ها به شما امکان می‌دهد آینده‌های مالی را با برنامه‌ریزی سناریوی فرضی مدل‌سازی کنید.
            چندین سناریو را در کنار داده‌های واقعی مقایسه کنید.
          </PTag>
          <H3>ایجاد سناریو</H3>
          <UL items={[
            "روی «سناریوی جدید» کلیک کرده و نامی به آن بدهید (مثال: 'خرید ملک سرمایه‌گذاری ۲۰۲۶')",
            "پیش‌بینی درآمد را تنظیم کنید — ماهانه یا سالانه",
            "پیش‌بینی هزینه را بر اساس دسته‌بندی تنظیم کنید",
            "افق پیش‌بینی را تعیین کنید (۱، ۳، ۵ یا ۱۰ سال)",
            "ذخیره کنید — سناریو در سوپابیس ذخیره می‌شود (جدول sf_scenarios)",
          ]} />
          <H3>مشاهده سناریوها</H3>
          <UL items={[
            "نمودار چندین سناریو را برای مقایسه آسان روی هم نمایش می‌دهد",
            "جدول پیش‌بینی ارزش خالص را سال به سال نشان می‌دهد",
            "ستون دلتا تفاوت با مسیر واقعی فعلی را نشان می‌دهد",
          ]} />
          <H3>حذف گروهی سناریوها</H3>
          <PTag>
            یک یا چند سناریو را با چک‌باکس انتخاب کنید. روی حذف کلیک کنید. رمز عبور برنامه را وارد کرده
            و چک‌باکس تأیید غیرقابل بازگشت بودن را تأیید کنید.
          </PTag>
          <Callout type="tip">
            از سناریوها برای رویدادهای بزرگ زندگی استفاده کنید: تغییر شغل، خرید ملک، فرزند، بازنشستگی زودهنگام.
          </Callout>
          <Callout type="warning">
            حذف سناریو با رمز عبور محافظت می‌شود و نیاز به تأیید صریح دارد. بازگشتی وجود ندارد — ابتدا پشتیبان صادر کنید.
          </Callout>
        </div>
      ),
    },
  },

  // 7. Tax Calculator
  {
    id: "tax",
    icon: <Calculator className="w-4 h-4" />,
    color: "hsl(20,80%,55%)",
    title: { en: "Tax Calculator (Australian)", fa: "ماشین‌حساب مالیات استرالیا" },
    keywords: {
      en: "tax calculator australian ATO income tax FY2026 medicare levy low income offset bracket take home",
      fa: "مالیات ماشین‌حساب استرالیا ATO درآمد سال مالی عوارض مدیکر آفست کم‌درآمد پایه حقوق دریافتی",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Tax Calculator computes your Australian income tax liability for FY2025–26.
            Enter gross income and deductions — the calculator handles brackets, Medicare, and offsets.
          </PTag>
          <H3>ATO FY2025–26 Tax Brackets</H3>
          <Table rows={[
            ["$0 – $18,200", "Nil"],
            ["$18,201 – $45,000", "19c for each $1 over $18,200"],
            ["$45,001 – $135,000", "$5,092 + 32.5c for each $1 over $45,000"],
            ["$135,001 – $190,000", "$34,417 + 37c for each $1 over $135,000"],
            ["$190,001+", "$54,997 + 45c for each $1 over $190,000"],
          ]} />
          <H3>Key Formulas</H3>
          <Formula>Taxable Income = Gross Income − Deductions</Formula>
          <Formula>Income Tax = Based on ATO FY2025–26 brackets above</Formula>
          <Formula>Medicare Levy = Taxable Income × 2% (full levy — threshold rules apply below $26,000)</Formula>
          <Formula>Low Income Tax Offset (LITO) = up to $700 for incomes under $37,500 (phases out to $66,667)</Formula>
          <Formula>Effective Tax Rate = (Total Tax ÷ Gross Income) × 100</Formula>
          <Formula>Take-Home Pay = Gross Income − Income Tax − Medicare Levy + Offsets</Formula>
          <Callout type="info">
            This calculator uses your Dashboard salary figure automatically when opened from
            the Dashboard. You can also enter a custom amount.
          </Callout>
          <Callout type="warning">
            This is for estimation purposes only. Consult a registered tax agent for lodgement.
            Does not account for HECS/HELP debt, superannuation, or investment income schedules.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            ماشین‌حساب مالیات، بدهی مالیات بر درآمد استرالیایی شما را برای سال مالی ۲۰۲۵–۲۰۲۶ محاسبه می‌کند.
            درآمد ناخالص و کسورات را وارد کنید — ماشین‌حساب پایه‌های مالیاتی، مدیکر و آفست‌ها را مدیریت می‌کند.
          </PTag>
          <H3>پایه‌های مالیاتی ATO سال مالی ۲۰۲۵–۲۰۲۶</H3>
          <Table rows={[
            ["$۰ – $۱۸,۲۰۰", "صفر"],
            ["$۱۸,۲۰۱ – $۴۵,۰۰۰", "۱۹ سنت به ازای هر $۱ بیش از $۱۸,۲۰۰"],
            ["$۴۵,۰۰۱ – $۱۳۵,۰۰۰", "$۵,۰۹۲ + ۳۲.۵ سنت به ازای هر $۱ بیش از $۴۵,۰۰۰"],
            ["$۱۳۵,۰۰۱ – $۱۹۰,۰۰۰", "$۳۴,۴۱۷ + ۳۷ سنت به ازای هر $۱ بیش از $۱۳۵,۰۰۰"],
            ["$۱۹۰,۰۰۱+", "$۵۴,۹۹۷ + ۴۵ سنت به ازای هر $۱ بیش از $۱۹۰,۰۰۰"],
          ]} />
          <H3>فرمول‌های کلیدی</H3>
          <Formula>درآمد مشمول مالیات = درآمد ناخالص − کسورات</Formula>
          <Formula>مالیات بر درآمد = بر اساس پایه‌های مالیاتی ATO بالا</Formula>
          <Formula>عوارض مدیکر = درآمد مشمول مالیات × ۲٪</Formula>
          <Formula>آفست مالیاتی کم‌درآمد (LITO) = تا $۷۰۰ برای درآمدهای زیر $۳۷,۵۰۰</Formula>
          <Formula>نرخ مؤثر مالیات = (کل مالیات ÷ درآمد ناخالص) × ۱۰۰</Formula>
          <Formula>حقوق دریافتی = درآمد ناخالص − مالیات بر درآمد − عوارض مدیکر + آفست‌ها</Formula>
          <Callout type="info">
            این ماشین‌حساب به‌طور خودکار از عدد حقوق داشبورد شما استفاده می‌کند. می‌توانید مبلغ سفارشی هم وارد کنید.
          </Callout>
          <Callout type="warning">
            این ابزار فقط برای تخمین است. برای اظهارنامه مالیاتی با یک مشاور مالیاتی مشورت کنید.
            بدهی HECS/HELP، سوپرانیوشن و درآمد سرمایه‌گذاری را پوشش نمی‌دهد.
          </Callout>
        </div>
      ),
    },
  },

  // 8. Net Worth Timeline
  {
    id: "timeline",
    icon: <Activity className="w-4 h-4" />,
    color: "hsl(188,60%,48%)",
    title: { en: "Net Worth Timeline", fa: "تاریخچه ارزش خالص" },
    keywords: {
      en: "net worth timeline snapshot milestones actual forecast cumulative history",
      fa: "ارزش خالص تاریخچه عکس فوری نقاط عطف واقعی پیش‌بینی تجمعی",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Net Worth Timeline charts your wealth trajectory over time, showing actual
            recorded values against your forecast projections.
          </PTag>
          <H3>How Data Points Are Added</H3>
          <UL items={[
            "Every time you save a Dashboard snapshot, a data point is auto-recorded",
            "Each point includes: date, net worth, assets total, liabilities total",
            "Points are stored in the sf_timeline table in Supabase",
            "Manual data points can also be added for historical backdating",
          ]} />
          <H3>Views Available</H3>
          <UL items={[
            <><strong className="text-foreground">Actual vs Forecast</strong> — overlays your real trajectory against projected growth</>,
            <><strong className="text-foreground">Cumulative</strong> — running total of net worth growth since first data point</>,
            <><strong className="text-foreground">Assets vs Liabilities</strong> — stacked or split bar chart by component</>,
          ]} />
          <H3>Milestones</H3>
          <PTag>
            Add milestone markers to the timeline (e.g. "Paid off debt", "Bought property",
            "Reached $500k net worth"). Milestones appear as vertical markers on the chart.
          </PTag>
          <Callout type="tip">
            Save a Dashboard snapshot at least monthly for meaningful timeline data.
            The more data points, the more accurate the trend analysis.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            تاریخچه ارزش خالص مسیر ثروت شما را در طول زمان نمودار می‌کند، مقادیر واقعی ثبت‌شده را در مقابل پیش‌بینی‌های شما نشان می‌دهد.
          </PTag>
          <H3>نحوه افزودن نقاط داده</H3>
          <UL items={[
            "هر بار که یک عکس فوری از داشبورد ذخیره می‌کنید، یک نقطه داده به‌صورت خودکار ثبت می‌شود",
            "هر نقطه شامل: تاریخ، ارزش خالص، مجموع دارایی‌ها، مجموع بدهی‌ها",
            "نقاط در جدول sf_timeline سوپابیس ذخیره می‌شوند",
            "نقاط داده دستی هم می‌توانند برای ثبت تاریخچه گذشته اضافه شوند",
          ]} />
          <H3>نماهای موجود</H3>
          <UL items={[
            <><strong className="text-foreground">واقعی در مقابل پیش‌بینی</strong> — مسیر واقعی شما را روی رشد پیش‌بینی‌شده نمایش می‌دهد</>,
            <><strong className="text-foreground">تجمعی</strong> — مجموع انباشته رشد ارزش خالص از اولین نقطه داده</>,
            <><strong className="text-foreground">دارایی‌ها در مقابل بدهی‌ها</strong> — نمودار میله‌ای تجمیع‌شده یا جداگانه</>,
          ]} />
          <H3>نقاط عطف</H3>
          <PTag>
            علامت‌های نقطه عطف را به تاریخچه اضافه کنید (مثال: «وام ماشین تسویه شد»، «ملک خریده شد»، «به ارزش خالص ۵۰۰ هزار دلار رسیدیم»).
            نقاط عطف به‌صورت خطوط عمودی روی نمودار نشان داده می‌شوند.
          </PTag>
          <Callout type="tip">
            حداقل ماهانه یک عکس فوری از داشبورد ذخیره کنید تا داده‌های تاریخچه معنی‌داری داشته باشید.
          </Callout>
        </div>
      ),
    },
  },

  // 9. Data Health
  {
    id: "data-health",
    icon: <Zap className="w-4 h-4" />,
    color: "hsl(142,60%,45%)",
    title: { en: "Data Health", fa: "سلامت داده‌ها" },
    keywords: {
      en: "data health score missing stale duplicate integrity warnings fix NaN",
      fa: "سلامت داده امتیاز گمشده کهنه تکراری یکپارچگی هشدار رفع NaN",
    },
    content: {
      en: (
        <div>
          <PTag>
            Data Health scans your entire dataset and gives a score out of 100.
            Each warning tells you exactly what to fix and where.
          </PTag>
          <H3>Checks Performed</H3>
          <UL items={[
            <><strong className="text-foreground">Missing Fields</strong> — Detects empty required fields (e.g. expense amount = 0 or blank)</>,
            <><strong className="text-foreground">Stale Prices</strong> — Flags stocks or crypto where Current Price hasn't been updated in 30+ days</>,
            <><strong className="text-foreground">Duplicate Entries</strong> — Detects expenses with identical date + amount + description</>,
            <><strong className="text-foreground">NaN Values</strong> — Finds numeric fields that resolved to Not-a-Number (usually from blank text in numeric columns)</>,
            <><strong className="text-foreground">Unbalanced Snapshot</strong> — Warns if Net Worth calculation gives unexpected result vs asset/liability breakdown</>,
            <><strong className="text-foreground">Unknown Codes</strong> — Expense records with source codes not in the recognised list</>,
          ]} />
          <H3>Scoring</H3>
          <UL items={[
            "100 — Perfect, no issues",
            "80–99 — Minor issues (stale prices, minor missing fields)",
            "60–79 — Moderate issues (duplicates, some NaN values)",
            "Below 60 — Critical issues needing immediate attention",
          ]} />
          <H3>How to Fix</H3>
          <UL items={[
            "Click any warning card to jump to the affected record",
            "Edit or delete the problematic entry directly",
            "Re-run scan after fixing to update score",
          ]} />
          <Callout type="tip">
            Run Data Health before generating PDF reports or major financial decisions.
            A score below 80 may produce unreliable dashboard numbers.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            سلامت داده کل مجموعه داده شما را اسکن می‌کند و امتیازی از ۱۰۰ می‌دهد.
            هر هشدار دقیقاً به شما می‌گوید چه چیزی را کجا باید رفع کنید.
          </PTag>
          <H3>بررسی‌های انجام‌شده</H3>
          <UL items={[
            <><strong className="text-foreground">فیلدهای گمشده</strong> — فیلدهای اجباری خالی را شناسایی می‌کند</>,
            <><strong className="text-foreground">قیمت‌های کهنه</strong> — سهام یا رمزارزی که قیمت فعلی آن‌ها بیش از ۳۰ روز به‌روز نشده را علامت‌گذاری می‌کند</>,
            <><strong className="text-foreground">ورودی‌های تکراری</strong> — هزینه‌هایی با تاریخ + مبلغ + توضیحات یکسان را شناسایی می‌کند</>,
            <><strong className="text-foreground">مقادیر NaN</strong> — فیلدهای عددی که به Not-a-Number تبدیل شده‌اند را پیدا می‌کند</>,
            <><strong className="text-foreground">عکس فوری نامتوازن</strong> — هشدار می‌دهد اگر محاسبه ارزش خالص نتیجه غیرمنتظره‌ای دهد</>,
            <><strong className="text-foreground">کدهای ناشناخته</strong> — رکوردهای هزینه با کدهای منبع غیرمجاز را شناسایی می‌کند</>,
          ]} />
          <H3>امتیازدهی</H3>
          <UL items={[
            "۱۰۰ — عالی، هیچ مشکلی وجود ندارد",
            "۸۰–۹۹ — مشکلات جزئی (قیمت‌های کهنه، فیلدهای گمشده کوچک)",
            "۶۰–۷۹ — مشکلات متوسط (تکراری‌ها، برخی مقادیر NaN)",
            "زیر ۶۰ — مشکلات بحرانی نیاز به توجه فوری دارند",
          ]} />
          <H3>نحوه رفع</H3>
          <UL items={[
            "روی هر کارت هشدار کلیک کنید تا به رکورد مشکل‌دار بروید",
            "ورودی مشکل‌دار را مستقیماً ویرایش یا حذف کنید",
            "پس از رفع مشکل، اسکن را مجدداً اجرا کنید تا امتیاز به‌روز شود",
          ]} />
          <Callout type="tip">
            قبل از تولید گزارش PDF یا تصمیمات مالی مهم، سلامت داده را اجرا کنید.
            امتیاز زیر ۸۰ ممکن است اعداد داشبورد را غیرقابل اعتماد کند.
          </Callout>
        </div>
      ),
    },
  },

  // 10. Privacy Mode
  {
    id: "privacy",
    icon: <Shield className="w-4 h-4" />,
    color: "hsl(270,60%,60%)",
    title: { en: "Privacy Mode", fa: "حالت حریم خصوصی" },
    keywords: {
      en: "privacy mode hide values mask financial currency percentage toggle localStorage",
      fa: "حالت حریم خصوصی مخفی مقادیر پوشش مالی ارز درصد تغییر حالت",
    },
    content: {
      en: (
        <div>
          <PTag>
            Privacy Mode masks all financial values across the entire app — useful when working
            in public spaces or screen-sharing.
          </PTag>
          <H3>How to Toggle</H3>
          <UL items={[
            "Click the Eye icon in the top navigation bar",
            "All currency values instantly show as $••••••",
            "All percentages show as •••%",
            "Click again to reveal values",
          ]} />
          <H3>What is Masked</H3>
          <UL items={[
            "All KPI card values on the Dashboard",
            "All table amounts (expenses, stocks, crypto)",
            "Chart Y-axis labels",
            "Net worth figures in the Timeline",
            "Tax calculator inputs and outputs",
          ]} />
          <H3>What is NOT Affected</H3>
          <UL items={[
            "Underlying calculations — still run correctly in the background",
            "Exports — PDF and Excel exports always contain real values",
            "Source codes and categories — non-monetary fields remain visible",
          ]} />
          <Callout type="info">
            Privacy Mode preference is saved in localStorage key <code style={{ color: "hsl(43,85%,65%)" }}>sf_privacy_mode</code>.
            It persists across page refreshes but resets on full logout.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            حالت حریم خصوصی تمام مقادیر مالی را در سراسر برنامه پوشش می‌دهد — مفید هنگام کار در مکان‌های عمومی یا اشتراک تصویر.
          </PTag>
          <H3>نحوه تغییر حالت</H3>
          <UL items={[
            "روی آیکون چشم در نوار ناوبری بالا کلیک کنید",
            "تمام مقادیر ارزی فوراً به‌صورت $•••••• نشان داده می‌شوند",
            "تمام درصدها به‌صورت •••٪ نمایش داده می‌شوند",
            "دوباره کلیک کنید تا مقادیر نمایان شوند",
          ]} />
          <H3>چه چیزی پوشیده می‌شود</H3>
          <UL items={[
            "تمام مقادیر کارت‌های KPI در داشبورد",
            "تمام مبالغ جداول (هزینه‌ها، سهام، رمزارز)",
            "برچسب‌های محور Y نمودار",
            "ارقام ارزش خالص در تاریخچه",
            "ورودی‌ها و خروجی‌های ماشین‌حساب مالیات",
          ]} />
          <H3>چه چیزی تأثیر نمی‌پذیرد</H3>
          <UL items={[
            "محاسبات زیربنایی — همچنان در پس‌زمینه به‌درستی اجرا می‌شوند",
            "صادرات — PDF و اکسل همیشه مقادیر واقعی را دارند",
            "کدهای منبع و دسته‌بندی‌ها — فیلدهای غیرپولی قابل مشاهده می‌مانند",
          ]} />
          <Callout type="info">
            تنظیمات حریم خصوصی در <code style={{ color: "hsl(43,85%,65%)" }}>sf_privacy_mode</code> ذخیره می‌شود.
            در بارگذاری مجدد صفحه باقی می‌ماند اما با خروج کامل از سیستم پاک می‌شود.
          </Callout>
        </div>
      ),
    },
  },

  // 11. Bulk Delete
  {
    id: "bulk-delete",
    icon: <Trash2 className="w-4 h-4" />,
    color: "hsl(0,72%,51%)",
    title: { en: "Bulk Delete", fa: "حذف گروهی" },
    keywords: {
      en: "bulk delete select checkbox password confirm backup modal safe records",
      fa: "حذف گروهی انتخاب چک‌باکس رمز عبور تأیید پشتیبان پنجره امن رکورد",
    },
    content: {
      en: (
        <div>
          <PTag>
            Bulk Delete is available on Expenses, Stocks, Crypto, and Scenarios pages.
            It is intentionally multi-step to prevent accidental data loss.
          </PTag>
          <H3>Step-by-Step Process</H3>
          <UL items={[
            "Check the boxes next to the rows you want to delete",
            "The Delete Selected button becomes active (shows count of selected rows)",
            "Click Delete Selected — a modal appears",
            "Review the list of records to be deleted inside the modal",
            "Optionally: click Export Backup to download the records as Excel before deleting",
            "Enter your app password in the password field",
            "Check the box: 'I understand this cannot be undone'",
            "Click Confirm Delete — records are permanently removed",
          ]} />
          <H3>Safety Features</H3>
          <UL items={[
            "No single-click delete — always requires modal confirmation",
            "Password required — same password used to log in",
            "Irreversibility confirmation checkbox — mandatory",
            "Optional pre-deletion backup export",
            "Record count shown at every step",
          ]} />
          <Callout type="warning">
            Once deleted from Supabase, records cannot be recovered unless you exported a backup.
            There is no recycle bin or undo function.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            حذف گروهی در صفحات هزینه‌ها، سهام، رمزارز و سناریوها موجود است.
            برای جلوگیری از از دست دادن تصادفی داده، عمداً چند مرحله‌ای طراحی شده است.
          </PTag>
          <H3>فرآیند گام به گام</H3>
          <UL items={[
            "چک‌باکس‌های کنار سطرهایی که می‌خواهید حذف کنید را علامت بزنید",
            "دکمه «حذف انتخابی» فعال می‌شود (تعداد سطرهای انتخابی را نشان می‌دهد)",
            "روی «حذف انتخابی» کلیک کنید — یک پنجره باز می‌شود",
            "فهرست رکوردهای در حال حذف را در پنجره بررسی کنید",
            "اختیاری: روی «صادرات پشتیبان» کلیک کنید تا رکوردها را قبل از حذف دانلود کنید",
            "رمز عبور برنامه را در فیلد رمز وارد کنید",
            "چک‌باکس: 'می‌دانم که این عمل غیرقابل بازگشت است' را علامت بزنید",
            "روی «تأیید حذف» کلیک کنید — رکوردها به‌طور دائمی حذف می‌شوند",
          ]} />
          <H3>ویژگی‌های ایمنی</H3>
          <UL items={[
            "بدون حذف تک‌کلیک — همیشه نیاز به تأیید پنجره دارد",
            "رمز عبور الزامی — همان رمزی که برای ورود استفاده می‌شود",
            "چک‌باکس تأیید غیرقابل بازگشت بودن — اجباری",
            "صادرات پشتیبان اختیاری قبل از حذف",
            "تعداد رکورد در هر مرحله نشان داده می‌شود",
          ]} />
          <Callout type="warning">
            پس از حذف از سوپابیس، رکوردها قابل بازیابی نیستند مگر اینکه پشتیبان صادر کرده باشید.
            سطل آشغال یا دکمه بازگشت وجود ندارد.
          </Callout>
        </div>
      ),
    },
  },

  // 12. Supabase Sync
  {
    id: "supabase",
    icon: <Cloud className="w-4 h-4" />,
    color: "hsl(142,60%,45%)",
    title: { en: "Supabase Sync", fa: "همگام‌سازی با سوپابیس" },
    keywords: {
      en: "supabase sync cloud source truth tables record ID localStorage timestamp upsert",
      fa: "سوپابیس همگام‌سازی ابری منبع حقیقت جداول شناسه رکورد ذخیره محلی مهر زمانی",
    },
    content: {
      en: (
        <div>
          <PTag>
            Supabase is the single source of truth for all your financial data.
            The app reads from Supabase on load and writes back immediately on save.
          </PTag>
          <H3>Data Flow</H3>
          <UL items={[
            <><strong className="text-foreground">On App Load</strong> — reads from Supabase first; falls back to localStorage cache if offline</>,
            <><strong className="text-foreground">On Save</strong> — upserts to Supabase immediately (real-time persistence)</>,
            <><strong className="text-foreground">LocalStorage</strong> — acts as a temporary cache layer only, not the primary store</>,
            <><strong className="text-foreground">Sync From Cloud</strong> — button forces a fresh read from Supabase, discarding local cache</>,
          ]} />
          <H3>Fixed Record ID</H3>
          <PTag>
            All data is tied to a single record ID: <code style={{ color: "hsl(43,85%,65%)" }}>shahrokh-family-main</code>.
            This means both Shahrokh and Fara share the same dataset automatically.
          </PTag>
          <H3>Database Tables</H3>
          <Table rows={[
            ["sf_snapshot", "Main dashboard snapshot (net worth, income, expenses, assets, liabilities)"],
            ["sf_expenses", "Individual expense transactions"],
            ["sf_properties", "Property investment records"],
            ["sf_stocks", "Stock portfolio holdings"],
            ["sf_crypto", "Crypto portfolio holdings"],
            ["sf_timeline", "Net worth timeline data points"],
            ["sf_scenarios", "What-if financial scenarios"],
          ]} />
          <H3>Last Synced</H3>
          <PTag>
            A "Last Synced" timestamp is shown in the app header. This tells you when data was
            last successfully read from or written to Supabase.
          </PTag>
          <Callout type="info">
            If Supabase is unreachable (no internet), the app operates on the localStorage cache.
            Data entered offline will be upserted on next successful connection.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            سوپابیس منبع اصلی حقیقت برای تمام داده‌های مالی شماست.
            برنامه هنگام بارگذاری از سوپابیس می‌خواند و بلافاصله پس از ذخیره می‌نویسد.
          </PTag>
          <H3>جریان داده</H3>
          <UL items={[
            <><strong className="text-foreground">هنگام بارگذاری برنامه</strong> — ابتدا از سوپابیس می‌خواند؛ اگر آفلاین باشد از حافظه محلی استفاده می‌کند</>,
            <><strong className="text-foreground">هنگام ذخیره</strong> — فوراً در سوپابیس ذخیره می‌شود (پایداری بلادرنگ)</>,
            <><strong className="text-foreground">حافظه محلی</strong> — فقط به‌عنوان لایه کش موقت عمل می‌کند، نه منبع اصلی</>,
            <><strong className="text-foreground">همگام‌سازی از ابر</strong> — دکمه‌ای که خواندن تازه از سوپابیس را اجبار می‌کند</>,
          ]} />
          <H3>شناسه رکورد ثابت</H3>
          <PTag>
            تمام داده‌ها به یک شناسه رکورد ثابت متصل است: <code style={{ color: "hsl(43,85%,65%)" }}>shahrokh-family-main</code>.
            این یعنی شاهرخ و فرا به‌طور خودکار همان مجموعه داده را به اشتراک می‌گذارند.
          </PTag>
          <H3>جداول پایگاه داده</H3>
          <Table rows={[
            ["sf_snapshot", "عکس فوری اصلی داشبورد (ارزش خالص، درآمد، هزینه‌ها، دارایی‌ها، بدهی‌ها)"],
            ["sf_expenses", "تراکنش‌های هزینه فردی"],
            ["sf_properties", "رکوردهای سرمایه‌گذاری ملک"],
            ["sf_stocks", "دارایی‌های سبد سهام"],
            ["sf_crypto", "دارایی‌های سبد رمزارز"],
            ["sf_timeline", "نقاط داده تاریخچه ارزش خالص"],
            ["sf_scenarios", "سناریوهای مالی فرضی"],
          ]} />
          <H3>آخرین همگام‌سازی</H3>
          <PTag>
            یک مهر زمانی «آخرین همگام‌سازی» در هدر برنامه نشان داده می‌شود که آخرین خواندن یا نوشتن موفق را نشان می‌دهد.
          </PTag>
          <Callout type="info">
            اگر سوپابیس در دسترس نباشد (بدون اینترنت)، برنامه روی کش حافظه محلی کار می‌کند.
            داده‌های وارد‌شده آفلاین در اتصال بعدی به سوپابیس منتقل می‌شوند.
          </Callout>
        </div>
      ),
    },
  },

  // 13. Excel Import/Export
  {
    id: "excel",
    icon: <FileSpreadsheet className="w-4 h-4" />,
    color: "hsl(142,60%,45%)",
    title: { en: "Excel Import / Export", fa: "واردات و صادرات اکسل" },
    keywords: {
      en: "excel import export template 4 columns date amount code description preview backup",
      fa: "اکسل واردات صادرات الگو ۴ ستون تاریخ مبلغ کد توضیحات پیش‌نمایش پشتیبان",
    },
    content: {
      en: (
        <div>
          <PTag>
            Excel integration allows bulk data import and full data export.
            Templates ensure the correct format is used every time.
          </PTag>
          <H3>Downloading the Template</H3>
          <UL items={[
            "Go to Expenses page → Import button → Download Template",
            "Template has pre-formatted headers: Date | Amount | Code | Description",
            "Fill in your data — one row per transaction",
          ]} />
          <H3>Filling the Template</H3>
          <Table rows={[
            ["Column A — Date", "Format: DD/MM/YYYY or YYYY-MM-DD"],
            ["Column B — Amount", "Positive number, no $ sign, no commas (e.g. 125.50)"],
            ["Column C — Code", "Source code: D, M, T, E, C, B, R, G, S, L, PI, I, U, BB, CC, TR"],
            ["Column D — Description", "Free text (e.g. 'Woolworths weekly shop')"],
          ]} />
          <H3>Import Process</H3>
          <UL items={[
            "Click Import → Choose File → select your filled Excel file",
            "A preview table shows all rows to be imported",
            "Rows with unknown codes are flagged with a warning (still imported as 'Other')",
            "Review the preview, then click Confirm Import",
            "Data is written to Supabase immediately",
          ]} />
          <H3>Export</H3>
          <UL items={[
            <><strong className="text-foreground">Export All</strong> — downloads all expenses as a formatted Excel file</>,
            <><strong className="text-foreground">Export Selected</strong> — downloads only the checked rows (useful for backup before bulk delete)</>,
            <><strong className="text-foreground">Full Data Export</strong> — from Settings, export all tables (snapshot, stocks, crypto, properties) as a multi-sheet workbook</>,
          ]} />
          <Callout type="tip">
            Export a full backup regularly — monthly is recommended. Store it in a safe location
            (cloud drive, encrypted USB).
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            یکپارچه‌سازی اکسل امکان واردات داده انبوه و صادرات کامل داده را فراهم می‌کند.
            الگوها هر بار فرمت صحیح را تضمین می‌کنند.
          </PTag>
          <H3>دانلود الگو</H3>
          <UL items={[
            "به صفحه هزینه‌ها بروید → دکمه واردات → دانلود الگو",
            "الگو سرستون‌های از پیش فرمت‌شده دارد: تاریخ | مبلغ | کد | توضیحات",
            "داده‌های خود را وارد کنید — یک سطر به ازای هر تراکنش",
          ]} />
          <H3>پر کردن الگو</H3>
          <Table rows={[
            ["ستون A — تاریخ", "فرمت: DD/MM/YYYY یا YYYY-MM-DD"],
            ["ستون B — مبلغ", "عدد مثبت، بدون علامت $، بدون کاما (مثال: ۱۲۵.۵۰)"],
            ["ستون C — کد", "کد منبع: D، M، T، E، C، B، R، G، S، L، PI، I، U، BB، CC، TR"],
            ["ستون D — توضیحات", "متن آزاد (مثال: 'خرید هفتگی ووَل‌وُرتز')"],
          ]} />
          <H3>فرآیند واردات</H3>
          <UL items={[
            "روی واردات کلیک کنید → انتخاب فایل → فایل اکسل خود را انتخاب کنید",
            "یک جدول پیش‌نمایش تمام سطرهایی که باید وارد شوند را نشان می‌دهد",
            "سطرهای با کدهای ناشناخته با هشدار علامت‌گذاری می‌شوند (همچنان به‌عنوان 'سایر' وارد می‌شوند)",
            "پیش‌نمایش را بررسی کنید، سپس «تأیید واردات» را کلیک کنید",
            "داده‌ها فوراً در سوپابیس نوشته می‌شوند",
          ]} />
          <H3>صادرات</H3>
          <UL items={[
            <><strong className="text-foreground">صادرات همه</strong> — تمام هزینه‌ها را به‌صورت فایل اکسل دانلود می‌کند</>,
            <><strong className="text-foreground">صادرات انتخابی</strong> — فقط سطرهای علامت‌خورده را دانلود می‌کند (مفید قبل از حذف گروهی)</>,
            <><strong className="text-foreground">صادرات کامل داده</strong> — از تنظیمات، تمام جداول را به‌صورت یک کتاب کار چند‌برگه دانلود کنید</>,
          ]} />
          <Callout type="tip">
            به‌طور منظم یک نسخه پشتیبان کامل صادر کنید — ماهانه توصیه می‌شود.
            آن را در مکانی امن ذخیره کنید (فضای ابری، USB رمزگذاری‌شده).
          </Callout>
        </div>
      ),
    },
  },

  // 14. PDF Export
  {
    id: "pdf",
    icon: <FileDown className="w-4 h-4" />,
    color: "hsl(0,72%,51%)",
    title: { en: "PDF Export", fa: "صادرات PDF" },
    keywords: {
      en: "PDF export reports html2canvas print net worth expenses assets layout",
      fa: "PDF صادرات گزارش‌ها چاپ ارزش خالص هزینه‌ها دارایی‌ها طرح‌بندی",
    },
    content: {
      en: (
        <div>
          <PTag>
            Generate a professional PDF summary of your financial position from the Reports page.
            The output is print-ready and suitable for sharing with accountants or advisors.
          </PTag>
          <H3>What's Included in the PDF</H3>
          <UL items={[
            "Cover page with family name, date, and period",
            "Net Worth summary (total assets, liabilities, net worth)",
            "Expense breakdown by category (table + pie chart)",
            "Stock and crypto portfolio summary",
            "Property portfolio summary",
            "Net Worth timeline chart",
            "Tax summary (if Tax Calculator was used in this session)",
          ]} />
          <H3>How to Generate</H3>
          <UL items={[
            "Go to Reports page",
            "Select the reporting period (month, quarter, year, or custom)",
            "Click Generate PDF",
            "The app renders a print-ready layout using html2canvas",
            "Your browser's save/download dialog appears",
            "Save as PDF (choose 'Save as PDF' in the print dialog)",
          ]} />
          <Callout type="info">
            PDF generation works best in Chrome or Edge. Safari may have minor rendering differences.
            Ensure Privacy Mode is OFF before generating if you need real values in the PDF.
          </Callout>
          <Callout type="tip">
            For best quality, use A4 paper size and set margins to "None" or "Minimum" in the print dialog.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            یک خلاصه PDF حرفه‌ای از وضعیت مالی خود را از صفحه گزارش‌ها تولید کنید.
            خروجی آماده چاپ است و برای اشتراک‌گذاری با حسابداران یا مشاوران مناسب است.
          </PTag>
          <H3>محتوای PDF</H3>
          <UL items={[
            "صفحه جلد با نام خانواده، تاریخ و دوره",
            "خلاصه ارزش خالص (کل دارایی‌ها، بدهی‌ها، ارزش خالص)",
            "تفکیک هزینه بر اساس دسته‌بندی (جدول + نمودار دایره‌ای)",
            "خلاصه سبد سهام و رمزارز",
            "خلاصه سبد ملک",
            "نمودار تاریخچه ارزش خالص",
            "خلاصه مالیات (اگر ماشین‌حساب مالیات در این جلسه استفاده شده باشد)",
          ]} />
          <H3>نحوه تولید</H3>
          <UL items={[
            "به صفحه گزارش‌ها بروید",
            "دوره گزارش را انتخاب کنید (ماه، فصل، سال یا سفارشی)",
            "روی «تولید PDF» کلیک کنید",
            "برنامه با html2canvas یک طرح‌بندی آماده چاپ رندر می‌کند",
            "کادر ذخیره/دانلود مرورگر شما ظاهر می‌شود",
            "به‌صورت PDF ذخیره کنید",
          ]} />
          <Callout type="info">
            تولید PDF در Chrome یا Edge بهترین عملکرد را دارد.
            قبل از تولید PDF، مطمئن شوید حالت حریم خصوصی خاموش است.
          </Callout>
          <Callout type="tip">
            برای بهترین کیفیت، اندازه کاغذ A4 و حاشیه «هیچ» یا «حداقل» را در کادر چاپ انتخاب کنید.
          </Callout>
        </div>
      ),
    },
  },

  // 15. Settings
  {
    id: "settings",
    icon: <Settings className="w-4 h-4" />,
    color: "hsl(220,10%,55%)",
    title: { en: "Settings", fa: "تنظیمات" },
    keywords: {
      en: "settings app name theme dark light sync credentials password manage",
      fa: "تنظیمات نام برنامه تم تیره روشن همگام‌سازی اعتبارنامه رمز عبور مدیریت",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Settings page controls app-wide preferences, display options, and sync behaviour.
          </PTag>
          <H3>Display Settings</H3>
          <UL items={[
            <><strong className="text-foreground">App Name Display</strong> — change the name shown in the header (e.g. 'Shahrokh Family' or 'Family Wealth Lab')</>,
            <><strong className="text-foreground">Theme</strong> — toggle between Dark mode (default) and Light mode. Preference saved in localStorage.</>,
          ]} />
          <H3>Sync Settings</H3>
          <UL items={[
            <><strong className="text-foreground">Sync From Cloud</strong> — force reload all data from Supabase</>,
            <><strong className="text-foreground">Auto-sync interval</strong> — how often the app checks for remote changes (default: on page load only)</>,
            <><strong className="text-foreground">Last Synced timestamp</strong> — shows when data was last read from Supabase</>,
          ]} />
          <H3>Credential Management</H3>
          <UL items={[
            "Change app login password",
            "View Supabase connection status",
            "Reset localStorage cache (does not delete Supabase data)",
          ]} />
          <Callout type="warning">
            Resetting localStorage cache will cause the app to reload from Supabase on next launch.
            Any data entered offline that hasn't synced yet will be lost.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            صفحه تنظیمات، تنظیمات کل برنامه، گزینه‌های نمایش و رفتار همگام‌سازی را کنترل می‌کند.
          </PTag>
          <H3>تنظیمات نمایش</H3>
          <UL items={[
            <><strong className="text-foreground">نام برنامه</strong> — نامی که در هدر نشان داده می‌شود را تغییر دهید</>,
            <><strong className="text-foreground">تم</strong> — بین حالت تیره (پیش‌فرض) و روشن جابجا شوید. تنظیمات در حافظه محلی ذخیره می‌شود.</>,
          ]} />
          <H3>تنظیمات همگام‌سازی</H3>
          <UL items={[
            <><strong className="text-foreground">همگام‌سازی از ابر</strong> — بارگذاری مجدد اجباری همه داده‌ها از سوپابیس</>,
            <><strong className="text-foreground">فاصله همگام‌سازی خودکار</strong> — چند وقت یک‌بار برنامه تغییرات از راه دور را بررسی می‌کند</>,
            <><strong className="text-foreground">مهر زمانی آخرین همگام‌سازی</strong> — نشان می‌دهد داده‌ها آخرین بار چه زمانی از سوپابیس خوانده شدند</>,
          ]} />
          <H3>مدیریت اعتبارنامه</H3>
          <UL items={[
            "تغییر رمز عبور ورود به برنامه",
            "مشاهده وضعیت اتصال سوپابیس",
            "بازنشانی کش حافظه محلی (داده‌های سوپابیس را حذف نمی‌کند)",
          ]} />
          <Callout type="warning">
            بازنشانی کش حافظه محلی باعث می‌شود برنامه در راه‌اندازی بعدی از سوپابیس بارگذاری شود.
            هر داده‌ای که آفلاین وارد شده و هنوز همگام‌سازی نشده از دست می‌رود.
          </Callout>
        </div>
      ),
    },
  },

  // 16. FAQ
  {
    id: "faq",
    icon: <HelpCircle className="w-4 h-4" />,
    color: "hsl(43,85%,55%)",
    title: { en: "Frequently Asked Questions", fa: "سؤالات متداول" },
    keywords: {
      en: "FAQ questions answers persist mobile import bank NaN stamp duty delete all update deploy vercel github",
      fa: "سؤالات متداول پاسخ ماندگاری موبایل واردات بانک NaN عوارض تمبر حذف همه به‌روزرسانی انتشار ورسل گیت‌هاب",
    },
    content: {
      en: (
        <div>
          <div className="space-y-4">
            {[
              {
                q: "Why does data persist after I close the browser?",
                a: "All data is saved to Supabase (cloud database) on every save action. localStorage provides a local cache for faster loads, but Supabase is the permanent store. Your data persists across devices, browsers, and browser restarts.",
              },
              {
                q: "Can I use this app on my phone?",
                a: "Yes — the app is fully responsive. All pages adapt to mobile screen sizes. The navigation collapses to a hamburger menu on small screens. Complex tables (expenses, stocks) scroll horizontally on mobile.",
              },
              {
                q: "How do I import expenses from my bank?",
                a: "Export your bank statement as an Excel or CSV file from your online banking portal. Then re-map the columns to the 4-column format (Date, Amount, Code, Description). Use the Code column to categorise each transaction with the appropriate source code (D, M, T, etc.). Import using the Expenses → Import button.",
              },
              {
                q: "What if I enter a wrong source code during import?",
                a: "The importer will flag the unknown code with a warning icon in the preview. The row is still imported but categorised as 'Other / Unknown'. After import, you can edit the record and assign the correct code.",
              },
              {
                q: "Is my financial data secure?",
                a: "Data is stored in Supabase with your private project URL and anon key. Row Level Security (RLS) can be enabled for additional protection. Privacy Mode masks values on-screen. The app URL (familywealthlab.net) is private — not indexed or publicly listed.",
              },
              {
                q: "Can Fara and I both use the same data?",
                a: "Yes — both users share the same Supabase record (shahrokh-family-main). Any changes made by either user are immediately visible to the other on next load or sync. There is no conflict resolution — last save wins.",
              },
              {
                q: "How do I fix NaN values on the dashboard?",
                a: "NaN (Not a Number) usually means a numeric field contains an empty string or invalid text. Go to Data Health — it will identify the specific records. Edit each record and ensure all numeric fields have valid numbers (no blanks, no text, no special characters).",
              },
              {
                q: "How does the property stamp duty calculate?",
                a: "The Property Calculator uses the Queensland (QLD) Government sliding-scale stamp duty formula. The rate increases in brackets as the purchase price rises. See the Property Calculator section above for the full bracket table.",
              },
              {
                q: "Can I delete all expenses at once?",
                a: "No — there is no one-click delete all. Bulk delete requires: selecting specific rows → entering your password → checking the irreversibility confirmation → optionally exporting a backup. This multi-step process is intentional to prevent accidental data loss.",
              },
              {
                q: "How do I update the live site (familywealthlab.net)?",
                a: "Edit the relevant files locally. Commit the changes with git and push to GitHub. Vercel detects the push and automatically deploys within 1–2 minutes. The live site updates without any manual action needed.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="rounded-xl p-4"
                style={{
                  background: "hsl(224,15%,10%)",
                  border: "1px solid hsl(224,12%,20%)",
                }}
              >
                <p className="text-sm font-semibold text-foreground mb-2 flex gap-2">
                  <span style={{ color: "hsl(43,85%,55%)" }}>Q{i + 1}.</span>
                  {item.q}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed pl-6">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      ),
      fa: (
        <div>
          <div className="space-y-4">
            {[
              {
                q: "چرا داده‌ها پس از بستن مرورگر باقی می‌مانند؟",
                a: "تمام داده‌ها در هر عمل ذخیره به سوپابیس (پایگاه داده ابری) ذخیره می‌شوند. حافظه محلی یک کش محلی برای بارگذاری سریع‌تر فراهم می‌کند، اما سوپابیس منبع اصلی دائمی است. داده‌های شما در دستگاه‌ها، مرورگرها و راه‌اندازی‌های مجدد مرورگر باقی می‌مانند.",
              },
              {
                q: "آیا می‌توانم این برنامه را روی گوشی استفاده کنم؟",
                a: "بله — این برنامه کاملاً واکنش‌گرا است. تمام صفحات با اندازه‌های صفحه موبایل تطبیق می‌یابند. ناوبری در صفحه‌های کوچک به منوی همبرگری تبدیل می‌شود. جداول پیچیده (هزینه‌ها، سهام) در موبایل به‌صورت افقی اسکرول می‌شوند.",
              },
              {
                q: "چطور هزینه‌ها را از بانکم وارد کنم؟",
                a: "صورتحساب بانکی خود را از پورتال بانکداری آنلاین به‌صورت Excel یا CSV صادر کنید. سپس ستون‌ها را به فرمت ۴ ستونی (تاریخ، مبلغ، کد، توضیحات) تبدیل کنید. از ستون کد برای دسته‌بندی هر تراکنش با کد منبع مناسب استفاده کنید. با دکمه هزینه‌ها → واردات وارد کنید.",
              },
              {
                q: "اگر کد منبع اشتباه وارد کنم چه می‌شود؟",
                a: "وارد‌کننده کد ناشناخته را با آیکون هشدار در پیش‌نمایش علامت‌گذاری می‌کند. سطر همچنان وارد می‌شود اما به‌عنوان 'سایر / ناشناخته' دسته‌بندی می‌شود. پس از واردات، می‌توانید رکورد را ویرایش کنید و کد صحیح را تخصیص دهید.",
              },
              {
                q: "آیا اطلاعات مالی من امن است؟",
                a: "داده‌ها با URL پروژه خصوصی و کلید anon شما در سوپابیس ذخیره می‌شوند. برای حفاظت بیشتر می‌توان Row Level Security را فعال کرد. حالت حریم خصوصی مقادیر را روی صفحه پوشش می‌دهد. URL برنامه (familywealthlab.net) خصوصی است.",
              },
              {
                q: "آیا فرا و من می‌توانیم از همان داده استفاده کنیم؟",
                a: "بله — هر دو کاربر همان رکورد سوپابیس (shahrokh-family-main) را به اشتراک می‌گذارند. هر تغییری که توسط هر کدام از کاربران ایجاد شود در بارگذاری یا همگام‌سازی بعدی برای دیگری قابل مشاهده است. بدون مدیریت تعارض — آخرین ذخیره برنده می‌شود.",
              },
              {
                q: "چطور مقادیر NaN در داشبورد را رفع کنم؟",
                a: "NaN (نه یک عدد) معمولاً به این معنی است که یک فیلد عددی حاوی رشته خالی یا متن نامعتبر است. به سلامت داده بروید — رکوردهای خاص را شناسایی می‌کند. هر رکورد را ویرایش کنید و مطمئن شوید تمام فیلدهای عددی اعداد معتبر دارند.",
              },
              {
                q: "عوارض تمبر ملک چطور محاسبه می‌شود؟",
                a: "ماشین‌حساب ملک از فرمول عوارض تمبر مقیاس متغیر دولت کوئینزلند (QLD) استفاده می‌کند. نرخ با افزایش قیمت خرید در پله‌ها افزایش می‌یابد. جدول کامل پله‌ها را در بخش ماشین‌حساب ملک بالا ببینید.",
              },
              {
                q: "آیا می‌توانم همه هزینه‌ها را یک‌باره حذف کنم؟",
                a: "خیر — حذف همه با یک کلیک وجود ندارد. حذف گروهی نیاز دارد: انتخاب سطرهای خاص → وارد کردن رمز عبور → تأیید چک‌باکس غیرقابل بازگشت بودن → اختیاری صادرات پشتیبان. این فرآیند چند مرحله‌ای عمدی است تا از از دست دادن تصادفی داده جلوگیری شود.",
              },
              {
                q: "چطور سایت زنده (familywealthlab.net) را به‌روز کنم؟",
                a: "فایل‌های مربوطه را به‌صورت محلی ویرایش کنید. تغییرات را با git commit کنید و به GitHub push کنید. Vercel push را تشخیص می‌دهد و ظرف ۱–۲ دقیقه به‌طور خودکار استقرار می‌دهد. سایت زنده بدون هیچ اقدام دستی به‌روز می‌شود.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="rounded-xl p-4"
                style={{
                  background: "hsl(224,15%,10%)",
                  border: "1px solid hsl(224,12%,20%)",
                }}
              >
                <p className="text-sm font-semibold text-foreground mb-2 flex gap-2">
                  <span style={{ color: "hsl(43,85%,55%)" }}>س{i + 1}.</span>
                  {item.q}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed pr-6">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  },

  // 17. FIRE Tracker
  {
    id: "fire-tracker",
    icon: <Flame className="w-4 h-4" />,
    color: "hsl(16,90%,55%)",
    title: { en: "FIRE Tracker — Financial Freedom", fa: "ردیاب فایر — آزادی مالی" },
    keywords: {
      en: "fire financial independence retire early passive income withdrawal rate capital freedom semi",
      fa: "فایر استقلال مالی بازنشستگی زودهنگام درآمد غیرفعال نرخ برداشت سرمایه",
    },
    content: {
      en: (
        <div>
          <PTag>
            The FIRE (Financial Independence, Retire Early) Tracker calculates how far you are
            from financial freedom. Enter your desired monthly passive income, expected investment
            return, and safe withdrawal rate. The tracker shows required capital, current investable
            assets, progress percentage, and estimated years remaining.
          </PTag>
          <H3>Key Inputs</H3>
          <UL items={[
            <><strong className="text-foreground">Desired Monthly Passive Income</strong> — Target income from investments to cover your lifestyle.</>,
            <><strong className="text-foreground">Expected Return</strong> — Default 7% annual investment return.</>,
            <><strong className="text-foreground">Safe Withdrawal Rate</strong> — Default 4% — percentage of portfolio drawn per year.</>,
            <><strong className="text-foreground">Monthly Savings</strong> — How much you invest each month towards FIRE.</>,
          ]} />
          <H3>Formulas</H3>
          <Formula>Required FIRE Capital = (Desired Monthly Passive Income × 12) / Safe Withdrawal Rate</Formula>
          <Formula>FIRE Progress = Current Investable Assets / Required FIRE Capital × 100</Formula>
          <Formula>{"Years to FIRE: month-by-month compound simulation\nAccumulation = PV × (1+r)^n + PMT × ((1+r)^n − 1) / r"}</Formula>
          <H3>Scenarios</H3>
          <UL items={[
            "Adding $2,000/month extra accelerates FIRE date significantly.",
            "Adding investment property income reduces the capital shortfall.",
          ]} />
          <Callout type="info">
            Semi-FIRE: 50% of the required capital target — represents partial financial freedom.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            ردیاب فایر (استقلال مالی، بازنشستگی زودهنگام) محاسبه می‌کند که تا چه اندازه به آزادی مالی نزدیک هستید.
            درآمد غیرفعال ماهانه مورد نظر، بازده سرمایه‌گذاری مورد انتظار و نرخ برداشت ایمن را وارد کنید.
          </PTag>
          <H3>فرمول‌ها</H3>
          <Formula>سرمایه لازم برای فایر = (درآمد غیرفعال ماهانه × ۱۲) / نرخ برداشت ایمن</Formula>
          <Formula>پیشرفت فایر = دارایی‌های سرمایه‌گذاری‌شده فعلی / سرمایه لازم × ۱۰۰</Formula>
          <Formula>سال‌های باقیمانده: شبیه‌سازی ماه به ماه با رشد مرکب</Formula>
          <Callout type="info">
            نیمه فایر: ۵۰٪ هدف سرمایه — نشان‌دهنده آزادی مالی جزئی است.
          </Callout>
        </div>
      ),
    },
  },

  // 18. Debt Killer Engine
  {
    id: "debt-killer",
    icon: <Sword className="w-4 h-4" />,
    color: "hsl(0,72%,51%)",
    title: { en: "Debt Killer Engine", fa: "موتور حذف بدهی" },
    keywords: {
      en: "debt killer avalanche snowball hybrid repayment interest mortgage loan extra payment free",
      fa: "حذف بدهی بهمن گلوله برفی ترکیبی بازپرداخت بهره وام مسکن",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Debt Killer Engine compares three debt repayment strategies and shows you the
            fastest, cheapest path to becoming debt-free.
          </PTag>
          <H3>Three Methods</H3>
          <UL items={[
            <><strong className="text-foreground">Avalanche</strong> — Pay highest interest rate debt first. Minimises total interest paid.</>,
            <><strong className="text-foreground">Snowball</strong> — Pay smallest balance first. Provides psychological wins.</>,
            <><strong className="text-foreground">Hybrid</strong> — Weighted combination of both methods.</>,
          ]} />
          <H3>Data Sources</H3>
          <PTag>
            The engine uses your mortgage, personal loan, and other debts from the Dashboard snapshot,
            and allows you to add additional debts manually.
          </PTag>
          <H3>Calculation Method</H3>
          <Formula>{"Month-by-month simulation:\n1. Interest accrues on each balance\n2. Minimum payment applied to all debts\n3. Extra payment directed to priority debt\n4. Repeat until all balances reach zero"}</Formula>
          <Callout type="tip">
            Adding $1,000/month extra dramatically reduces total interest paid and time to debt freedom.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            موتور حذف بدهی سه استراتژی بازپرداخت بدهی را مقایسه می‌کند تا سریع‌ترین و ارزان‌ترین مسیر برای خروج از بدهی را نشان دهد.
          </PTag>
          <H3>سه روش</H3>
          <UL items={[
            <><strong className="text-foreground">بهمن (Avalanche)</strong> — پرداخت بدهی با بالاترین نرخ بهره اول. کمترین بهره کل را دارد.</>,
            <><strong className="text-foreground">گلوله برفی (Snowball)</strong> — پرداخت کمترین مانده اول. انگیزه روانی ایجاد می‌کند.</>,
            <><strong className="text-foreground">ترکیبی (Hybrid)</strong> — ترکیب وزن‌دار هر دو روش.</>,
          ]} />
        </div>
      ),
    },
  },

  // 19. Net Worth Simulator
  {
    id: "net-worth-simulator",
    icon: <BarChart3 className="w-4 h-4" />,
    color: "hsl(142,60%,45%)",
    title: { en: "Future Net Worth Simulator", fa: "شبیه‌ساز ارزش خالص آینده" },
    keywords: {
      en: "net worth simulator future scenarios property stocks investment growth projection 5 year 10 year",
      fa: "ارزش خالص شبیه‌ساز آینده سناریو ملک سهام سرمایه‌گذاری رشد پیش‌بینی",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Net Worth Simulator projects your financial position across 4 scenarios over 5 and 10 years.
          </PTag>
          <H3>Four Scenarios</H3>
          <UL items={[
            <><strong className="text-foreground">A. Current Path</strong> — Continue current income, expenses, and investment patterns.</>,
            <><strong className="text-foreground">B. Investment Property</strong> — Add one IP at your specified price with capital growth.</>,
            <><strong className="text-foreground">C. Extra Stock Investment</strong> — Invest $3,000/month additional into stocks.</>,
            <><strong className="text-foreground">D. Combined</strong> — Property + extra stocks.</>,
          ]} />
          <H3>Editable Assumptions</H3>
          <UL items={[
            "Property growth rate, stock return, crypto return",
            "Inflation, income growth, expense growth",
            "Interest rate, rent growth",
          ]} />
          <Formula>Net Worth = Total Assets − Total Liabilities (calculated per year per scenario)</Formula>
          <Callout type="tip">
            The simulator shows which path creates the most wealth over time — use it to compare strategies before committing.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            شبیه‌ساز ارزش خالص وضعیت مالی شما را در ۴ سناریو طی ۵ و ۱۰ سال آینده پیش‌بینی می‌کند.
          </PTag>
          <UL items={[
            "مسیر فعلی: ادامه درآمد، هزینه و سرمایه‌گذاری فعلی",
            "خرید ملک سرمایه‌گذاری با رشد سرمایه مشخص",
            "سرمایه‌گذاری اضافه $3,000 ماهانه در سهام",
            "ترکیب ملک + سهام",
          ]} />
        </div>
      ),
    },
  },

  // 20. Lifestyle Inflation Detector
  {
    id: "lifestyle-inflation",
    icon: <TrendingDown className="w-4 h-4" />,
    color: "hsl(43,85%,55%)",
    title: { en: "Lifestyle Inflation Detector", fa: "ردیاب تورم سبک زندگی" },
    keywords: {
      en: "lifestyle inflation spending creep subscriptions dining savings rate leakage traffic light detector",
      fa: "تورم سبک زندگی افزایش هزینه اشتراک رستوران نرخ پس‌انداز نشت ردیاب",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Lifestyle Inflation Detector analyses your expense history to identify spending
            creep before it silently erodes your savings rate.
          </PTag>
          <H3>What It Detects</H3>
          <UL items={[
            "Month-over-month spending change",
            "Same month vs last year comparison",
            "3-month average vs prior 3 months",
            "Category creep: which categories are growing fastest",
            "Subscription creep: total recurring subscription spend",
            "Dining/coffee creep",
          ]} />
          <H3>Formulas</H3>
          <Formula>Lifestyle Ratio = Non-essential spend / Total spend × 100</Formula>
          <Formula>Monthly Leakage = Current period average − Baseline 12-month average</Formula>
          <Formula>Annual Leakage = Monthly Leakage × 12</Formula>
          <H3>Traffic Light System</H3>
          <UL items={[
            <><strong className="text-foreground">Green</strong> — Stable spending</>,
            <><strong className="text-foreground">Amber</strong> — Moderate growth detected</>,
            <><strong className="text-foreground">Red</strong> — Significant creep detected</>,
          ]} />
        </div>
      ),
      fa: (
        <div>
          <PTag>
            ردیاب تورم سبک زندگی تاریخچه هزینه‌های شما را تحلیل می‌کند تا افزایش هزینه‌های تدریجی را قبل از آسیب رساندن به نرخ پس‌انداز شناسایی کند.
          </PTag>
          <Formula>نسبت سبک زندگی = هزینه‌های غیرضروری / کل هزینه‌ها × ۱۰۰</Formula>
          <Formula>نشت ماهانه = میانگین دوره فعلی − میانگین ۱۲ ماه پایه</Formula>
          <Callout type="tip">
            سیستم چراغ راهنما: سبز (ثابت)، زرد (رشد متوسط)، قرمز (افزایش قابل‌توجه).
          </Callout>
        </div>
      ),
    },
  },

  // 21. Emergency Score
  {
    id: "emergency-score",
    icon: <Shield className="w-4 h-4" />,
    color: "hsl(188,60%,48%)",
    title: { en: "Emergency Score", fa: "امتیاز اضطراری" },
    keywords: {
      en: "emergency score fund buffer months cash liquid risk protection shock family",
      fa: "امتیاز اضطراری صندوق بافر ماه نقدی ریسک محافظت شوک خانواده",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Emergency Score measures how well-protected your family is against financial shocks.
            Score 0–100 based on months of expenses covered by liquid cash assets.
          </PTag>
          <H3>Recommended Buffer</H3>
          <UL items={[
            <><strong className="text-foreground">Family of 4+</strong> — 6 months of total monthly costs</>,
            <><strong className="text-foreground">Family of 1–3</strong> — 3 months</>,
          ]} />
          <H3>Formulas</H3>
          <Formula>Total Monthly Cost = Monthly Expenses + Monthly Debt Repayments</Formula>
          <Formula>Months Covered = Cash / Total Monthly Cost</Formula>
          <Formula>Score = Min(100, Months Covered / Recommended Months × 100)</Formula>
          <Formula>Target Cash Reserve = Total Monthly Cost × Recommended Months</Formula>
          <H3>Risk Levels</H3>
          <Table rows={[
            ["80 – 100", "Low Risk — fully covered"],
            ["50 – 79", "Medium Risk — partially covered"],
            ["0 – 49", "High Risk — urgent action needed"],
          ]} />
        </div>
      ),
      fa: (
        <div>
          <PTag>
            امتیاز اضطراری اندازه‌گیری می‌کند که خانواده شما در برابر شوک‌های مالی چقدر محافظت شده است.
            امتیاز ۰ تا ۱۰۰ بر اساس ماه‌های پوشش داده شده توسط دارایی‌های نقدی.
          </PTag>
          <Table rows={[
            ["۸۰ – ۱۰۰", "ریسک کم — پوشش کامل"],
            ["۵۰ – ۷۹", "ریسک متوسط — پوشش جزئی"],
            ["۰ – ۴۹", "ریسک بالا — اقدام فوری لازم"],
          ]} />
        </div>
      ),
    },
  },

  // 22. Tax Optimizer
  {
    id: "tax-optimizer",
    icon: <Calculator className="w-4 h-4" />,
    color: "hsl(270,60%,60%)",
    title: { en: "Tax Optimizer — Australia", fa: "بهینه‌ساز مالیات — استرالیا" },
    keywords: {
      en: "tax optimizer australia income bracket medicare levy LITO negative gearing super CGT capital gains",
      fa: "بهینه‌ساز مالیات استرالیا درآمد اهرم منفی سوپر عایدی سرمایه",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Tax Optimizer calculates your Australian income tax position and identifies legal
            strategies to reduce your tax liability.
          </PTag>
          <H3>FY2025-26 Tax Brackets</H3>
          <Table rows={[
            ["$0 – $18,200", "0%"],
            ["$18,201 – $45,000", "19c per $1 over $18,200"],
            ["$45,001 – $120,000", "$5,092 + 32.5c per $1 over $45,000"],
            ["$120,001 – $180,000", "$29,467 + 37c per $1 over $120,000"],
            ["$180,001+", "$51,667 + 45c per $1 over $180,000"],
            ["Medicare Levy", "2% of taxable income"],
            ["LITO", "Up to $700 offset (phases out above $37,500)"],
          ]} />
          <H3>Tax Strategies</H3>
          <UL items={[
            <><strong className="text-foreground">Negative Gearing</strong> — Rental losses offset income tax.</>,
            <><strong className="text-foreground">Super Contributions</strong> — Taxed at 15% instead of marginal rate.</>,
            <><strong className="text-foreground">CGT Discount</strong> — 50% discount for assets held 12+ months.</>,
          ]} />
          <Callout type="warning">
            General information only, not tax advice. Consult a registered Australian tax adviser.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            بهینه‌ساز مالیات مالیات درآمد استرالیایی شما را محاسبه می‌کند و استراتژی‌های قانونی برای کاهش بدهی مالیاتی را شناسایی می‌کند.
            این ابزار شامل نرخ‌های مالیاتی ۲۰۲۵-۲۶، اهرم منفی، سوپر و تخفیف مالیات عایدی سرمایه است.
          </PTag>
          <Callout type="warning">
            اطلاعات عمومی فقط، مشاوره مالیاتی نیست. با یک مشاور مالیاتی ثبت‌شده استرالیا مشورت کنید.
          </Callout>
        </div>
      ),
    },
  },

  // 23. Property Expansion Engine
  {
    id: "property-expansion",
    icon: <Building2 className="w-4 h-4" />,
    color: "hsl(20,80%,55%)",
    title: { en: "Property Expansion Engine", fa: "موتور توسعه ملک" },
    keywords: {
      en: "property expansion investment LVR stamp duty deposit readiness equity QLD loan serviceability LMI",
      fa: "توسعه ملک سرمایه‌گذاری ال‌وی‌آر عوارض تمبر سپرده آمادگی سهام کوئینزلند",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Property Expansion Engine helps you assess your readiness to purchase your next
            investment property. It analyses your PPOR equity, available cash deposit, and monthly
            surplus for loan serviceability.
          </PTag>
          <H3>LVR Scenarios Compared</H3>
          <Table rows={[
            ["80% LVR", "Full deposit required, no LMI"],
            ["85% LVR", "Smaller deposit, some LMI"],
            ["90% LVR", "Minimum deposit, higher LMI cost"],
          ]} />
          <H3>QLD Stamp Duty (Investment Property)</H3>
          <Table rows={[
            ["$0 – $5,000", "$0"],
            ["$5,001 – $75,000", "1.5%"],
            ["$75,001 – $540,000", "3.5%"],
            ["$540,001 – $1,000,000", "4.5%"],
            ["$1,000,001+", "5.75%"],
          ]} />
          <Formula>Deposit Readiness Score = Available Deposit / Required Deposit × 100</Formula>
          <Callout type="warning">
            Cash Buffer Warning: If cash remaining after purchase is less than $30,000, a risk warning is displayed.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            موتور توسعه ملک آمادگی شما برای خرید ملک سرمایه‌گذاری بعدی را ارزیابی می‌کند.
            سه سناریو ال‌وی‌آر (۸۰، ۸۵، ۹۰ درصد) مقایسه می‌شود.
            عوارض تمبر کوئینزلند، حق بیمه وام مسکن، و تاثیر بر جریان نقدی ماهانه محاسبه می‌شود.
          </PTag>
          <Formula>امتیاز آمادگی سپرده = سپرده موجود / سپرده لازم × ۱۰۰</Formula>
        </div>
      ),
    },
  },

  // 24. Retirement Age Predictor
  {
    id: "retirement-predictor",
    icon: <Clock className="w-4 h-4" />,
    color: "hsl(142,60%,45%)",
    title: { en: "Retirement Age Predictor", fa: "پیش‌بین سن بازنشستگی" },
    keywords: {
      en: "retirement age predictor financial independence path strategy portfolio passive income simulation",
      fa: "سن بازنشستگی پیش‌بین استقلال مالی مسیر استراتژی پورتفولیو درآمد غیرفعال",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Retirement Age Predictor estimates when you could achieve financial independence
            across 5 investment strategies.
          </PTag>
          <H3>Five Paths</H3>
          <UL items={[
            <><strong className="text-foreground">A. Current Path</strong> — Current savings rate at 7% return</>,
            <><strong className="text-foreground">B. Aggressive</strong> — Extra $2,000/month at 8% return</>,
            <><strong className="text-foreground">C. Property Path</strong> — Add 1 IP at age 40, 6% capital growth</>,
            <><strong className="text-foreground">D. Stocks Focus</strong> — All surplus into stocks at 9%</>,
            <><strong className="text-foreground">E. Combined</strong> — Aggressive + Property</>,
          ]} />
          <H3>Key Formulas</H3>
          <Formula>Projected Portfolio at age N = PV × (1+r)^years + PMT × ((1+r)^years − 1) / r</Formula>
          <Formula>Passive Income = Portfolio × 0.04 / 12</Formula>
          <Formula>Target reached when: Passive Income ≥ Target Monthly Income</Formula>
          <Callout type="info">
            Target ages 45, 50, 55, and 60 are shown as milestone scenarios for each path.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            پیش‌بین سن بازنشستگی تخمین می‌زند که چه زمانی می‌توانید در ۵ استراتژی مختلف به استقلال مالی برسید.
            هر مسیر: شبیه‌سازی سال به سال رشد پورتفولیو تا زمانی که درآمد غیرفعال به هدف ماهانه برسد.
          </PTag>
          <Formula>پورتفولیو پیش‌بینی‌شده = PV × (1+r)^n + PMT × ((1+r)^n − ۱) / r</Formula>
          <Formula>درآمد غیرفعال = پورتفولیو × ۰.۰۴ / ۱۲</Formula>
        </div>
      ),
    },
  },

  // 25. Hidden Money Detector
  {
    id: "hidden-money",
    icon: <Search className="w-4 h-4" />,
    color: "hsl(43,85%,55%)",
    title: { en: "Hidden Money Detector", fa: "ردیاب پول پنهان" },
    keywords: {
      en: "hidden money detector leakage subscriptions dining interest dead cash insurance duplicate savings health score",
      fa: "پول پنهان نشت اشتراک رستوران بهره پول راکد بیمه تکراری پس‌انداز",
    },
    content: {
      en: (
        <div>
          <PTag>
            The Hidden Money Detector scans your expenses, debts, and cash holdings to identify
            avoidable financial leakage.
          </PTag>
          <H3>What It Detects</H3>
          <UL items={[
            <><strong className="text-foreground">Subscription Creep</strong> — Total subscriptions &gt; $200/month flagged</>,
            <><strong className="text-foreground">Dining Creep</strong> — Dining Out / Coffee &gt; $600/month flagged</>,
            <><strong className="text-foreground">High-Interest Debt</strong> — Monthly interest on other debts (~15% rate)</>,
            <><strong className="text-foreground">Dead Cash</strong> — Cash above 6-month buffer not earning investment returns</>,
            <><strong className="text-foreground">Large Unusual Transactions</strong> — Single expenses &gt; $2,000 in non-housing categories</>,
            <><strong className="text-foreground">Excessive Insurance</strong> — &gt; $600/month in insurance category</>,
            <><strong className="text-foreground">Duplicate Expenses</strong> — Same description + amount within 7 days</>,
          ]} />
          <Formula>Money Health Score = 100 − (Monthly Leakage / Monthly Expenses × 100)</Formula>
          <Callout type="tip">
            Output includes: total monthly savings potential, annual savings potential, and a prioritised action list.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            ردیاب پول پنهان هزینه‌ها، بدهی‌ها و موجودی نقدی شما را برای شناسایی نشت مالی قابل اجتناب اسکن می‌کند.
            اشتراک‌ها، رستوران‌ها، بدهی‌های پرسود، پول راکد، و هزینه‌های غیرعادی را شناسایی می‌کند.
          </PTag>
          <Formula>امتیاز سلامت مالی = ۱۰۰ − (نشت ماهانه / هزینه‌های ماهانه × ۱۰۰)</Formula>
        </div>
      ),
    },
  },

  // 26. AI Financial Coach
  {
    id: "ai-coach",
    icon: <Brain className="w-4 h-4" />,
    color: "hsl(270,60%,60%)",
    title: { en: "AI Financial Coach", fa: "مربی مالی هوش مصنوعی" },
    keywords: {
      en: "AI financial coach GPT report weekly monthly insights cashflow savings investment advice coach",
      fa: "مربی مالی هوش مصنوعی گزارش هفتگی ماهانه بینش جریان نقدی پس‌انداز سرمایه‌گذاری",
    },
    content: {
      en: (
        <div>
          <PTag>
            The AI Financial Coach generates personalised weekly and monthly financial reports
            using GPT-4o mini.
          </PTag>
          <H3>Report Types</H3>
          <UL items={[
            <><strong className="text-foreground">Weekly Report</strong> — Summarises spending movement, cashflow status, savings rate, and top 3 actions for the week.</>,
            <><strong className="text-foreground">Monthly Report</strong> — Deeper analysis including investment progress, debt movement, property readiness, risk warnings, and recommended actions for next month.</>,
          ]} />
          <H3>Example Insight</H3>
          <Callout type="info">
            "This month spending rose 14%. Cashflow is healthy at $7,460 surplus. Consider directing the extra $1,200 to your emergency fund."
          </Callout>
          <H3>Cost &amp; Caching</H3>
          <UL items={[
            "~$0.001 per report",
            "Results cached for 24 hours",
          ]} />
          <Callout type="warning">
            AI insights are general information only and not financial advice.
          </Callout>
        </div>
      ),
      fa: (
        <div>
          <PTag>
            مربی مالی هوش مصنوعی با استفاده از GPT-4o mini گزارش‌های مالی هفتگی و ماهانه شخصی‌سازی‌شده تولید می‌کند.
          </PTag>
          <UL items={[
            "گزارش هفتگی: خلاصه تغییرات هزینه، وضعیت جریان نقدی، نرخ پس‌انداز و ۳ اقدام برتر هفته",
            "گزارش ماهانه: تحلیل عمیق‌تر پیشرفت سرمایه‌گذاری، بدهی، آمادگی ملک، هشدارهای ریسک",
          ]} />
          <Callout type="warning">
            بینش‌های هوش مصنوعی اطلاعات عمومی است و مشاوره مالی نیست.
          </Callout>
        </div>
      ),
    },
  },
];

// ─── Accordion Item ───────────────────────────────────────────────────────────

function AccordionItem({
  section,
  lang,
  isOpen,
  onToggle,
}: {
  section: SectionDef;
  lang: Lang;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      id={section.id}
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid hsl(224,12%,20%)", background: "hsl(224,15%,11%)" }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            style={{ background: `${section.color}22`, color: section.color }}
          >
            {section.icon}
          </span>
          <span
            className="font-semibold text-sm text-foreground"
            style={lang === "fa" ? { fontFamily: "'Vazirmatn', 'Tahoma', sans-serif" } : {}}
          >
            {section.title[lang]}
          </span>
        </div>
        <span className="text-muted-foreground shrink-0">
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>
      </button>

      {/* Collapsible body */}
      <div
        ref={contentRef}
        style={{
          maxHeight: isOpen ? `${contentRef.current?.scrollHeight ?? 2000}px` : "0px",
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
      >
        <div
          className="px-5 pb-5 pt-1"
          style={
            lang === "fa"
              ? { fontFamily: "'Vazirmatn', 'Tahoma', sans-serif" }
              : {}
          }
        >
          {section.content[lang]}
        </div>
      </div>
    </div>
  );
}

// ─── Quick Nav Card ───────────────────────────────────────────────────────────

function NavCard({
  section,
  lang,
  onClick,
}: {
  section: SectionDef;
  lang: Lang;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-xl text-center hover:bg-white/5 transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: "hsl(224,15%,11%)",
        border: "1px solid hsl(224,12%,20%)",
      }}
    >
      <span
        className="flex items-center justify-center w-9 h-9 rounded-lg"
        style={{ background: `${section.color}22`, color: section.color }}
      >
        {section.icon}
      </span>
      <span
        className="text-xs font-medium text-muted-foreground leading-tight"
        style={lang === "fa" ? { fontFamily: "'Vazirmatn', 'Tahoma', sans-serif" } : {}}
      >
        {section.title[lang]}
      </span>
    </button>
  );
}

// ─── Main Help Page ───────────────────────────────────────────────────────────

export default function HelpPage() {
  // Language state — persisted in localStorage
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("sf_help_lang") as Lang) || "en"
  );

  // Accordion state — which sections are open
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  // Search query
  const [query, setQuery] = useState("");

  // Switch language
  const switchLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem("sf_help_lang", l);
  };

  // Filtered sections based on search
  const filteredSections = useMemo(() => {
    if (!query.trim()) return SECTIONS;
    const q = query.toLowerCase();
    return SECTIONS.filter(
      (s) =>
        s.title.en.toLowerCase().includes(q) ||
        s.title.fa.toLowerCase().includes(q) ||
        s.keywords.en.toLowerCase().includes(q) ||
        s.keywords.fa.toLowerCase().includes(q)
    );
  }, [query]);

  // Toggle an accordion section
  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Scroll to section and open it
  const scrollToSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Brief delay to allow DOM to update before scrolling
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
  };

  const isRtl = lang === "fa";
  const fa = (str: string) => (
    <span style={{ fontFamily: "'Vazirmatn', 'Tahoma', sans-serif" }}>{str}</span>
  );

  return (
    <div
      className="min-h-screen"
      dir={isRtl ? "rtl" : "ltr"}
      style={{ background: "hsl(224,15%,8%)" }}
    >
      {/* ── Sticky Top Bar ────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-40 backdrop-blur-md"
        style={{
          background: "hsl(224,15%,8%,0.92)",
          borderBottom: "1px solid hsl(224,12%,20%)",
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col gap-3">
          {/* Title row + Language switcher */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-5 h-5" style={{ color: "hsl(43,85%,55%)" }} />
              <h1 className="text-lg font-bold text-foreground">
                {lang === "en" ? "Help & Documentation" : fa("راهنما و مستندات")}
              </h1>
            </div>

            {/* Language switcher pills */}
            <div
              className="flex items-center rounded-lg p-0.5 gap-0.5"
              style={{ background: "hsl(224,15%,14%)", border: "1px solid hsl(224,12%,22%)" }}
              role="group"
              aria-label="Language selector"
            >
              <button
                onClick={() => switchLang("en")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all"
                style={
                  lang === "en"
                    ? {
                        background: "hsl(43,85%,55%)",
                        color: "hsl(224,15%,8%)",
                        fontWeight: 700,
                      }
                    : {
                        color: "hsl(220,10%,55%)",
                        fontWeight: 500,
                      }
                }
                aria-pressed={lang === "en"}
              >
                <Globe className="w-3.5 h-3.5" />
                English
              </button>
              <button
                onClick={() => switchLang("fa")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all"
                style={
                  lang === "fa"
                    ? {
                        background: "hsl(43,85%,55%)",
                        color: "hsl(224,15%,8%)",
                        fontWeight: 700,
                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                      }
                    : {
                        color: "hsl(220,10%,55%)",
                        fontWeight: 500,
                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                      }
                }
                aria-pressed={lang === "fa"}
              >
                <Languages className="w-3.5 h-3.5" />
                فارسی
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
              style={isRtl ? { right: "12px" } : { left: "12px" }}
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                lang === "en"
                  ? "Search sections, formulas, topics…"
                  : "جستجوی بخش‌ها، فرمول‌ها، موضوعات…"
              }
              className="text-sm h-9"
              style={
                isRtl
                  ? {
                      paddingRight: "36px",
                      paddingLeft: "12px",
                      fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                    }
                  : { paddingLeft: "36px" }
              }
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs"
                style={isRtl ? { left: "10px" } : { right: "10px" }}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">

        {/* Quick Nav Grid — only show when not searching */}
        {!query.trim() && (
          <section>
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "hsl(43,85%,55%)" }}
            >
              {lang === "en" ? "Quick Navigation" : fa("ناوبری سریع")}
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {SECTIONS.map((s) => (
                <NavCard
                  key={s.id}
                  section={s}
                  lang={lang}
                  onClick={() => scrollToSection(s.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Search result count */}
        {query.trim() && (
          <p className="text-xs text-muted-foreground">
            {lang === "en"
              ? `${filteredSections.length} section${filteredSections.length !== 1 ? "s" : ""} match "${query}"`
              : fa(`${filteredSections.length} بخش منطبق با "${query}"`)}
          </p>
        )}

        {/* Accordion Sections */}
        {filteredSections.length > 0 ? (
          <div className="space-y-3">
            {filteredSections.map((section) => (
              <AccordionItem
                key={section.id}
                section={section}
                lang={lang}
                isOpen={openSections.has(section.id)}
                onToggle={() => toggleSection(section.id)}
              />
            ))}
          </div>
        ) : (
          <div
            className="text-center py-16 rounded-xl"
            style={{
              background: "hsl(224,15%,11%)",
              border: "1px solid hsl(224,12%,20%)",
            }}
          >
            <HelpCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">
              {lang === "en"
                ? `No sections found for "${query}"`
                : fa(`هیچ بخشی برای "${query}" یافت نشد`)}
            </p>
            <button
              onClick={() => setQuery("")}
              className="mt-3 text-xs underline underline-offset-2"
              style={{ color: "hsl(43,85%,55%)" }}
            >
              {lang === "en" ? "Clear search" : fa("پاک کردن جستجو")}
            </button>
          </div>
        )}

        {/* Footer note */}
        <div
          className="text-center py-6 text-xs text-muted-foreground rounded-xl"
          style={{
            background: "hsl(224,15%,10%)",
            border: "1px solid hsl(224,12%,18%)",
          }}
        >
          {lang === "en" ? (
            <>
              Shahrokh Family Financial Planner — built with React + Vite + Supabase.
              <br />
              <span style={{ color: "hsl(43,85%,55%)" }}>familywealthlab.net</span>
            </>
          ) : (
            <span style={{ fontFamily: "'Vazirmatn', 'Tahoma', sans-serif" }}>
              برنامه برنامه‌ریزی مالی خانواده شاهرخ — ساخته‌شده با React + Vite + Supabase
              <br />
              <span style={{ color: "hsl(43,85%,55%)" }}>familywealthlab.net</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
