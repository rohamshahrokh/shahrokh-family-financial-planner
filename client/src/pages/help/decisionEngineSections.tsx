/**
 * decisionEngineSections.tsx — Help-Center content for the Decision Engine.
 *
 * #FWL_HELP_CENTER_OVERHAUL · bilingual (English + Persian / Farsi)
 *
 * This module exports a single `decisionEngineSections` array of SectionDef
 * entries that get spliced into the main help.tsx SECTIONS array. It uses
 * the same primitives (PTag, H3, UL, Callout, Formula, Table) so layout,
 * RTL handling, and search behaviour are identical to existing sections.
 *
 * Persian copy is written for Iranian-Australian readers — natural finance
 * vocabulary, not literal/robotic translation.
 */

import {
  Brain, Target, Layers, Scale, Sliders, ShieldAlert,
  Sigma, LineChart, BookOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  PTag, H3, H4, UL, Callout, Formula, Table, Anchor, MetricCard,
  BeginnerAdvanced,
} from "./helpPrimitives";
import {
  METRIC_LABELS, LENS_LABELS, ASSUMPTION_LABELS, RISK_MODE_LABELS,
} from "@/lib/decisionEngineLabels";

// SectionDef is re-declared here to avoid a circular import from help.tsx.
// The shape is identical to the one in help.tsx and intentionally so.
export interface SectionDef {
  id: string;
  icon: ReactNode;
  color: string;
  title: { en: string; fa: string };
  content: { en: ReactNode; fa: ReactNode };
  keywords: { en: string; fa: string };
}

// Palette for the Decision Engine group (re-using the app's tones).
const C_OVERVIEW   = "hsl(199, 89%, 48%)"; // info / sky
const C_LOGIC      = "hsl(43, 85%, 55%)";  // brand / gold
const C_ASSUMPTION = "hsl(265, 70%, 64%)"; // violet
const C_RISK       = "hsl(0, 75%, 60%)";   // rose
const C_FORMULAS   = "hsl(165, 65%, 45%)"; // teal
const C_CHARTS     = "hsl(35, 90%, 60%)";  // amber
const C_GLOSSARY   = "hsl(280, 65%, 62%)"; // soft purple

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 · Decision Engine Overview
// ─────────────────────────────────────────────────────────────────────────────

const overview: SectionDef = {
  id: "de-overview",
  icon: <Brain className="w-4 h-4" />,
  color: C_OVERVIEW,
  title: { en: "Decision Engine · Overview", fa: "موتور تصمیم‌گیری · کلیات" },
  keywords: {
    en: "decision engine overview recommendation simple advanced analysis what does",
    fa: "موتور تصمیم گیری مرور کلی توصیه ساده پیشرفته تحلیل",
  },
  content: {
    en: (
      <div>
        <PTag>
          The Decision Engine helps you answer one question: <strong className="text-foreground">
          "Of the realistic options I'm considering, which one balances growth, risk, and cash safety
          best for my household?"</strong>
        </PTag>
        <H3>What it does</H3>
        <UL items={[
          <>Takes the strategies you're comparing (e.g. buy property A vs property B, invest more in stocks, pay down debt) and runs each through the same financial model.</>,
          <>Stress-tests every strategy across thousands of plausible futures using Monte Carlo simulation.</>,
          <>Scores each strategy on growth, downside protection, cashflow safety, and retirement timing.</>,
          <>Surfaces the winner under three different lenses — best overall, highest long-term growth, and cashflow-safe.</>,
        ]} />
        <H3>What problems it solves</H3>
        <UL items={[
          <>Decision paralysis — turns "I have five options" into a ranked, justified shortlist.</>,
          <>Tunnel vision — forces every option to be tested against bad markets, rate shocks, and tax changes.</>,
          <>Hidden risk — a strategy that looks great on average can hide a 1-in-20 wipe-out. The engine surfaces these tails.</>,
          <>Lens bias — what's "best" depends on your goals; the engine shows you the winner from multiple angles.</>,
        ]} />
        <H3>How a recommendation is generated</H3>
        <UL items={[
          <><strong className="text-foreground">1 · Model.</strong> Each strategy is projected year-by-year with your real income, expenses, properties, debt, and tax settings.</>,
          <><strong className="text-foreground">2 · Stress.</strong> Monte Carlo re-runs the projection across many random market/income/rate paths.</>,
          <><strong className="text-foreground">3 · Score.</strong> Each path produces metrics — wealth, survival, tail losses, FIRE timing, drawdown. These roll up into a single composite score per lens.</>,
          <><strong className="text-foreground">4 · Rank.</strong> The highest-scoring strategy under each lens is the winner for that lens.</>,
          <><strong className="text-foreground">5 · Explain.</strong> The result card shows the score waterfall — what helped, what hurt, and by how much.</>,
        ]} />
        <Callout type="tip">
          Look at all three lenses before deciding. If the same strategy wins under all three, you have high conviction. If lenses disagree, the explanation tells you the trade-off you're making.
        </Callout>
        <Callout type="info">
          This is modelling only and not personal tax advice. The engine is a thinking tool — final decisions should consider your full personal context and, where relevant, professional advice.
        </Callout>
      </div>
    ),
    fa: (
      <div>
        <PTag>
          موتور تصمیم‌گیری به یک پرسش پاسخ می‌دهد: <strong className="text-foreground">
          «از میان گزینه‌های واقعی پیش روی من، کدام یک بهترین تعادل میان رشد، ریسک، و امنیت نقدینگی را برای خانواده‌ام دارد؟»</strong>
        </PTag>
        <H3>چه می‌کند؟</H3>
        <UL items={[
          <>گزینه‌هایی که در حال مقایسه‌اید (مثلاً خرید ملک A در برابر B، سرمایه‌گذاری بیشتر در سهام، یا تسویه بدهی) را در یک مدل مالی یکسان اجرا می‌کند.</>,
          <>هر گزینه را با شبیه‌سازی مونت‌کارلو در هزاران آینده محتمل به آزمون استرس می‌گذارد.</>,
          <>هر گزینه را بر اساس رشد، حفاظت در برابر زیان، امنیت نقدینگی، و زمان‌بندی استقلال مالی امتیازدهی می‌کند.</>,
          <>برنده را از سه زاویه نمایش می‌دهد: بهترین تعادل کلی، بیشترین رشد بلندمدت، و کم‌ریسک‌ترین از نظر نقدینگی.</>,
        ]} />
        <H3>چه مشکلاتی را حل می‌کند؟</H3>
        <UL items={[
          <>فلج تصمیم‌گیری — «من پنج گزینه دارم» را به یک فهرست کوتاه و رتبه‌بندی‌شده تبدیل می‌کند.</>,
          <>دید تک‌بُعدی — هر گزینه را در برابر بازارهای بد، شوک نرخ بهره و تغییرات مالیاتی می‌سنجد.</>,
          <>ریسک پنهان — استراتژی‌ای که به‌طور میانگین خوب به نظر می‌رسد ممکن است در ۵٪ سناریوهای بد ضرر سنگینی داشته باشد. این موارد آشکار می‌شود.</>,
          <>سوگیری زاویه دید — «بهترین» بسته به هدف شما متفاوت است؛ موتور برنده را از زوایای مختلف نشان می‌دهد.</>,
        ]} />
        <H3>توصیه چگونه ساخته می‌شود؟</H3>
        <UL items={[
          <><strong className="text-foreground">۱ · مدل‌سازی.</strong> هر گزینه با درآمد، هزینه، املاک، بدهی و تنظیمات مالیاتی واقعی شما سال‌به‌سال پیش‌بینی می‌شود.</>,
          <><strong className="text-foreground">۲ · استرس.</strong> مونت‌کارلو همان پیش‌بینی را در مسیرهای تصادفی مختلف بازار، درآمد و نرخ‌ها تکرار می‌کند.</>,
          <><strong className="text-foreground">۳ · امتیازدهی.</strong> هر مسیر معیارهایی تولید می‌کند — ثروت، احتمال بقا، زیان دنباله، زمان استقلال مالی، افت سرمایه — که در یک امتیاز ترکیبی برای هر زاویه دید جمع می‌شوند.</>,
          <><strong className="text-foreground">۴ · رتبه‌بندی.</strong> بالاترین امتیاز در هر زاویه، برنده آن زاویه است.</>,
          <><strong className="text-foreground">۵ · توضیح.</strong> کارت نتیجه با نمودار آبشاری نشان می‌دهد چه چیزی به امتیاز کمک کرده و چه چیزی از آن کاسته است.</>,
        ]} />
        <Callout type="tip">
          قبل از تصمیم به هر سه زاویه نگاه کنید. اگر یک گزینه در هر سه برنده باشد، یعنی تصمیم با اطمینان بالا. اگر زوایای دید با هم اختلاف داشته باشند، توضیح به شما می‌گوید چه چیزی را قربانی چه چیزی می‌کنید.
        </Callout>
        <Callout type="info">
          این فقط مدل‌سازی است و توصیه مالیاتی شخصی محسوب نمی‌شود. موتور یک ابزار تفکر است؛ تصمیم نهایی باید با در نظر گرفتن شرایط کامل شخصی و در صورت لزوم مشاوره حرفه‌ای گرفته شود.
        </Callout>
      </div>
    ),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 · Simple Mode vs Advanced Analysis
// ─────────────────────────────────────────────────────────────────────────────

const simpleVsAdvanced: SectionDef = {
  id: "de-simple-vs-advanced",
  icon: <Layers className="w-4 h-4" />,
  color: C_OVERVIEW,
  title: { en: "Simple Mode vs Advanced Analysis", fa: "حالت ساده در برابر تحلیل پیشرفته" },
  keywords: {
    en: "simple mode advanced analysis monte carlo deterministic which to use difference",
    fa: "حالت ساده پیشرفته تحلیل مونت کارلو قطعی تفاوت",
  },
  content: {
    en: (
      <div>
        <PTag>The engine ships with two modes. They use the same inputs and the same financial model — they differ in <em>how much uncertainty</em> they account for.</PTag>
        <H3>Simple Mode</H3>
        <UL items={[
          <>Runs each strategy through a single, central projection — your "expected" path.</>,
          <>Fast. Good for first-pass comparisons and quick sensitivity checks.</>,
          <>Uses central-case returns, inflation, and rates — no randomness.</>,
          <>Shows: terminal wealth, FIRE age, surplus profile, basic ranking.</>,
        ]} />
        <H3>Advanced Analysis</H3>
        <UL items={[
          <>Runs each strategy through <strong className="text-foreground">many</strong> randomised paths (Monte Carlo).</>,
          <>Slower, but reveals the spread of outcomes — not just the average.</>,
          <>Adds: percentiles (P10/P50/P90), survival probability, VaR/CVaR, drawdown, tail-risk profile.</>,
          <>Necessary whenever the decision hinges on downside risk or cash safety.</>,
        ]} />
        <H3>Which one should I use?</H3>
        <Table rows={[
          ["First look", "Simple Mode"],
          ["Comparing close options", "Advanced — Simple may not separate them"],
          ["High-leverage strategies", "Advanced — tail risk matters"],
          ["Cashflow-tight households", "Advanced — survival probability matters"],
          ["Plain back-of-envelope check", "Simple"],
          ["Final decision", "Advanced + look at all three lenses"],
        ]} />
        <Callout type="tip">
          Simple Mode is honest about being an average. Don't make a leveraged decision on it alone — run Advanced first.
        </Callout>
      </div>
    ),
    fa: (
      <div>
        <PTag>موتور دو حالت دارد. هر دو از ورودی‌ها و مدل مالی یکسانی استفاده می‌کنند — تفاوت در <em>میزان عدم‌قطعیتی</em> است که در نظر می‌گیرند.</PTag>
        <H3>حالت ساده</H3>
        <UL items={[
          <>هر گزینه را در یک پیش‌بینی مرکزی واحد اجرا می‌کند — مسیر «انتظار رفته».</>,
          <>سریع. برای مقایسه اولیه و بررسی سریع حساسیت‌ها مناسب است.</>,
          <>از بازدهی، تورم و نرخ‌های مرکزی استفاده می‌کند — بدون تصادفی‌بودن.</>,
          <>نمایش: ثروت پایانی، سن استقلال مالی، نیمرخ مازاد، رتبه‌بندی پایه.</>,
        ]} />
        <H3>تحلیل پیشرفته</H3>
        <UL items={[
          <>هر گزینه را در <strong className="text-foreground">صدها/هزاران</strong> مسیر تصادفی اجرا می‌کند (مونت‌کارلو).</>,
          <>کندتر، اما پراکندگی نتایج را نشان می‌دهد، نه فقط میانگین را.</>,
          <>افزوده: صدک‌ها (P10/P50/P90)، احتمال بقا، VaR/CVaR، افت سرمایه، نیمرخ ریسک دنباله.</>,
          <>هرگاه تصمیم به ریسک نزولی یا امنیت نقدینگی بستگی داشته باشد، لازم است.</>,
        ]} />
        <H3>کدام را استفاده کنم؟</H3>
        <Table rows={[
          ["نگاه اول", "حالت ساده"],
          ["گزینه‌های نزدیک به هم", "پیشرفته — حالت ساده ممکن است تفکیک نکند"],
          ["استراتژی‌های پراهرم", "پیشرفته — ریسک دنباله مهم است"],
          ["خانواده‌های با نقدینگی محدود", "پیشرفته — احتمال بقا مهم است"],
          ["برآورد سرانگشتی", "حالت ساده"],
          ["تصمیم نهایی", "پیشرفته + بررسی هر سه زاویه"],
        ]} />
        <Callout type="tip">
          حالت ساده صراحتاً یک میانگین است. برای تصمیم پر‌اهرم به‌تنهایی به آن تکیه نکنید — ابتدا پیشرفته را اجرا کنید.
        </Callout>
      </div>
    ),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 · Recommendation Logic & Lenses
// ─────────────────────────────────────────────────────────────────────────────

const recommendationLogic: SectionDef = {
  id: "de-recommendation-logic",
  icon: <Target className="w-4 h-4" />,
  color: C_LOGIC,
  title: { en: "Recommendation Logic & Lenses", fa: "منطق توصیه و زوایای دید" },
  keywords: {
    en: "recommendation logic ranking lens balanced growth cashflow safe why win",
    fa: "منطق توصیه رتبه بندی زاویه دید متعادل رشد نقدینگی چرا برنده",
  },
  content: {
    en: (
      <div>
        <PTag>Each strategy receives three scores — one per lens. The highest score under each lens is that lens's winner.</PTag>

        <H3>The three lenses</H3>
        <H4 id="lens-balanced">1 · Best overall balance</H4>
        <PTag>
          This lens rewards strategies that score reasonably well across all four pillars at once: growth, downside protection, cashflow, and FIRE timing. It penalises any pillar that is weak. If you want one number to look at, this is it.
        </PTag>
        <H4 id="lens-growth">2 · Highest long-term growth</H4>
        <PTag>
          This lens weights long-term wealth (terminal net worth and risk-adjusted CAGR) much more heavily and accepts more short-term volatility. Use it if you have a long horizon and can stomach drawdowns.
        </PTag>
        <H4 id="lens-cashflow">3 · Safest monthly cashflow</H4>
        <PTag>
          This lens (formerly “Cashflow-safe”) prioritises survival probability, NSR, liquidity factor, and low refinance pressure. Long-term growth still matters but is dialled down. Use it if a missed mortgage payment would be a real problem.
        </PTag>
        <H4 id="lens-high-risk">4 · Highest growth (high risk)</H4>
        <PTag>
          An optional fourth lens that surfaces only when Risk Control is set to “Show me everything.” It accepts wider concentration and LVR limits in exchange for the highest possible growth ceiling. Treat its winner as the engine’s “if you really want to push it” answer — not a recommendation.
        </PTag>

        <H3>What affects rankings</H3>
        <UL items={[
          <><Anchor href="/help?topic=de-risk-metrics#tnw">Terminal net worth</Anchor> — wealth at the end of the horizon (P50 and P10).</>,
          <><Anchor href="/help?topic=de-risk-metrics#rac">Risk-adjusted CAGR</Anchor> — growth rate scaled by volatility, so steady wins beat jumpy wins.</>,
          <><Anchor href="/help?topic=de-risk-metrics#survival">Survival probability</Anchor> — probability you never run out of cash.</>,
          <><Anchor href="/help?topic=de-risk-metrics#nsr">NSR</Anchor> — net surplus ratio: how much cushion you have after debt service.</>,
          <><Anchor href="/help?topic=de-risk-metrics#cvar">CVaR</Anchor> and <Anchor href="/help?topic=de-risk-metrics#drawdown">drawdown</Anchor> — how bad the bad scenarios get.</>,
          <><Anchor href="/help?topic=de-risk-metrics#fire-accel">FIRE acceleration</Anchor> — whether the strategy pulls retirement closer or pushes it out.</>,
          <><Anchor href="/help?topic=de-risk-metrics#refi">Refinance pressure</Anchor> and <Anchor href="/help?topic=de-risk-metrics#liquidity">liquidity factor</Anchor> — short-term resilience.</>,
        ]} />

        <H3>Why different lenses can pick different winners</H3>
        <UL items={[
          <>A high-leverage property might be #1 on growth but #4 on cashflow-safe — the same data, two valid views.</>,
          <>Paying down a mortgage might win cashflow-safe but lose to investing on growth — opportunity cost of safety.</>,
          <>A diversified ETF tilt often wins overall balance but rarely wins growth outright — it's a smoothness premium.</>,
        ]} />
        <Callout type="tip">
          When lenses disagree, the right answer depends on your situation, not the engine. Use the score waterfall to see <em>why</em> each lens preferred what it did.
        </Callout>

        <H3>"Best overall balance" — what that means precisely</H3>
        <PTag>
          A weighted blend of: terminal net worth (~30%), risk-adjusted CAGR (~20%), survival probability (~15%), CVaR penalty (~10%), NSR (~10%), FIRE acceleration (~10%), liquidity factor (~5%). Weights are documented in detail in the <Anchor href="/help?topic=de-formulas#weights">formulas section</Anchor>.
        </PTag>

        <Callout type="info">
          A winning strategy isn't the same as a guaranteed outcome. It's the option that performs best on average across many futures — a worse path is still possible.
        </Callout>
      </div>
    ),
    fa: (
      <div>
        <PTag>هر استراتژی سه امتیاز دریافت می‌کند — یکی برای هر زاویه دید. بالاترین امتیاز هر زاویه، برنده آن است.</PTag>

        <H3>سه زاویه دید</H3>
        <H4 id="lens-balanced-fa">۱ · بهترین تعادل کلی</H4>
        <PTag>
          این زاویه به استراتژی‌هایی پاداش می‌دهد که در هر چهار ستون به‌طور همزمان نمره معقول می‌گیرند: رشد، حفاظت در برابر زیان، نقدینگی، و زمان‌بندی استقلال مالی. هر ستون ضعیف جریمه می‌شود. اگر یک عدد می‌خواهید نگاه کنید، همین است.
        </PTag>
        <H4 id="lens-growth-fa">۲ · بیشترین رشد بلندمدت</H4>
        <PTag>
          این زاویه ثروت بلندمدت (ارزش خالص پایانی و CAGR تعدیل‌شده با ریسک) را بسیار سنگین‌تر وزن می‌دهد و نوسان کوتاه‌مدت بیشتری را می‌پذیرد. اگر افق بلند دارید و توان تحمل افت سرمایه را دارید، مناسب است.
        </PTag>
        <H4 id="lens-cashflow-fa">۳ · امن‌ترین جریان نقدی ماهانه</H4>
        <PTag>
          این زاویه (پیش‌تر به نام «امن از نظر نقدینگی») احتمال بقا، NSR، عامل نقدینگی و فشار کم بازپرداخت را در اولویت می‌گذارد. رشد بلندمدت هنوز اهمیت دارد ولی کم‌رنگ‌تر است. اگر پرداخت‌نشدن یک قسط وام برایتان مسئله جدی است، این زاویه را انتخاب کنید.
        </PTag>
        <H4 id="lens-high-risk-fa">۴ · بیشترین رشد (ریسک بالا)</H4>
        <PTag>
          یک زاویه چهارم اختیاری که تنها در حالت «همه‌چیز را نشان بده» ظاهر می‌شود. سقف تمرکز و LVR بالاتری را پذیراست تا در عوض بالاترین سقف رشد ممکن را بدهد. برنده آن را جواب موتور به «اگر واقعاً بخواهید پارا را تا ته فشار دهید» در نظر بگیرید — نه یک توصیه.
        </PTag>

        <H3>چه چیزهایی روی رتبه‌بندی اثر می‌گذارد</H3>
        <UL items={[
          <><Anchor href="/help?topic=de-risk-metrics#tnw">ارزش خالص پایانی</Anchor> — ثروت در پایان افق (P50 و P10).</>,
          <><Anchor href="/help?topic=de-risk-metrics#rac">CAGR تعدیل‌شده با ریسک</Anchor> — رشد تعدیل‌شده با نوسان؛ رشد یکنواخت بر رشد جهشی برتری می‌گیرد.</>,
          <><Anchor href="/help?topic=de-risk-metrics#survival">احتمال بقا</Anchor> — احتمال اینکه هرگز پول کم نیاورید.</>,
          <><Anchor href="/help?topic=de-risk-metrics#nsr">NSR</Anchor> — نسبت مازاد خالص: حاشیه نقدی پس از خدمت بدهی.</>,
          <><Anchor href="/help?topic=de-risk-metrics#cvar">CVaR</Anchor> و <Anchor href="/help?topic=de-risk-metrics#drawdown">افت سرمایه</Anchor> — وضعیت در سناریوهای بد.</>,
          <><Anchor href="/help?topic=de-risk-metrics#fire-accel">شتاب استقلال مالی</Anchor> — آیا استراتژی بازنشستگی را جلو می‌اندازد یا عقب.</>,
          <><Anchor href="/help?topic=de-risk-metrics#refi">فشار بازپرداخت</Anchor> و <Anchor href="/help?topic=de-risk-metrics#liquidity">عامل نقدینگی</Anchor> — تاب‌آوری کوتاه‌مدت.</>,
        ]} />

        <H3>چرا زوایای دید می‌توانند برندگان متفاوت انتخاب کنند</H3>
        <UL items={[
          <>یک ملک پر‌اهرم می‌تواند در رشد رتبه ۱ و در امن از نظر نقدینگی رتبه ۴ باشد — یک داده، دو نگاه معتبر.</>,
          <>تسویه وام مسکن ممکن است در امن‌نقدینگی برنده شود اما در رشد به سرمایه‌گذاری ببازد — هزینه فرصت امنیت.</>,
          <>تنوع‌بخشی به سبد ETF معمولاً تعادل کلی را می‌برد اما به‌ندرت در رشد مطلق برنده می‌شود — حق‌بیمه یکنواختی.</>,
        ]} />
        <Callout type="tip">
          وقتی زوایای دید با هم اختلاف دارند، پاسخ درست به شرایط شما بستگی دارد، نه به موتور. از نمودار آبشاری برای دیدن <em>دلیل</em> ترجیح هر زاویه استفاده کنید.
        </Callout>

        <H3>«بهترین تعادل کلی» دقیقاً یعنی چه</H3>
        <PTag>
          ترکیب وزنی از: ارزش خالص پایانی (~۳۰٪)، CAGR تعدیل‌شده با ریسک (~۲۰٪)، احتمال بقا (~۱۵٪)، جریمه CVaR (~۱۰٪)، NSR (~۱۰٪)، شتاب استقلال مالی (~۱۰٪)، عامل نقدینگی (~۵٪). جزئیات وزن‌ها در <Anchor href="/help?topic=de-formulas#weights">بخش فرمول‌ها</Anchor> آمده است.
        </PTag>

        <Callout type="info">
          استراتژی برنده یعنی نتیجه تضمین‌شده نیست. یعنی گزینه‌ای که به‌طور میانگین در آینده‌های مختلف بهتر عمل می‌کند — مسیر بد همچنان ممکن است.
        </Callout>
      </div>
    ),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 · Scenario Assumptions
// ─────────────────────────────────────────────────────────────────────────────

const scenarioAssumptions: SectionDef = {
  id: "de-assumptions",
  icon: <Sliders className="w-4 h-4" />,
  color: C_ASSUMPTION,
  title: { en: "Scenario Assumptions", fa: "فرضیات سناریو" },
  keywords: {
    en: "assumptions scenario smart auto detect current rules today proposed 2027 reform custom what if tax regime",
    fa: "فرضیات سناریو تشخیص خودکار قوانین امروز اصلاحات پیشنهادی ۲۰۲۷ سفارشی مالیات",
  },
  content: {
    en: (
      <div>
        <PTag>
          Every projection runs against a tax-policy assumption. The engine supports four. Switching between them lets you see how sensitive your plan is to policy.
        </PTag>

        <H3 id="auto-detect">Smart auto-detect</H3>
        <PTag>
          The engine looks at each property's <em>contract date</em>, <em>settlement date</em>, and <em>property type</em>, and chooses the rule set that would actually apply under current legislation plus announced reform timelines.
        </PTag>
        <UL items={[
          <>Established dwelling, contract before reform date → today's rules (grandfathered).</>,
          <>Established dwelling, contract after reform date → proposed 2027 reform.</>,
          <>New-build / build-to-rent / affordable housing → today's rules (carved out).</>,
          <>Missing dates or unclear → defaults to today's rules and flags for your confirmation.</>,
        ]} />
        <Callout type="tip">
          Use this as your default. It mirrors how the ATO would likely apply rules to each property, so the model stays honest about what's grandfathered and what isn't.
        </Callout>

        <H3 id="current-rules">Today's rules</H3>
        <PTag>
          Forces every property to be treated under existing (pre-reform) settings — full negative-gearing deductibility, 50% CGT discount, current depreciation rules. Use this as a baseline benchmark.
        </PTag>
        <Callout type="info">
          <strong>Example:</strong> An established investment property purchased in 2028. Under auto-detect it would be reform-affected. Under "today's rules" it's modelled as if 2027 reform never happened — useful to see the dollar value of grandfathering.
        </Callout>

        <H3 id="proposed-reform">Proposed 2027 reform</H3>
        <PTag>
          Forces every property to be treated under the announced reform — reduced CGT discount, restricted negative-gearing on established dwellings, carve-outs for new-build/BTR/affordable. Use this to see the worst plausible policy scenario.
        </PTag>
        <Callout type="warning">
          The reform is a published policy proposal, not legislation. Numbers here illustrate sensitivity, not certainty. Treat this as a stress case.
        </Callout>

        <H3 id="custom">Custom what-if</H3>
        <PTag>
          Lets you dial individual levers — remove negative gearing, change the CGT discount, add a rate shock, an inflation shock, or a rent-growth slowdown. Use this when you want to see "what if everything goes against me at once".
        </PTag>
        <UL items={[
          <><strong className="text-foreground">If negative gearing is removed</strong> — toggles off interest deductibility on investment properties.</>,
          <><strong className="text-foreground">CGT discount</strong> — slider from 0% to 50%. Lower = more tax on gains.</>,
          <><strong className="text-foreground">Mortgage rate stress</strong> — adds percentage points to your modelled mortgage rate (e.g. +1.5pp).</>,
          <><strong className="text-foreground">Inflation stress</strong> — adds to modelled CPI, pushing up expenses.</>,
          <><strong className="text-foreground">Rent growth slowdown</strong> — reduces modelled annual rent growth.</>,
        ]} />
        <Callout type="tip">
          The most informative scenario is usually <em>auto-detect</em> for the baseline + <em>custom what-if</em> with a moderate stress combo. Compare the two — that delta is your reform/rate-shock exposure.
        </Callout>
      </div>
    ),
    fa: (
      <div>
        <PTag>
          هر پیش‌بینی بر اساس یک فرض سیاست مالیاتی اجرا می‌شود. موتور چهار حالت پشتیبانی می‌کند. سوئیچ بین آنها نشان می‌دهد برنامه شما تا چه حد به سیاست حساس است.
        </PTag>

        <H3 id="auto-detect-fa">تشخیص خودکار هوشمند</H3>
        <PTag>
          موتور <em>تاریخ قرارداد</em>، <em>تاریخ نقل و انتقال</em>، و <em>نوع ملک</em> هر ملک را بررسی می‌کند و مجموعه قواعدی را انتخاب می‌کند که در عمل تحت قانون فعلی به‌علاوه جدول زمانی اصلاحات اعلام‌شده اعمال می‌شود.
        </PTag>
        <UL items={[
          <>ملک قدیمی، قرارداد قبل از تاریخ اصلاحات → قوانین امروز (مشمول حقوق مکتسبه).</>,
          <>ملک قدیمی، قرارداد بعد از تاریخ اصلاحات → اصلاحات پیشنهادی ۲۰۲۷.</>,
          <>ملک نوساز / اجاره نهادی / مسکن مقرون‌به‌صرفه → قوانین امروز (استثنا‌شده).</>,
          <>تاریخ نامشخص → پیش‌فرض قوانین امروز با نشانه‌گذاری برای تأیید شما.</>,
        ]} />
        <Callout type="tip">
          این را به‌عنوان پیش‌فرض استفاده کنید. آینه‌ای از نحوه احتمالی اعمال قوانین توسط ATO به هر ملک است، بنابراین مدل صادق نگه داشته می‌شود.
        </Callout>

        <H3 id="current-rules-fa">قوانین امروز</H3>
        <PTag>
          همه املاک را تحت قوانین فعلی (پیش از اصلاحات) مدل می‌کند — قابلیت کسر کامل بهره منفی، تخفیف ۵۰٪ مالیات بر عایدی سرمایه، قواعد فعلی استهلاک. به‌عنوان معیار پایه استفاده کنید.
        </PTag>
        <Callout type="info">
          <strong>مثال:</strong> یک ملک سرمایه‌گذاری قدیمی خریداری‌شده در ۲۰۲۸. در تشخیص خودکار مشمول اصلاحات می‌شود. در «قوانین امروز» چنان مدل می‌شود که گویی اصلاحات ۲۰۲۷ هرگز رخ نداده — برای دیدن ارزش دلاری حقوق مکتسبه مفید است.
        </Callout>

        <H3 id="proposed-reform-fa">اصلاحات پیشنهادی ۲۰۲۷</H3>
        <PTag>
          همه املاک را تحت اصلاحات اعلام‌شده مدل می‌کند — تخفیف کاهش‌یافته CGT، محدودیت بهره منفی روی املاک قدیمی، استثناها برای نوساز/BTR/مسکن مقرون‌به‌صرفه. برای دیدن بدترین سناریوی سیاستی محتمل.
        </PTag>
        <Callout type="warning">
          اصلاحات یک پیشنهاد سیاستی منتشرشده است، نه قانون. اعداد اینجا حساسیت را نشان می‌دهند نه قطعیت. آن را یک حالت استرس بدانید.
        </Callout>

        <H3 id="custom-fa">سفارشی چه‌می‌شود</H3>
        <PTag>
          امکان تنظیم اهرم‌های جداگانه — حذف بهره منفی، تغییر تخفیف CGT، شوک نرخ، شوک تورم، یا کندی رشد اجاره. برای زمانی که می‌خواهید ببینید «اگر همه چیز همزمان علیه من شد چه می‌شود».
        </PTag>
        <UL items={[
          <><strong className="text-foreground">حذف بهره منفی</strong> — قابلیت کسر بهره روی املاک سرمایه‌گذاری را خاموش می‌کند.</>,
          <><strong className="text-foreground">تخفیف CGT</strong> — نوار از ۰٪ تا ۵۰٪. کمتر = مالیات بیشتر بر سود.</>,
          <><strong className="text-foreground">شوک نرخ وام</strong> — درصد به نرخ مدل‌شده وام مسکن اضافه می‌کند (مثلاً +۱.۵ واحد درصد).</>,
          <><strong className="text-foreground">شوک تورم</strong> — به CPI مدل‌شده اضافه می‌کند و هزینه‌ها را بالا می‌برد.</>,
          <><strong className="text-foreground">کندی رشد اجاره</strong> — رشد سالانه اجاره مدل‌شده را کم می‌کند.</>,
        ]} />
        <Callout type="tip">
          آموزنده‌ترین سناریو معمولاً <em>تشخیص خودکار</em> به‌عنوان پایه + <em>سفارشی چه‌می‌شود</em> با ترکیبی متوسط از استرس است. مقایسه این دو — اختلاف، میزان مواجهه شما با اصلاحات/شوک نرخ است.
        </Callout>
      </div>
    ),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 · Risk Metrics Catalog
// ─────────────────────────────────────────────────────────────────────────────

const riskMetrics: SectionDef = {
  id: "de-risk-metrics",
  icon: <ShieldAlert className="w-4 h-4" />,
  color: C_RISK,
  title: { en: "Risk Metrics Explained", fa: "معیارهای ریسک به زبان ساده" },
  keywords: {
    en: "risk metrics survival probability var cvar nsr liquidity drawdown refinance insolvency fire acceleration risk adjusted cagr terminal net worth p50 p90 percentile",
    fa: "معیارهای ریسک احتمال بقا ارزش در معرض خطر CVaR نسبت مازاد نقدینگی افت سرمایه بازپرداخت ورشکستگی شتاب فایر CAGR ارزش خالص پایانی صدک",
  },
  content: {
    en: (
      <div>
        <PTag>The engine reports a dozen risk-and-outcome metrics. Each one captures a different angle of "how does this strategy actually behave?" Here's each in plain English.</PTag>

        <MetricCard anchor="survival" title="Survival probability">
          <p><strong>What it measures:</strong> The probability that, across all simulated futures, your household never runs out of cash before the end of the planning horizon.</p>
          <p><strong>Why it matters:</strong> A strategy with 70% survival means in 30% of futures you'd be forced to sell assets or default. That's the single most important number for a cashflow-tight household.</p>
          <p><strong>Good vs bad:</strong> {">"} 95% is excellent · 85–95% is acceptable · {"<"} 80% is a red flag for most households.</p>
          <p><strong>Example:</strong> Strategy A: 98% survival. Strategy B: 84% survival. Even if B has higher average wealth, A is materially safer.</p>
        </MetricCard>

        <MetricCard anchor="var" title="Value at Risk (VaR)">
          <p><strong>What it measures:</strong> The loss level you would not exceed in 95% (or 99%) of scenarios. "5% VaR of -$120k" means in the worst 5% of futures, your loss is at least $120k.</p>
          <p><strong>Why it matters:</strong> Turns "what could go wrong?" into a number. Lets you compare strategies on downside, not just average.</p>
          <p><strong>Good vs bad:</strong> A VaR that's a small fraction of your liquid assets is healthy. A VaR larger than your emergency buffer is a warning.</p>
          <p><strong>Example:</strong> 5% VaR of -$80k vs liquid savings of $60k → you can't absorb the bad case without selling something.</p>
        </MetricCard>

        <MetricCard anchor="cvar" title="Conditional VaR (CVaR / Expected Shortfall)">
          <p><strong>What it measures:</strong> The <em>average</em> loss in the worst 5% of scenarios. CVaR is always worse than VaR — it tells you "if the bad case happens, how bad is it on average?"</p>
          <p><strong>Why it matters:</strong> VaR can hide truly catastrophic tails. CVaR captures them. Highly leveraged strategies often have similar VaR but much worse CVaR.</p>
          <p><strong>Good vs bad:</strong> Compare CVaR across strategies, not in isolation. Lower (less negative) is better.</p>
          <p><strong>Example:</strong> A: 5% VaR -$60k, CVaR -$75k. B: 5% VaR -$60k, CVaR -$210k. B looks the same on VaR but its tail is three times worse.</p>
        </MetricCard>

        <MetricCard anchor="nsr" title="Net Surplus Ratio (NSR)">
          <p><strong>What it measures:</strong> Cash left after living expenses and debt service, as a fraction of income. NSR of 0.25 means 25% of income is free cash.</p>
          <p><strong>Why it matters:</strong> NSR is your shock absorber. Low NSR = you're one bad month from cashflow problems.</p>
          <p><strong>Good vs bad:</strong> {">"} 0.20 is comfortable · 0.10–0.20 is tight · {"<"} 0.10 is fragile.</p>
          <p><strong>Example:</strong> NSR drops below 0.10 by year 3 under a +1.5pp rate shock → that strategy is rate-sensitive.</p>
        </MetricCard>

        <MetricCard anchor="liquidity" title="Liquidity factor">
          <p><strong>What it measures:</strong> How much of your wealth could be turned into cash within ~30 days without forced-sale discounts. Index from 0 (everything illiquid) to 1 (everything cash).</p>
          <p><strong>Why it matters:</strong> Total wealth doesn't pay an electricity bill — cash does. A strategy that wins on terminal wealth but pushes liquidity below 0.1 is fragile.</p>
          <p><strong>Good vs bad:</strong> {">"} 0.3 is comfortable for most households · {"<"} 0.15 is a warning.</p>
        </MetricCard>

        <MetricCard anchor="drawdown" title="Drawdown">
          <p><strong>What it measures:</strong> The largest peak-to-trough drop in your wealth across the projection, expressed as a percentage of the peak.</p>
          <p><strong>Why it matters:</strong> Tells you the worst sustained loss you'd have to live through emotionally and financially.</p>
          <p><strong>Good vs bad:</strong> 10–20% drawdowns are normal for balanced plans. 40%+ is heavy leverage or concentration.</p>
          <p><strong>Example:</strong> Strategy A: max drawdown 18%. Strategy B: max drawdown 47%. Same end wealth — very different ride.</p>
        </MetricCard>

        <MetricCard anchor="refi" title="Refinance pressure">
          <p><strong>What it measures:</strong> How likely you'd be forced into refinancing (or fail a serviceability test) under stressed conditions in any given year.</p>
          <p><strong>Why it matters:</strong> Many "good" plans assume rates stay where they are. Refinance pressure shows what happens when they don't.</p>
          <p><strong>Good vs bad:</strong> Low / Moderate / High labels — anything above Moderate warrants attention.</p>
        </MetricCard>

        <MetricCard anchor="insolvency" title="Insolvency risk">
          <p><strong>What it measures:</strong> Probability that simulated net worth turns negative at any point — i.e. liabilities exceed assets.</p>
          <p><strong>Why it matters:</strong> The strict definition of bankruptcy in cash terms. A strategy with non-zero insolvency risk is taking on real catastrophe risk.</p>
          <p><strong>Good vs bad:</strong> Should be near 0% for any acceptable plan. {">"} 2% is a hard stop.</p>
        </MetricCard>

        <MetricCard anchor="fire-accel" title="FIRE acceleration">
          <p><strong>What it measures:</strong> How many years earlier (positive) or later (negative) you'd reach financial independence compared with your current baseline plan.</p>
          <p><strong>Why it matters:</strong> Converts wealth gains into something more tangible — time. A strategy that grows wealth but adds 3 years of work has a hidden cost.</p>
          <p><strong>Good vs bad:</strong> Positive = brings FIRE closer. Beware strategies that win on wealth but lose on FIRE timing — they're trading time for paper.</p>
          <p><strong>Example:</strong> Option A: +$200k wealth, FIRE -0.4 yrs. Option B: +$150k wealth, FIRE +1.2 yrs. B's net "life value" may be higher.</p>
        </MetricCard>

        <MetricCard anchor="rac" title="Risk-adjusted CAGR">
          <p><strong>What it measures:</strong> Your compound annual growth rate, divided by the volatility of your wealth path. Like a household-level Sharpe ratio.</p>
          <p><strong>Why it matters:</strong> Two strategies can both deliver 7% CAGR — one smoothly, one with 30% drawdowns along the way. Risk-adjusted CAGR rewards the smooth one.</p>
          <p><strong>Good vs bad:</strong> Higher is better. Use it to compare strategies, not as an absolute target.</p>
        </MetricCard>

        <MetricCard anchor="tnw" title="Terminal net worth">
          <p><strong>What it measures:</strong> Your projected net worth at the end of the planning horizon, reported at P10/P50/P90 in Monte Carlo mode.</p>
          <p><strong>Why it matters:</strong> The bottom line — what you actually end up with.</p>
          <p><strong>How to read:</strong> P50 is the median ("typical") outcome. P10 is "1-in-10 chance you do this badly or worse." P90 is the upside tail.</p>
        </MetricCard>

        <MetricCard anchor="percentiles" title="P50 / P90 (and friends)">
          <p><strong>What they mean:</strong> Percentiles of the distribution of outcomes across Monte Carlo paths.</p>
          <UL items={[
            <><strong>P10</strong> — 10% of futures end at or below this. Your conservative-case wealth.</>,
            <><strong>P50</strong> — the median. Half of futures land above, half below.</>,
            <><strong>P90</strong> — 90% of futures end at or below this. Your "good case" cap.</>,
          ]} />
          <p><strong>Why they matter:</strong> Averages hide the spread. Percentiles tell you "how wide is the cone of plausible outcomes?"</p>
          <p><strong>How to read:</strong> A narrow P10–P90 band is a predictable strategy; a wide one is a gamble — even if both have the same P50.</p>
        </MetricCard>

        <Callout type="info">
          You can jump straight to any of these from a metric tile in the Decision Engine — just tap the small "i" icon next to the number.
        </Callout>
      </div>
    ),
    fa: (
      <div>
        <PTag>موتور حدود دوازده معیار ریسک و نتیجه گزارش می‌کند. هر کدام یک زاویه از «این استراتژی واقعاً چطور رفتار می‌کند؟» را نشان می‌دهد. در ادامه به‌زبان ساده.</PTag>

        <MetricCard anchor="survival-fa" title="احتمال بقا">
          <p><strong>چه می‌سنجد:</strong> احتمال اینکه در همه آینده‌های شبیه‌سازی‌شده، خانواده شما تا پایان افق برنامه‌ریزی پول کم نیاورد.</p>
          <p><strong>چرا مهم است:</strong> ۷۰٪ بقا یعنی در ۳۰٪ آینده‌ها مجبور به فروش دارایی یا نکول می‌شوید. مهم‌ترین عدد برای خانواده‌های با نقدینگی محدود.</p>
          <p><strong>خوب در برابر بد:</strong> بیش از ۹۵٪ عالی · ۸۵–۹۵٪ قابل قبول · کمتر از ۸۰٪ هشدار جدی.</p>
          <p><strong>مثال:</strong> استراتژی A: ۹۸٪ بقا. استراتژی B: ۸۴٪ بقا. حتی اگر B ثروت میانگین بالاتری داشته باشد، A به‌مراتب امن‌تر است.</p>
        </MetricCard>

        <MetricCard anchor="var-fa" title="ارزش در معرض خطر (VaR)">
          <p><strong>چه می‌سنجد:</strong> سطح زیانی که در ۹۵٪ (یا ۹۹٪) سناریوها از آن فراتر نمی‌رود. «VaR ۵٪ معادل -۱۲۰هزار» یعنی در بدترین ۵٪ آینده‌ها، حداقل ۱۲۰هزار ضرر دارید.</p>
          <p><strong>چرا مهم است:</strong> «چه چیزی می‌تواند اشتباه شود؟» را به یک عدد تبدیل می‌کند.</p>
          <p><strong>خوب در برابر بد:</strong> VaR کوچک نسبت به دارایی‌های نقد، سالم است. VaR بزرگ‌تر از ذخیره اضطراری، هشدار.</p>
          <p><strong>مثال:</strong> VaR ۵٪ معادل -۸۰هزار در برابر پس‌انداز نقد ۶۰هزار → بدون فروش دارایی، حالت بد را تاب نمی‌آورید.</p>
        </MetricCard>

        <MetricCard anchor="cvar-fa" title="CVaR (ارزش در معرض خطر شرطی / کسری مورد انتظار)">
          <p><strong>چه می‌سنجد:</strong> زیان <em>میانگین</em> در بدترین ۵٪ سناریوها. CVaR همیشه بدتر از VaR است — می‌گوید «اگر حالت بد رخ دهد، به‌طور میانگین چقدر بد است؟»</p>
          <p><strong>چرا مهم است:</strong> VaR می‌تواند دنباله‌های فاجعه‌بار را پنهان کند. CVaR آنها را آشکار می‌کند. استراتژی‌های پر‌اهرم اغلب VaR مشابه اما CVaR بدتر دارند.</p>
          <p><strong>خوب در برابر بد:</strong> CVaR را بین استراتژی‌ها مقایسه کنید، نه به‌تنهایی. کمتر (کمتر منفی) بهتر است.</p>
        </MetricCard>

        <MetricCard anchor="nsr-fa" title="نسبت مازاد خالص (NSR)">
          <p><strong>چه می‌سنجد:</strong> پول باقی‌مانده پس از مخارج زندگی و خدمت بدهی، به‌عنوان کسری از درآمد. NSR برابر ۰.۲۵ یعنی ۲۵٪ درآمد پول آزاد است.</p>
          <p><strong>چرا مهم است:</strong> NSR ضربه‌گیر شماست. NSR پایین = یک ماه بد تا مشکل نقدینگی.</p>
          <p><strong>خوب در برابر بد:</strong> بیش از ۰.۲۰ راحت · ۰.۱۰–۰.۲۰ تنگ · کمتر از ۰.۱۰ شکننده.</p>
        </MetricCard>

        <MetricCard anchor="liquidity-fa" title="عامل نقدینگی">
          <p><strong>چه می‌سنجد:</strong> سهمی از ثروت شما که در حدود ۳۰ روز بدون تخفیف فروش اجباری به نقد تبدیل می‌شود. شاخص از ۰ (همه غیرنقد) تا ۱ (همه نقد).</p>
          <p><strong>چرا مهم است:</strong> ثروت کل، قبض برق را پرداخت نمی‌کند — نقد پرداخت می‌کند.</p>
          <p><strong>خوب در برابر بد:</strong> بیش از ۰.۳ برای اغلب خانواده‌ها راحت · کمتر از ۰.۱۵ هشدار.</p>
        </MetricCard>

        <MetricCard anchor="drawdown-fa" title="افت سرمایه">
          <p><strong>چه می‌سنجد:</strong> بزرگ‌ترین افت از قله تا گودال در مسیر ثروت، به‌صورت درصدی از قله.</p>
          <p><strong>چرا مهم است:</strong> بدترین زیان مستمر که باید عاطفی و مالی تاب بیاورید.</p>
          <p><strong>خوب در برابر بد:</strong> ۱۰–۲۰٪ برای برنامه‌های متعادل عادی است. ۴۰٪+ یعنی اهرم سنگین یا تمرکز بالا.</p>
        </MetricCard>

        <MetricCard anchor="refi-fa" title="فشار بازپرداخت/تمدید وام">
          <p><strong>چه می‌سنجد:</strong> احتمال اجبار به تمدید وام (یا رد شدن از معیار خدمت بدهی) تحت شرایط استرس در هر سال.</p>
          <p><strong>چرا مهم است:</strong> بسیاری از برنامه‌های «خوب» فرض می‌کنند نرخ‌ها ثابت می‌مانند. این معیار نشان می‌دهد اگر نمانند چه می‌شود.</p>
          <p><strong>خوب در برابر بد:</strong> برچسب‌های پایین/متوسط/بالا — هر چیز بالاتر از متوسط نیاز به توجه دارد.</p>
        </MetricCard>

        <MetricCard anchor="insolvency-fa" title="ریسک ورشکستگی">
          <p><strong>چه می‌سنجد:</strong> احتمال اینکه ارزش خالص شبیه‌سازی‌شده در هر نقطه‌ای منفی شود — یعنی بدهی‌ها از دارایی‌ها بیشتر شود.</p>
          <p><strong>چرا مهم است:</strong> تعریف دقیق ورشکستگی به‌زبان نقدی.</p>
          <p><strong>خوب در برابر بد:</strong> برای هر برنامه قابل قبول باید نزدیک به ۰٪ باشد. بیش از ۲٪ توقف کامل.</p>
        </MetricCard>

        <MetricCard anchor="fire-accel-fa" title="شتاب استقلال مالی (FIRE)">
          <p><strong>چه می‌سنجد:</strong> چند سال زودتر (مثبت) یا دیرتر (منفی) به استقلال مالی می‌رسید نسبت به برنامه پایه فعلی.</p>
          <p><strong>چرا مهم است:</strong> دستاوردهای ثروتی را به چیزی ملموس‌تر — زمان — تبدیل می‌کند.</p>
          <p><strong>خوب در برابر بد:</strong> مثبت = جلوآوردن FIRE. مراقب باشید استراتژی‌هایی که در ثروت برنده می‌شوند اما در زمان FIRE می‌بازند، در واقع زمان را با کاغذ معامله می‌کنند.</p>
          <p><strong>مثال:</strong> گزینه A: +۲۰۰هزار ثروت، FIRE -۰.۴ سال. گزینه B: +۱۵۰هزار ثروت، FIRE +۱.۲ سال. «ارزش زندگی» خالص B ممکن است بالاتر باشد.</p>
        </MetricCard>

        <MetricCard anchor="rac-fa" title="CAGR تعدیل‌شده با ریسک">
          <p><strong>چه می‌سنجد:</strong> نرخ رشد مرکب سالانه، تقسیم بر نوسان مسیر ثروت. مثل نسبت شارپ در سطح خانواده.</p>
          <p><strong>چرا مهم است:</strong> دو استراتژی می‌توانند ۷٪ CAGR بدهند — یکی نرم، یکی با افت ۳۰٪. CAGR تعدیل‌شده با ریسک به نرم پاداش می‌دهد.</p>
          <p><strong>خوب در برابر بد:</strong> بالاتر بهتر. برای مقایسه بین استراتژی‌ها استفاده کنید نه به‌عنوان هدف مطلق.</p>
        </MetricCard>

        <MetricCard anchor="tnw-fa" title="ارزش خالص پایانی">
          <p><strong>چه می‌سنجد:</strong> ارزش خالص پیش‌بینی‌شده در پایان افق برنامه‌ریزی، در حالت مونت‌کارلو به‌صورت P10/P50/P90 گزارش می‌شود.</p>
          <p><strong>چرا مهم است:</strong> خط پایان — چیزی که واقعاً به‌دست می‌آورید.</p>
          <p><strong>چگونه بخوانیم:</strong> P50 میانه («معمول») است. P10 یعنی «۱ از ۱۰ احتمال این بد یا بدتر». P90 دنباله مثبت.</p>
        </MetricCard>

        <MetricCard anchor="percentiles-fa" title="P50 / P90 (و خانواده‌اش)">
          <p><strong>چه یعنی:</strong> صدک‌های توزیع نتایج در مسیرهای مونت‌کارلو.</p>
          <UL items={[
            <><strong>P10</strong> — ۱۰٪ آینده‌ها در این مقدار یا کمتر تمام می‌شوند. ثروت در حالت محافظه‌کارانه.</>,
            <><strong>P50</strong> — میانه. نیمی از آینده‌ها بالاتر و نیمی پایین‌تر.</>,
            <><strong>P90</strong> — ۹۰٪ آینده‌ها در این مقدار یا کمتر تمام می‌شوند. سقف «حالت خوب».</>,
          ]} />
          <p><strong>چرا مهم است:</strong> میانگین‌ها پراکندگی را پنهان می‌کنند. صدک‌ها می‌گویند «چقدر پهنای نتایج محتمل است؟»</p>
          <p><strong>چگونه بخوانیم:</strong> فاصله باریک P10–P90 یعنی استراتژی قابل‌پیش‌بینی؛ فاصله پهن یعنی قمار — حتی با P50 یکسان.</p>
        </MetricCard>

        <Callout type="info">
          می‌توانید از هر کاشی معیار در موتور تصمیم‌گیری مستقیماً به این بخش جهش کنید — کافی است روی آیکن کوچک «i» کنار عدد بزنید.
        </Callout>
      </div>
    ),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 · Formulas & Calculation Logic
// ─────────────────────────────────────────────────────────────────────────────

const formulas: SectionDef = {
  id: "de-formulas",
  icon: <Sigma className="w-4 h-4" />,
  color: C_FORMULAS,
  title: { en: "Formulas & Calculation Logic", fa: "فرمول‌ها و منطق محاسبه" },
  keywords: {
    en: "formula calculation logic score risk penalty cashflow fire timing survival ranking weight monte carlo composite",
    fa: "فرمول محاسبه منطق امتیاز جریمه ریسک نقدینگی فایر بقا رتبه بندی وزن مونت کارلو ترکیبی",
  },
  content: {
    en: (
      <div>
        <PTag>
          The plain-English logic behind the engine. Variable names are intuitive, not literal code references.
        </PTag>

        <H3 id="scoring">Composite scoring</H3>
        <PTag>Each strategy's score under a given lens is a weighted blend of normalised pillars.</PTag>
        <Formula>Score(strategy, lens) = Σ over pillars p of [ weight(p, lens) × normalised(p) ]</Formula>
        <UL items={[
          <><strong>Pillars:</strong> terminal NW, risk-adjusted CAGR, survival, NSR, CVaR penalty, FIRE acceleration, liquidity.</>,
          <><strong>Normalised:</strong> each pillar is mapped to a 0–1 score relative to the best/worst across the candidate set — so scores are comparable.</>,
          <><strong>Weighted:</strong> each lens uses its own weight vector (see <Anchor href="/help?topic=de-formulas#weights">weights</Anchor>).</>,
          <><strong>Interpretation:</strong> a higher score is better; the gap to the next strategy tells you how decisive the win is.</>,
        ]} />
        <Callout type="tip">
          A win by 3 points out of 100 is a coin-flip in practice. A 12-point gap is a real preference.
        </Callout>

        <H3 id="weights">Ranking weights per lens</H3>
        <Table rows={[
          ["Pillar", "Balanced · Growth · Cashflow"],
          ["Terminal net worth (P50)", "30% · 45% · 15%"],
          ["Risk-adjusted CAGR", "20% · 25% · 10%"],
          ["Survival probability", "15% · 5% · 30%"],
          ["NSR (cash buffer)", "10% · 0% · 25%"],
          ["CVaR penalty", "10% · 10% · 10%"],
          ["FIRE acceleration", "10% · 10% · 5%"],
          ["Liquidity factor", "5% · 5% · 5%"],
        ]} />
        <Callout type="info">
          Exact weights are tuned over time and may drift slightly. Look at the score waterfall on each result card for the live weights used in your computation.
        </Callout>

        <H3 id="penalties">Risk penalties</H3>
        <PTag>Some metrics aren't just inputs to the score — they can subtract directly when they cross thresholds.</PTag>
        <Formula>RiskPenalty = max(0, threshold − Survival) × λ_survival<br/>           + max(0, |CVaR| − cvarCap) × λ_cvar<br/>           + max(0, drawdown − drawdownCap) × λ_dd</Formula>
        <UL items={[
          <>Survival below 90% triggers a survival penalty proportional to the gap.</>,
          <>CVaR worse than 1.5× your liquid buffer triggers a tail penalty.</>,
          <>Drawdown above 35% triggers a drawdown penalty.</>,
          <>Penalties never improve a score — they only reduce it. They act as a soft floor on risk hygiene.</>,
        ]} />

        <H3 id="cashflow">Cashflow model</H3>
        <Formula>NetCashFlow_y = Income_y − Expenses_y − DebtService_y + RentalNet_y + InvestmentYield_y − Tax_y</Formula>
        <UL items={[
          <><strong>Income</strong> grows by your wage-growth assumption.</>,
          <><strong>Expenses</strong> grow by CPI (with optional shock).</>,
          <><strong>Debt service</strong> uses the modelled mortgage rate; under custom what-if the rate shock adds directly here.</>,
          <><strong>Rental net</strong> = rent − costs − interest (or just rent − costs if negative gearing is removed).</>,
          <><strong>Investment yield</strong> = dividend + interest on cash, after-tax.</>,
          <><strong>Tax</strong> applies marginal brackets to taxable income, with regime-aware deductions.</>,
        ]} />
        <Callout type="tip">
          A useful sanity check: NetCashFlow_y should turn positive within ~3 years of any leveraged purchase, otherwise NSR will erode.
        </Callout>

        <H3 id="fire-timing">FIRE timing</H3>
        <Formula>FIRE age = smallest y where InvestableAssets_y × SWR ≥ TargetExpenses_y</Formula>
        <UL items={[
          <><strong>InvestableAssets</strong> excludes your primary residence by default (toggleable).</>,
          <><strong>SWR</strong> (safe withdrawal rate) defaults to 4% — adjustable in settings.</>,
          <><strong>TargetExpenses</strong> are CPI-adjusted to that year.</>,
          <><strong>FIRE acceleration</strong> = baselineFIREage − strategyFIREage. Positive = earlier.</>,
        ]} />

        <H3 id="survival-derivation">Survival probability — how it's derived</H3>
        <PTag>For each Monte Carlo path, we mark "failure" if at any year:</PTag>
        <UL items={[
          <>Cash balance goes below zero, OR</>,
          <>Net worth turns negative, OR</>,
          <>Mortgage serviceability fails for two consecutive years.</>,
        ]} />
        <Formula>Survival = 1 − (failing paths ÷ total paths)</Formula>
        <Callout type="info">
          Survival is path-dependent — it counts any failure along the way, not just at the end. A strategy can have great terminal wealth and still poor survival if it dips through bad years.
        </Callout>

        <H3 id="monte-carlo">Monte Carlo — how randomness enters</H3>
        <PTag>Each simulated path randomises:</PTag>
        <UL items={[
          <><strong>Equity returns</strong> — drawn from a distribution calibrated to historical AU/world equity returns with fat tails.</>,
          <><strong>Property returns</strong> — separate distribution per region, partially correlated with equities.</>,
          <><strong>Interest rates</strong> — mean-reverting random walk anchored to RBA expectations.</>,
          <><strong>CPI / wage growth</strong> — correlated with rates.</>,
          <><strong>Idiosyncratic income shocks</strong> — small probability of a wage interruption each year.</>,
        ]} />
        <Formula>P(metric) = empirical percentile across N simulated paths</Formula>
        <Callout type="tip">
          More paths = tighter estimates but slower. Defaults are tuned for &lt;3 s on a mid-range laptop. You can bump path count in advanced settings.
        </Callout>
      </div>
    ),
    fa: (
      <div>
        <PTag>
          منطق پشت موتور به‌زبان ساده. نام متغیرها شهودی است نه ارجاع مستقیم به کد.
        </PTag>

        <H3 id="scoring-fa">امتیاز ترکیبی</H3>
        <PTag>امتیاز هر استراتژی در یک زاویه دید، ترکیب وزنی ستون‌های نرمالایز‌شده است.</PTag>
        <Formula>امتیاز(استراتژی، زاویه) = Σ روی ستون‌های p از [ وزن(p, زاویه) × نرمال‌شده(p) ]</Formula>
        <UL items={[
          <><strong>ستون‌ها:</strong> ارزش خالص پایانی، CAGR تعدیل‌شده با ریسک، بقا، NSR، جریمه CVaR، شتاب FIRE، نقدینگی.</>,
          <><strong>نرمال‌شده:</strong> هر ستون به مقیاس ۰–۱ نسبت به بهترین/بدترین در میان نامزدها نگاشته می‌شود — تا قابل‌مقایسه باشد.</>,
          <><strong>وزن‌دار:</strong> هر زاویه دید بردار وزن مخصوص خود را دارد (به <Anchor href="/help?topic=de-formulas#weights">وزن‌ها</Anchor> رجوع کنید).</>,
          <><strong>تفسیر:</strong> امتیاز بالاتر بهتر است؛ فاصله تا استراتژی بعدی به شما می‌گوید برد چقدر قاطع است.</>,
        ]} />
        <Callout type="tip">
          ۳ امتیاز از ۱۰۰ در عمل شیر یا خط است. ۱۲ امتیاز فاصله یعنی ترجیح واقعی.
        </Callout>

        <H3 id="weights-fa">وزن‌های رتبه‌بندی در هر زاویه</H3>
        <Table rows={[
          ["ستون", "تعادل · رشد · نقدینگی"],
          ["ارزش خالص پایانی (P50)", "۳۰٪ · ۴۵٪ · ۱۵٪"],
          ["CAGR تعدیل‌شده با ریسک", "۲۰٪ · ۲۵٪ · ۱۰٪"],
          ["احتمال بقا", "۱۵٪ · ۵٪ · ۳۰٪"],
          ["NSR (حاشیه نقدی)", "۱۰٪ · ۰٪ · ۲۵٪"],
          ["جریمه CVaR", "۱۰٪ · ۱۰٪ · ۱۰٪"],
          ["شتاب FIRE", "۱۰٪ · ۱۰٪ · ۵٪"],
          ["عامل نقدینگی", "۵٪ · ۵٪ · ۵٪"],
        ]} />
        <Callout type="info">
          وزن‌های دقیق با گذشت زمان تنظیم می‌شوند و ممکن است اندکی تغییر کنند. برای وزن‌های زنده مورد استفاده در محاسبه شما، به نمودار آبشاری در کارت نتیجه نگاه کنید.
        </Callout>

        <H3 id="penalties-fa">جریمه‌های ریسک</H3>
        <PTag>برخی معیارها فقط ورودی امتیاز نیستند — می‌توانند هنگام عبور از آستانه‌ها مستقیماً کسر کنند.</PTag>
        <Formula>جریمه ریسک = max(۰، آستانه − بقا) × λ_بقا<br/>          + max(۰، |CVaR| − سقف CVaR) × λ_CVaR<br/>          + max(۰، افت − سقف افت) × λ_افت</Formula>
        <UL items={[
          <>بقای زیر ۹۰٪ جریمه بقا متناسب با فاصله ایجاد می‌کند.</>,
          <>CVaR بدتر از ۱.۵ برابر حاشیه نقد، جریمه دنباله ایجاد می‌کند.</>,
          <>افت بالای ۳۵٪ جریمه افت ایجاد می‌کند.</>,
          <>جریمه‌ها هرگز امتیاز را بهبود نمی‌دهند — فقط کاهش می‌دهند. کف نرم بهداشت ریسک هستند.</>,
        ]} />

        <H3 id="cashflow-fa">مدل جریان نقدی</H3>
        <Formula>جریان نقدی خالص_سال = درآمد − هزینه − خدمت بدهی + اجاره خالص + عایدی سرمایه‌گذاری − مالیات</Formula>
        <UL items={[
          <><strong>درآمد</strong> با فرض رشد دستمزد رشد می‌کند.</>,
          <><strong>هزینه</strong> با CPI (همراه شوک اختیاری) رشد می‌کند.</>,
          <><strong>خدمت بدهی</strong> از نرخ وام مدل‌شده استفاده می‌کند؛ در سفارشی، شوک نرخ مستقیماً اینجا اضافه می‌شود.</>,
          <><strong>اجاره خالص</strong> = اجاره − هزینه − بهره (یا فقط اجاره − هزینه اگر بهره منفی حذف شده باشد).</>,
          <><strong>عایدی سرمایه‌گذاری</strong> = سود سهام + بهره روی نقد، پس از مالیات.</>,
          <><strong>مالیات</strong> پلکان‌های مالیاتی نهایی را روی درآمد مشمول اعمال می‌کند، با کسرهای آگاه به رژیم.</>,
        ]} />
        <Callout type="tip">
          یک بررسی سرانگشتی مفید: جریان نقدی خالص باید ظرف ~۳ سال از هر خرید پر‌اهرم مثبت شود، وگرنه NSR فرسوده خواهد شد.
        </Callout>

        <H3 id="fire-timing-fa">زمان‌بندی استقلال مالی</H3>
        <Formula>سن FIRE = کوچک‌ترین سال y که در آن دارایی‌های قابل‌سرمایه‌گذاری × SWR ≥ هزینه هدف</Formula>
        <UL items={[
          <><strong>دارایی‌های قابل‌سرمایه‌گذاری</strong> به‌طور پیش‌فرض خانه اصلی را حذف می‌کند (قابل تغییر).</>,
          <><strong>SWR</strong> (نرخ برداشت امن) پیش‌فرض ۴٪ — قابل تنظیم.</>,
          <><strong>هزینه هدف</strong> با CPI به آن سال تعدیل می‌شود.</>,
          <><strong>شتاب FIRE</strong> = سن FIRE پایه − سن FIRE استراتژی. مثبت = زودتر.</>,
        ]} />

        <H3 id="survival-derivation-fa">احتمال بقا — چگونه استخراج می‌شود</H3>
        <PTag>برای هر مسیر مونت‌کارلو، اگر در هر سالی:</PTag>
        <UL items={[
          <>موجودی نقد زیر صفر برود، یا</>,
          <>ارزش خالص منفی شود، یا</>,
          <>توان پرداخت وام دو سال متوالی شکست بخورد، آن مسیر «شکست‌خورده» علامت می‌خورد.</>,
        ]} />
        <Formula>بقا = ۱ − (مسیرهای شکست‌خورده ÷ کل مسیرها)</Formula>
        <Callout type="info">
          بقا وابسته به مسیر است — هر شکستی در طول راه شمرده می‌شود، نه فقط در پایان. استراتژی می‌تواند ثروت پایانی عالی داشته باشد ولی بقای ضعیف اگر در سال‌های بد فرو می‌رود.
        </Callout>

        <H3 id="monte-carlo-fa">مونت‌کارلو — تصادفی‌بودن از کجا وارد می‌شود</H3>
        <PTag>هر مسیر شبیه‌سازی‌شده موارد زیر را تصادفی می‌کند:</PTag>
        <UL items={[
          <><strong>بازدهی سهام</strong> — از توزیعی کالیبره‌شده با بازدهی تاریخی سهام استرالیا/جهان با دنباله ضخیم.</>,
          <><strong>بازدهی ملک</strong> — توزیع جداگانه برای هر منطقه، با همبستگی جزئی با سهام.</>,
          <><strong>نرخ بهره</strong> — گام تصادفی با بازگشت به میانگین، لنگرشده به انتظارات RBA.</>,
          <><strong>CPI / رشد دستمزد</strong> — همبسته با نرخ‌ها.</>,
          <><strong>شوک‌های شخصی درآمد</strong> — احتمال کوچک قطع دستمزد در هر سال.</>,
        ]} />
        <Formula>P(معیار) = صدک تجربی در N مسیر شبیه‌سازی‌شده</Formula>
        <Callout type="tip">
          مسیرهای بیشتر = تخمین دقیق‌تر اما کندتر. پیش‌فرض‌ها برای &lt;۳ ثانیه روی لپ‌تاپ متوسط تنظیم شده‌اند. در تنظیمات پیشرفته قابل افزایش است.
        </Callout>
      </div>
    ),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 · Chart Interpretation Guides
// ─────────────────────────────────────────────────────────────────────────────

const chartGuides: SectionDef = {
  id: "de-charts",
  icon: <LineChart className="w-4 h-4" />,
  color: C_CHARTS,
  title: { en: "Chart & Graph Interpretation", fa: "تفسیر نمودارها و گراف‌ها" },
  keywords: {
    en: "chart graph interpretation wealth path fan terminal net worth distribution score waterfall tail risk monte carlo scenario comparison",
    fa: "نمودار گراف تفسیر مسیر ثروت پراکندگی ارزش خالص پایانی آبشاری ریسک دنباله مونت کارلو مقایسه سناریو",
  },
  content: {
    en: (
      <div>
        <PTag>For every major chart in the Decision Engine: what you're looking at, how to read it, and what to focus on.</PTag>

        <MetricCard anchor="fan" title="Wealth-path fan">
          <p><strong>What it is:</strong> A spaghetti of simulated wealth paths over time, with a shaded band between P10 and P90, and a bold central line at P50.</p>
          <p><strong>How to read it:</strong></p>
          <UL items={[
            <>The central line is your median outcome — typical, not guaranteed.</>,
            <>The shaded band is "80% of futures land in here".</>,
            <>The width of the band at the far right is your terminal uncertainty.</>,
            <>Where the band dips below zero, some futures involve insolvency.</>,
          ]} />
          <p><strong>What to focus on:</strong> The slope and the spread. Two strategies with the same P50 endpoint can have very different bands — the narrower one is the safer plan.</p>
          <p><strong>Example:</strong> A property-heavy strategy may have a higher P50 than ETF-only but a much wider band — bigger upside, bigger downside.</p>
        </MetricCard>

        <MetricCard anchor="tnw-dist" title="Terminal net-worth distribution">
          <p><strong>What it is:</strong> A histogram (or density curve) of the final wealth across all simulated paths. Vertical lines mark P10, P50, P90.</p>
          <p><strong>How to read it:</strong></p>
          <UL items={[
            <>The peak is the most common outcome.</>,
            <>A long left tail means catastrophic downside is possible — even if rare.</>,
            <>A long right tail means upside is possible — also rare.</>,
            <>A narrow, tall peak is a predictable strategy. A wide, flat curve is a gamble.</>,
          ]} />
          <p><strong>What to focus on:</strong> The shape of the left tail and the distance between P10 and P50. P50 minus P10 = your "regret distance" — what you might lose vs the typical outcome.</p>
        </MetricCard>

        <MetricCard anchor="waterfall" title="Score waterfall">
          <p><strong>What it is:</strong> A vertical bar chart that decomposes a strategy's composite score into the contributions from each pillar.</p>
          <p><strong>How to read it:</strong></p>
          <UL items={[
            <>Each green bar adds to the score — these are pillars where this strategy is strong.</>,
            <>Each red bar subtracts — these are where it's weak (or penalties bit).</>,
            <>Bars are sorted by absolute size — the biggest movers are at the top.</>,
          ]} />
          <p><strong>What to focus on:</strong> The biggest negative bar — that's the strategy's main weakness. If you're considering this strategy, ask whether that weakness is acceptable.</p>
          <p><strong>Example:</strong> A growth-y plan might have +18 from terminal NW, +6 from CAGR, but -9 from survival. The waterfall shows the trade-off clearly.</p>
        </MetricCard>

        <MetricCard anchor="tail-risk" title="Tail-risk profile">
          <p><strong>What it is:</strong> A chart showing CVaR, drawdown, and survival probability side-by-side for each strategy.</p>
          <p><strong>How to read it:</strong></p>
          <UL items={[
            <>Survival bars closer to 100% are safer.</>,
            <>CVaR bars are negative — closer to zero is better.</>,
            <>Drawdown bars are positive — smaller is better.</>,
          ]} />
          <p><strong>What to focus on:</strong> If two strategies look identical on terminal wealth, the tail-risk profile is usually where the real difference lives.</p>
        </MetricCard>

        <MetricCard anchor="mc-outputs" title="Monte Carlo outputs">
          <p><strong>What it is:</strong> A grouped panel showing P10, P50, P90 terminal wealth, survival probability, and FIRE age across simulated paths.</p>
          <p><strong>How to read it:</strong></p>
          <UL items={[
            <>P50 is "what's likely". P10 is "what's the 1-in-10 bad case". P90 is "what's the 1-in-10 good case".</>,
            <>Survival is the share of paths that didn't fail.</>,
            <>FIRE age is reported as a median — half of paths reach FIRE by then.</>,
          ]} />
          <p><strong>What to focus on:</strong> The gap between P50 and P10. A strategy with high P50 but low P10 has more risk than the headline suggests.</p>
        </MetricCard>

        <MetricCard anchor="scenario-compare" title="Scenario comparison charts">
          <p><strong>What it is:</strong> Side-by-side bars or paired tiles showing the same strategy under different policy assumptions (today's rules vs proposed reform vs custom what-if).</p>
          <p><strong>How to read it:</strong></p>
          <UL items={[
            <>Each tile is the same strategy, different rule set.</>,
            <>The biggest gap is your policy sensitivity.</>,
            <>A small gap means the strategy is robust to policy changes.</>,
          ]} />
          <p><strong>What to focus on:</strong> The delta between auto-detect and reform — that's the dollar value of grandfathering or the dollar cost of reform.</p>
        </MetricCard>

        <Callout type="info">
          Every chart in the Decision Engine has an info button next to it that jumps directly to the matching guide in this section.
        </Callout>
      </div>
    ),
    fa: (
      <div>
        <PTag>برای هر نمودار اصلی در موتور تصمیم‌گیری: چه می‌بینید، چگونه بخوانید، و روی چه چیزی تمرکز کنید.</PTag>

        <MetricCard anchor="fan-fa" title="بادبزن مسیر ثروت">
          <p><strong>چه چیزی:</strong> تعدادی مسیر شبیه‌سازی‌شده ثروت در طول زمان، با باند سایه‌دار بین P10 و P90، و خط مرکزی پررنگ در P50.</p>
          <p><strong>چگونه بخوانیم:</strong></p>
          <UL items={[
            <>خط مرکزی نتیجه میانه شماست — معمول، نه تضمین‌شده.</>,
            <>باند سایه‌دار یعنی «۸۰٪ آینده‌ها داخل این محدوده فرود می‌آیند».</>,
            <>پهنای باند در سمت راست‌ترین، عدم‌قطعیت پایانی شماست.</>,
            <>جایی که باند زیر صفر می‌رود، برخی آینده‌ها شامل ورشکستگی هستند.</>,
          ]} />
          <p><strong>روی چه تمرکز کنیم:</strong> شیب و پهنا. دو استراتژی با P50 یکسان می‌توانند باندهای بسیار متفاوت داشته باشند — باریک‌تر، امن‌تر.</p>
          <p><strong>مثال:</strong> استراتژی پر از ملک ممکن است P50 بالاتر از ETF خالص داشته باشد ولی باند پهن‌تر — بالاتر و پایین‌تر هر دو بزرگ‌تر.</p>
        </MetricCard>

        <MetricCard anchor="tnw-dist-fa" title="پراکندگی ارزش خالص پایانی">
          <p><strong>چه چیزی:</strong> هیستوگرام (یا منحنی چگالی) ثروت نهایی در تمام مسیرهای شبیه‌سازی‌شده. خطوط عمودی P10، P50، P90 را نشان می‌دهند.</p>
          <p><strong>چگونه بخوانیم:</strong></p>
          <UL items={[
            <>قله، رایج‌ترین نتیجه است.</>,
            <>دنباله بلند چپ یعنی زیان فاجعه‌بار محتمل است — حتی اگر نادر.</>,
            <>دنباله بلند راست یعنی صعود محتمل است — همچنین نادر.</>,
            <>قله باریک و بلند یعنی استراتژی قابل‌پیش‌بینی. منحنی پهن و مسطح یعنی قمار.</>,
          ]} />
          <p><strong>روی چه تمرکز کنیم:</strong> شکل دنباله چپ و فاصله بین P10 و P50. P50 منهای P10 = «فاصله افسوس» — چقدر ممکن است در مقابل نتیجه معمول از دست بدهید.</p>
        </MetricCard>

        <MetricCard anchor="waterfall-fa" title="نمودار آبشاری امتیاز">
          <p><strong>چه چیزی:</strong> نمودار میله‌ای عمودی که امتیاز ترکیبی یک استراتژی را به سهم هر ستون تجزیه می‌کند.</p>
          <p><strong>چگونه بخوانیم:</strong></p>
          <UL items={[
            <>هر میله سبز به امتیاز اضافه می‌کند — نقاط قوت این استراتژی.</>,
            <>هر میله قرمز کسر می‌کند — نقاط ضعف (یا جریمه‌های فعال‌شده).</>,
            <>میله‌ها به‌ترتیب اندازه مطلق چیده شده‌اند — بزرگ‌ترین تأثیرگذاران در بالا.</>,
          ]} />
          <p><strong>روی چه تمرکز کنیم:</strong> بزرگ‌ترین میله منفی — ضعف اصلی استراتژی. اگر این استراتژی را در نظر دارید، بپرسید آیا این ضعف قابل‌قبول است.</p>
          <p><strong>مثال:</strong> برنامه رشدمحور ممکن است +۱۸ از ارزش پایانی، +۶ از CAGR، اما -۹ از بقا داشته باشد. آبشار این مبادله را به‌وضوح نشان می‌دهد.</p>
        </MetricCard>

        <MetricCard anchor="tail-risk-fa" title="نیمرخ ریسک دنباله">
          <p><strong>چه چیزی:</strong> نموداری که CVaR، افت سرمایه، و احتمال بقا را برای هر استراتژی کنار هم نشان می‌دهد.</p>
          <p><strong>چگونه بخوانیم:</strong></p>
          <UL items={[
            <>میله‌های بقا که نزدیک‌تر به ۱۰۰٪ هستند، امن‌ترند.</>,
            <>میله‌های CVaR منفی هستند — نزدیک‌تر به صفر بهتر.</>,
            <>میله‌های افت مثبت هستند — کوچک‌تر بهتر.</>,
          ]} />
          <p><strong>روی چه تمرکز کنیم:</strong> اگر دو استراتژی در ثروت پایانی یکسان به‌نظر برسند، تفاوت واقعی معمولاً اینجا زندگی می‌کند.</p>
        </MetricCard>

        <MetricCard anchor="mc-outputs-fa" title="خروجی‌های مونت‌کارلو">
          <p><strong>چه چیزی:</strong> پنل گروه‌بندی‌شده که P10، P50، P90 ثروت پایانی، احتمال بقا و سن FIRE را در مسیرهای شبیه‌سازی نشان می‌دهد.</p>
          <p><strong>چگونه بخوانیم:</strong></p>
          <UL items={[
            <>P50 «احتمالاً». P10 «حالت بد یک از ده». P90 «حالت خوب یک از ده».</>,
            <>بقا، سهمی از مسیرها که شکست نخورده‌اند.</>,
            <>سن FIRE به‌صورت میانه گزارش می‌شود — نیمی از مسیرها تا آن زمان به FIRE می‌رسند.</>,
          ]} />
          <p><strong>روی چه تمرکز کنیم:</strong> فاصله بین P50 و P10. استراتژی با P50 بالا اما P10 پایین، ریسکی بیش از آنچه عنوان نشان می‌دهد دارد.</p>
        </MetricCard>

        <MetricCard anchor="scenario-compare-fa" title="نمودارهای مقایسه سناریو">
          <p><strong>چه چیزی:</strong> میله‌های پهلو‌به‌پهلو یا کاشی‌های جفت که همان استراتژی را تحت فرض‌های سیاستی مختلف نشان می‌دهند (قوانین امروز در برابر اصلاحات پیشنهادی در برابر سفارشی).</p>
          <p><strong>چگونه بخوانیم:</strong></p>
          <UL items={[
            <>هر کاشی همان استراتژی است، مجموعه قواعد متفاوت.</>,
            <>بزرگ‌ترین فاصله، حساسیت سیاستی شماست.</>,
            <>فاصله کم یعنی استراتژی در برابر تغییرات سیاست مقاوم است.</>,
          ]} />
          <p><strong>روی چه تمرکز کنیم:</strong> اختلاف بین تشخیص خودکار و اصلاحات — ارزش دلاری حقوق مکتسبه یا هزینه دلاری اصلاحات.</p>
        </MetricCard>

        <Callout type="info">
          هر نمودار در موتور تصمیم‌گیری دکمه اطلاعات کنار خود دارد که مستقیماً به راهنمای منطبق در این بخش جهش می‌کند.
        </Callout>
      </div>
    ),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Export ordered list
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 · Plain-English Glossary  (V2 simplification companion)
// ─────────────────────────────────────────────────────────────────────────────
//
// Maps every beginner-friendly UI label introduced in the V2 simplification
// pass back to its original advanced/quant name. Sourced from the same
// `decisionEngineLabels.ts` module the UI uses, so labels can never drift.
//
// Pattern: beginner explanation on top (always visible), advanced detail in
// a <BeginnerAdvanced> collapsible underneath — preserves depth without
// overwhelming first-time users.

/** Render a single glossary row: simple label → advanced name + plainEnglish. */
function glossaryRow(
  simple: string,
  advanced: string,
  plainEnglish: string,
): [string, string] {
  return [`${simple}\n(${advanced})`, plainEnglish];
}

const plainEnglishGlossary: SectionDef = {
  id: "de-plain-english-glossary",
  icon: <BookOpen className="w-4 h-4" />,
  color: C_GLOSSARY,
  title: {
    en: "Plain-English Glossary",
    fa: "واژه‌نامه به زبان ساده",
  },
  keywords: {
    en: "glossary plain english simple beginner translation labels names dictionary terminology mapping",
    fa: "واژه‌نامه زبان ساده مبتدی برچسب معادل اصطلاحات ترجمه فرهنگ لغت",
  },
  content: {
    en: (
      <div>
        <PTag>
          The V2 redesign replaces dense technical labels with beginner-friendly headlines. The advanced quant name is still preserved everywhere — in tooltips, in this glossary, and in the deeper sections of this Help Center. Use this page as a quick lookup whenever the UI shows a simplified label and you want to know what it means under the hood.
        </PTag>

        <Callout type="info">
          Nothing in the engine changed. The math is identical. Only the labels you see on screen are softer.
        </Callout>

        <H3 id="glossary-metrics">Risk &amp; return metrics</H3>
        <PTag>The numbers the engine reports for every strategy.</PTag>
        <Table rows={Object.values(METRIC_LABELS).map(m =>
          glossaryRow(m.simple, m.advanced, m.plainEnglish),
        )} />
        <BeginnerAdvanced advancedLabel="Show advanced names side-by-side" hideLabel="Hide advanced names">
          <p>Each metric keeps its original technical name internally — the engine, scoring math, and exported data all still use the advanced names. The simple label exists only at the presentation layer.</p>
          <p>Deep links to individual metrics still resolve via the original anchors (e.g. <Anchor href="/help?topic=de-risk-metrics#cvar">#cvar</Anchor>, <Anchor href="/help?topic=de-risk-metrics#survival">#survival</Anchor>).</p>
        </BeginnerAdvanced>

        <H3 id="glossary-lenses">Multi-winner lenses</H3>
        <PTag>The engine produces up to four "winners" — each ranked under a different priority.</PTag>
        <Table rows={Object.values(LENS_LABELS).map(l =>
          glossaryRow(l.simple, l.advanced, l.plainEnglish),
        )} />
        <H4>Why this won</H4>
        <UL items={Object.values(LENS_LABELS).map(l =>
          <><strong className="text-foreground">{l.simple}:</strong> {l.whyThisWon}</>
        )} />

        <H3 id="glossary-assumptions">Scenario assumptions</H3>
        <PTag>Which tax/policy rule set runs the projection.</PTag>
        <Table rows={Object.values(ASSUMPTION_LABELS).map(a =>
          glossaryRow(a.simple, a.advanced, a.plainEnglish),
        )} />
        <BeginnerAdvanced advancedLabel="Show what changes inside each assumption" hideLabel="Hide details">
          {Object.values(ASSUMPTION_LABELS).map((a, i) => (
            <div key={i} className="mb-2">
              <strong className="text-foreground">{a.simple}:</strong> {a.whatChanges}
              <br />
              <em>When to use:</em> {a.whenToUse}
            </div>
          ))}
        </BeginnerAdvanced>

        <H3 id="glossary-risk-modes">Risk control modes</H3>
        <PTag>How aggressive the engine should be when filtering paths.</PTag>
        <Table rows={Object.values(RISK_MODE_LABELS).map(r =>
          glossaryRow(r.simple, r.advanced, r.plainEnglish),
        )} />
        <BeginnerAdvanced advancedLabel="Show exact thresholds for each mode" hideLabel="Hide thresholds">
          {Object.values(RISK_MODE_LABELS).map((r, i) => (
            <div key={i} className="mb-2">
              <strong className="text-foreground">{r.simple}:</strong> {r.whatChanges}
            </div>
          ))}
        </BeginnerAdvanced>

        <Callout type="tip">
          Hover any value in the Decision Engine UI to see its advanced quant name. Click the small (?) next to any label to jump straight back into this Help Center.
        </Callout>
      </div>
    ),
    fa: (
      <div>
        <PTag>
          در طراحی نسخه ۲، برچسب‌های فنی سنگین با عبارات ساده‌تر جایگزین شده‌اند. نام دقیق فنی همچنان در ابزارهای کمکی (tooltip)، در همین واژه‌نامه و در بخش‌های عمیق‌تر این مرکز راهنما حفظ شده است. هرگاه در رابط کاربری یک برچسب ساده‌شده دیدید و خواستید بدانید زیر پوسته چه چیزی است، به این صفحه مراجعه کنید.
        </PTag>

        <Callout type="info">
          هیچ‌چیز در موتور تغییر نکرده است. ریاضیات کاملاً یکسان است. تنها برچسب‌هایی که روی صفحه می‌بینید نرم‌تر شده‌اند.
        </Callout>

        <H3>معیارهای ریسک و بازده</H3>
        <PTag>اعدادی که موتور برای هر استراتژی گزارش می‌دهد.</PTag>
        <Table rows={Object.values(METRIC_LABELS).map(m =>
          [`${m.simple}\n(${m.advanced})`, m.plainEnglish] as [string, string],
        )} />
        <BeginnerAdvanced advancedLabel="نمایش نام‌های فنی در کنار برچسب ساده" hideLabel="پنهان کردن نام‌های فنی">
          <p>هر معیار در درون موتور نام فنی اصلی خود را حفظ کرده — موتور، محاسبات امتیاز و داده‌های صادراتی همگی همان نام پیشرفته را به‌کار می‌برند. برچسب ساده فقط در لایه نمایشی وجود دارد.</p>
          <p>پیوندهای عمیق به هر معیار همچنان از طریق لنگرهای اصلی کار می‌کنند (مثلاً <Anchor href="/help?topic=de-risk-metrics#cvar">#cvar</Anchor>، <Anchor href="/help?topic=de-risk-metrics#survival">#survival</Anchor>).</p>
        </BeginnerAdvanced>

        <H3>زوایای دید برنده‌ها</H3>
        <PTag>موتور تا چهار «برنده» تولید می‌کند — هرکدام تحت اولویت متفاوتی رتبه‌بندی می‌شود.</PTag>
        <Table rows={Object.values(LENS_LABELS).map(l =>
          [`${l.simple}\n(${l.advanced})`, l.plainEnglish] as [string, string],
        )} />
        <H4>چرا این برنده شد</H4>
        <UL items={Object.values(LENS_LABELS).map(l =>
          <><strong className="text-foreground">{l.simple}:</strong> {l.whyThisWon}</>
        )} />

        <H3>فرضیات سناریو</H3>
        <PTag>اینکه پیش‌بینی تحت کدام مجموعه قوانین مالیاتی/سیاستی اجرا شود.</PTag>
        <Table rows={Object.values(ASSUMPTION_LABELS).map(a =>
          [`${a.simple}\n(${a.advanced})`, a.plainEnglish] as [string, string],
        )} />
        <BeginnerAdvanced advancedLabel="نمایش جزئیات هر فرضیه" hideLabel="پنهان کردن جزئیات">
          {Object.values(ASSUMPTION_LABELS).map((a, i) => (
            <div key={i} className="mb-2">
              <strong className="text-foreground">{a.simple}:</strong> {a.whatChanges}
              <br />
              <em>چه زمانی مناسب است:</em> {a.whenToUse}
            </div>
          ))}
        </BeginnerAdvanced>

        <H3>حالت‌های کنترل ریسک</H3>
        <PTag>اینکه موتور هنگام فیلتر کردن مسیرها چقدر سخت‌گیر باشد.</PTag>
        <Table rows={Object.values(RISK_MODE_LABELS).map(r =>
          [`${r.simple}\n(${r.advanced})`, r.plainEnglish] as [string, string],
        )} />
        <BeginnerAdvanced advancedLabel="نمایش آستانه‌های دقیق هر حالت" hideLabel="پنهان کردن آستانه‌ها">
          {Object.values(RISK_MODE_LABELS).map((r, i) => (
            <div key={i} className="mb-2">
              <strong className="text-foreground">{r.simple}:</strong> {r.whatChanges}
            </div>
          ))}
        </BeginnerAdvanced>

        <Callout type="tip">
          روی هر مقدار در رابط موتور تصمیم‌گیری اشاره کنید تا نام فنی آن نمایش داده شود. روی علامت (؟) کنار هر برچسب کلیک کنید تا مستقیماً به همین مرکز راهنما برگردید.
        </Callout>
      </div>
    ),
  },
};

export const decisionEngineSections: SectionDef[] = [
  overview,
  simpleVsAdvanced,
  plainEnglishGlossary,
  recommendationLogic,
  scenarioAssumptions,
  riskMetrics,
  formulas,
  chartGuides,
];

export default decisionEngineSections;
