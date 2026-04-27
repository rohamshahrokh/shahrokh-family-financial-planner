/**
 * familyMessages.ts
 * 100+ curated family motivation messages.
 * Anti-repetition: tracks last-sent index in localStorage.
 * No AI cost by default — pure built-in library.
 */

export type FamilyMsgLanguage = 'English' | 'Persian' | 'Mixed';
export type FamilyMsgRecipient = 'Roham' | 'Fara' | 'Both';

interface MessageTemplate {
  en?: string;
  fa?: string;
  mixed?: string;
  tags?: string[];
}

// ─── Message Library ──────────────────────────────────────────────────────────
// Placeholders: {name} = recipient name(s), {child1} = Yara, {child2} = Jana

const LIBRARY: MessageTemplate[] = [
  // ── English ──────────────────────────────────────────────────────────────
  { en: "{name}, every disciplined step today builds freedom for your family tomorrow.", tags: ['discipline'] },
  { en: "{name}, your effort today protects Yara and Jana's future.", tags: ['children'] },
  { en: "{name}, wealth is built in the quiet moments of consistency, not in single big decisions.", tags: ['consistency'] },
  { en: "{name}, the best financial gift to your children is a calm, secure home. You are building that.", tags: ['children', 'security'] },
  { en: "{name}, small savings compounded over years become the freedom you are working toward.", tags: ['savings'] },
  { en: "{name}, a family that plans together grows together.", tags: ['family'] },
  { en: "{name}, every bill paid on time is a brick in the foundation of your family's peace.", tags: ['discipline'] },
  { en: "{name}, your children will not remember every dollar spent — they will remember the security they felt.", tags: ['children'] },
  { en: "{name}, financial peace is not about having everything — it is about not being controlled by money.", tags: ['mindset'] },
  { en: "{name}, protect the surplus. The gap between income and spending is where your future lives.", tags: ['savings'] },
  { en: "{name}, today's sacrifice is tomorrow's freedom. Every dollar saved is a vote for your future self.", tags: ['discipline'] },
  { en: "{name}, the mortgage will end. The children will grow. The wealth will remain if you keep building it.", tags: ['long-term'] },
  { en: "{name}, consistency beats intensity. Show up for your finances every single week.", tags: ['consistency'] },
  { en: "{name}, think about Yara and Jana. That is enough reason to stay the course.", tags: ['children'] },
  { en: "{name}, your home is not just a property — it is the place where your children's memories are made. Protect it.", tags: ['home'] },
  { en: "{name}, financial strength gives you choices. Choices give your family freedom.", tags: ['freedom'] },
  { en: "{name}, the wealthiest families in history shared one trait: patience. Stay patient.", tags: ['patience'] },
  { en: "{name}, do not compare your chapter 3 to someone else's chapter 30.", tags: ['mindset'] },
  { en: "{name}, the plan is working. Trust the process. Keep going.", tags: ['encouragement'] },
  { en: "{name}, a strong family and a strong balance sheet are not separate goals — they are the same goal.", tags: ['family'] },
  { en: "{name}, invest in your assets today so your assets work for your children tomorrow.", tags: ['investing'] },
  { en: "{name}, financial stress hurts families. You are removing that stress brick by brick.", tags: ['security'] },
  { en: "{name}, one good financial decision per week builds a completely different life in five years.", tags: ['consistency'] },
  { en: "{name}, generosity flows from abundance. Build the abundance first.", tags: ['mindset'] },
  { en: "{name}, your legacy is not your net worth number — it is the values you model for Yara and Jana.", tags: ['legacy'] },
  { en: "{name}, a calm parent who is not stressed about money is the greatest gift to a child.", tags: ['children', 'peace'] },
  { en: "{name}, the market will correct. The property will appreciate. Stay invested and stay patient.", tags: ['investing'] },
  { en: "{name}, review the numbers not with anxiety, but with clarity. Knowledge is power.", tags: ['mindset'] },
  { en: "{name}, every family has a financial story. Make sure yours is one you are proud to pass on.", tags: ['legacy'] },
  { en: "{name}, wealth is quiet. It builds in the background while you focus on what matters most.", tags: ['mindset'] },
  { en: "{name}, the life you are building is not just financial — it is freedom, peace, and love for your family.", tags: ['freedom', 'family'] },
  { en: "{name}, protect your emergency fund. It is not idle money — it is your family's insurance policy.", tags: ['savings'] },
  { en: "{name}, there is deep honour in providing well for your family. You are doing that.", tags: ['encouragement'] },
  { en: "{name}, Brisbane is your base. The world is your opportunity. Stay focused, stay building.", tags: ['vision'] },
  { en: "{name}, the difference between a good month and a great month is a single disciplined choice.", tags: ['discipline'] },

  // ── Persian ───────────────────────────────────────────────────────────────
  { fa: "{name} جان، هر قدم امروزت آرامش فردای خانواده‌ات را می‌سازد.", tags: ['discipline'] },
  { fa: "{name} جان، تلاش تو امروز آینده یارا و جانا را محافظت می‌کند.", tags: ['children'] },
  { fa: "{name}، ثروت در لحظات آرام ثبات ساخته می‌شود، نه در تصمیم‌های بزرگ یکباره.", tags: ['consistency'] },
  { fa: "{name}، بهترین هدیه مالی به بچه‌هایت یک خانه آرام و امن است. تو داری اون رو می‌سازی.", tags: ['children', 'security'] },
  { fa: "{name}، پس‌انداز کوچک در طول سال‌ها به آزادی تبدیل می‌شه که داری براش کار می‌کنی.", tags: ['savings'] },
  { fa: "{name}، خانواده‌ای که با هم برنامه‌ریزی می‌کنه، با هم رشد می‌کنه.", tags: ['family'] },
  { fa: "{name}، هر قبض به موقع پرداخت‌شده یه آجر در پایه‌ی آرامش خانواده‌ته.", tags: ['discipline'] },
  { fa: "{name}، بچه‌هات هر ریال خرجی رو یادشون نمی‌مونه — امنیتی که حسش کردن یادشون می‌مونه.", tags: ['children'] },
  { fa: "{name}، آرامش مالی یعنی پول کنترلت نکنه — نه اینکه همه چیز داشته باشی.", tags: ['mindset'] },
  { fa: "{name}، مراقب مازاد باش. فاصله‌ی بین درآمد و هزینه جاییه که آینده‌ات زندگی می‌کنه.", tags: ['savings'] },
  { fa: "{name}، فداکاری امروز آزادی فردا رو می‌سازه.", tags: ['discipline'] },
  { fa: "{name}، وام مسکن تموم می‌شه. بچه‌ها بزرگ می‌شن. ثروت می‌مونه اگه ادامه بدی.", tags: ['long-term'] },
  { fa: "{name}، ثبات بهتر از شدته. هر هفته پای مالیاتت حاضر باش.", tags: ['consistency'] },
  { fa: "{name}، به یارا و جانا فکر کن. همین کافیه که بمونی توی مسیر.", tags: ['children'] },
  { fa: "{name}، خونه‌ات فقط یه ملک نیست — جاییه که خاطرات بچه‌هات ساخته می‌شه. محافظتش کن.", tags: ['home'] },
  { fa: "{name}، قدرت مالی بهت انتخاب می‌ده. انتخاب آزادی خانواده‌ات رو.", tags: ['freedom'] },
  { fa: "{name}، ثروتمندترین خانواده‌های تاریخ یه چیز مشترک داشتن: صبر. صبور باش.", tags: ['patience'] },
  { fa: "{name}، فصل سوم خودت رو با فصل سی‌ام یکی دیگه مقایسه نکن.", tags: ['mindset'] },
  { fa: "{name}، برنامه داره پیش می‌ره. به فرایند اعتماد کن. ادامه بده.", tags: ['encouragement'] },
  { fa: "{name}، میراثت عدد خالص دارایی‌ات نیست — ارزش‌هاییه که به یارا و جانا نشون می‌دی.", tags: ['legacy'] },

  // ── Mixed ─────────────────────────────────────────────────────────────────
  { mixed: "{name}، every step you take today, رهام، is building the life your family deserves.", tags: ['encouragement'] },
  { mixed: "{name} جان, your consistency is your greatest asset.", tags: ['consistency'] },
  { mixed: "{name}، the numbers are getting better. Keep building. ادامه بده.", tags: ['encouragement'] },
  { mixed: "{name}، خانواده‌ات proud of you هستن — even when they don't say it.", tags: ['family'] },
  { mixed: "{name}، هر روز یک قدم. Every day, one step closer to freedom.", tags: ['consistency'] },
  { mixed: "{name} جان، wealth is not a destination — it is a way of living with intention.", tags: ['mindset'] },
  { mixed: "{name}، ثروت ساخته می‌شه in the small decisions, not the big ones.", tags: ['consistency'] },
  { mixed: "{name}، protect your peace. آرامشت رو حفظ کن. That is the foundation of everything.", tags: ['peace'] },
  { mixed: "{name}، Yara and Jana are watching. یارا و جانا یاد می‌گیرن از تو.", tags: ['children', 'legacy'] },
  { mixed: "{name}، the future is built today. آینده امروز ساخته می‌شه.", tags: ['vision'] },

  // ── Both / Couple ─────────────────────────────────────────────────────────
  { en: "{name}, you are not just building wealth — you are building peace and security for your family.", tags: ['family', 'security'] },
  { en: "{name}, your unity today becomes security for Yara and Jana tomorrow.", tags: ['family', 'children'] },
  { en: "{name}, today is another page in the story of the future you are creating together.", tags: ['family', 'vision'] },
  { en: "{name}, two people aligned on finances are unstoppable. You are that team.", tags: ['family', 'partnership'] },
  { en: "{name}, the love in your home and the discipline in your finances are not separate things — they protect each other.", tags: ['family', 'discipline'] },
  { en: "{name}, strong partnerships build strong legacies. Keep showing up for each other and for this plan.", tags: ['family', 'legacy'] },
  { en: "{name}, the children will grow up watching how you handle money together. Make it something beautiful.", tags: ['children', 'family'] },
  { en: "{name}, the home you own, the savings you grow, the future you plan — all of it is built on the love you share.", tags: ['family', 'love'] },
  { en: "{name}, financial teamwork is one of the deepest forms of trust in a partnership.", tags: ['partnership', 'trust'] },
  { en: "{name}, the best investment you will ever make is in each other and in the stability of your family.", tags: ['family', 'investing'] },
  { fa: "{name}، شما فقط ثروت نمی‌سازید — دارید آرامش و آینده خانواده‌تون رو می‌سازید.", tags: ['family', 'security'] },
  { fa: "{name}، اتحاد شما امروز، امنیت یارا و جانا رو فردا می‌سازه.", tags: ['family', 'children'] },
  { fa: "{name}، امروز یه صفحه دیگه‌ست از داستان آینده‌ای که دارید با هم می‌سازید.", tags: ['family', 'vision'] },
  { fa: "{name}، دو نفری که روی مالی هم‌نظرن، شکست‌ناپذیرن. شما اون تیم هستید.", tags: ['family', 'partnership'] },
  { mixed: "{name}، the love you have for each other is the reason این همه تلاش می‌کنید. Never forget that.", tags: ['family', 'love'] },
  { mixed: "{name}، together you are building something rare — هم آرامش، هم امنیت، هم آزادی.", tags: ['family', 'freedom'] },
  { mixed: "{name}، Yara and Jana are the reason. یارا و جانا دلیل همه چیزن. Keep going.", tags: ['children', 'encouragement'] },
  { mixed: "{name}، your family story is being written every day. Every good financial choice is a good sentence in it.", tags: ['family', 'legacy'] },
  { mixed: "{name} جانم، یه روز بچه‌هاتون will look back and see how much you sacrificed for them. ارزشش رو داره.", tags: ['children', 'legacy'] },
  { mixed: "{name}، in this family, love and responsibility walk together. عشق و مسئولیت دست به دست هم.", tags: ['family', 'discipline'] },

  // ── Morning-specific ──────────────────────────────────────────────────────
  { en: "{name}, good morning. One good financial choice today is enough. Make it.", tags: ['morning'] },
  { en: "{name}, the day is fresh. Your goals are clear. Go and build.", tags: ['morning'] },
  { en: "{name}, mornings belong to those who planned the night before. You planned. Now execute.", tags: ['morning', 'discipline'] },
  { fa: "{name}، صبح بخیر. یه تصمیم مالی خوب امروز کافیه. بگیرش.", tags: ['morning'] },
  { fa: "{name}، روز تازه است. اهدافت روشنن. برو و بساز.", tags: ['morning'] },
  { mixed: "{name}، good morning. صبح بخیر. Today is another opportunity to build the life you want.", tags: ['morning'] },

  // ── Midday-specific ───────────────────────────────────────────────────────
  { en: "{name}, midday check-in: are your spending decisions aligned with your goals today?", tags: ['midday'] },
  { en: "{name}, half the day is done. Finish strong. Small decisions in the afternoon compound too.", tags: ['midday', 'consistency'] },
  { fa: "{name}، وسط روز چک کن: آیا تصمیمات خرجت امروز با اهدافت همخوانی داره؟", tags: ['midday'] },
  { mixed: "{name}، midday reminder: وسط روز یادآوری. The goal is still the same. Stay on course.", tags: ['midday'] },

  // ── Evening-specific ──────────────────────────────────────────────────────
  { en: "{name}, end of day. Whatever happened today financially, tomorrow is a fresh start.", tags: ['evening'] },
  { en: "{name}, the best thing you can do tonight for your finances: rest well and plan clearly.", tags: ['evening'] },
  { en: "{name}, family dinner table is where the real wealth lives. Enjoy it tonight.", tags: ['evening', 'family'] },
  { en: "{name}, evenings are for gratitude. You have a home, a family, a plan. That is already a lot.", tags: ['evening', 'gratitude'] },
  { fa: "{name}، آخر روز. هر اتفاقی که امروز افتاد، فردا یه شروع تازه‌ست.", tags: ['evening'] },
  { fa: "{name}، بهترین کاری که می‌تونی امشب برای مالیت بکنی: خوب استراحت کن و واضح برنامه‌ریزی کن.", tags: ['evening'] },
  { fa: "{name}، شب‌ها برای سپاسگزاریه. یه خونه، یه خانواده، یه برنامه داری. این خیلی چیزیه.", tags: ['evening', 'gratitude'] },
  { mixed: "{name}، good night. شب بخیر. Rest well — tomorrow we build again. فردا دوباره می‌سازیم.", tags: ['evening'] },
  { mixed: "{name}، امشب به یارا و جانا look at them and remember why you work so hard. It is worth it.", tags: ['evening', 'children'] },

  // ── Extra unique messages ─────────────────────────────────────────────────
  { en: "{name}, passive income is not magic — it is years of active discipline finally paying off. You are building it.", tags: ['investing', 'long-term'] },
  { en: "{name}, the mortgage is a commitment to your family's security. Every extra payment shortens the chain.", tags: ['home', 'discipline'] },
  { en: "{name}, financial literacy is a superpower. The more you understand money, the more it works for you.", tags: ['mindset'] },
  { en: "{name}, track your spending not with guilt, but with power. You are the CFO of this family.", tags: ['mindset'] },
  { en: "{name}, property in Brisbane is your anchor. Let it grow while you build the rest.", tags: ['investing', 'property'] },
  { en: "{name}, a family with an emergency fund sleeps differently. Protect yours.", tags: ['savings', 'security'] },
  { en: "{name}, the stock market rewards the patient. Your DCA strategy is a quiet act of wisdom.", tags: ['investing'] },
  { en: "{name}, crypto volatility is noise if your conviction and timeline are strong. Trust the process.", tags: ['investing'] },
  { en: "{name}, superannuation is the slow river that becomes an ocean. Let it flow.", tags: ['investing', 'long-term'] },
  { fa: "{name}، درآمد منفعل جادو نیست — سال‌هاست انضباط فعال داره نتیجه می‌ده. داری می‌سازیش.", tags: ['investing'] },
  { fa: "{name}، سواد مالی یه ابرقدرته. هرچه بیشتر پول رو بفهمی، بیشتر برات کار می‌کنه.", tags: ['mindset'] },
  { fa: "{name}، هزینه‌هاتو نه با احساس گناه، بلکه با قدرت پیگیری کن. تو CFO این خانواده‌ای.", tags: ['mindset'] },
  { mixed: "{name}، your superannuation is growing quietly in the background. آروم داره رشد می‌کنه. Let it.", tags: ['investing'] },
  { mixed: "{name}، every DCA investment is a message to the market: این خانواده صبور و مصمم است. We are here for the long run.", tags: ['investing', 'patience'] },
];

// ─── Resolve recipient name string ────────────────────────────────────────────

function resolveNameString(recipient: FamilyMsgRecipient): string {
  if (recipient === 'Roham') return 'Roham';
  if (recipient === 'Fara') return 'Fara';
  return 'Roham & Fara';
}

// ─── Cooldown store ───────────────────────────────────────────────────────────

const COOLDOWN_KEY = 'sf_family_msg_log';

function getRecentIndices(): number[] {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ idx: number; date: string }>;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
    return parsed.filter(e => new Date(e.date).getTime() > cutoff).map(e => e.idx);
  } catch { return []; }
}

function markIndexSent(idx: number) {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    const parsed: Array<{ idx: number; date: string }> = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const cleaned = parsed.filter(e => new Date(e.date).getTime() > cutoff);
    cleaned.push({ idx, date: new Date().toISOString() });
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(cleaned));
  } catch {}
}

// ─── Pick a message ───────────────────────────────────────────────────────────

export function pickFamilyMessage(
  recipient: FamilyMsgRecipient,
  lang: FamilyMsgLanguage,
  timeSlot: 'morning' | 'midday' | 'evening'
): string {
  const recentIndices = getRecentIndices();
  const name = resolveNameString(recipient);

  // Filter by language preference
  const candidates = LIBRARY
    .map((msg, idx) => ({ msg, idx }))
    .filter(({ idx }) => !recentIndices.includes(idx))
    .filter(({ msg }) => {
      if (lang === 'English') return !!msg.en;
      if (lang === 'Persian') return !!msg.fa;
      if (lang === 'Mixed') return !!(msg.mixed || msg.en || msg.fa);
      return true;
    });

  // Prefer time-slot tagged messages
  const slotCandidates = candidates.filter(({ msg }) => msg.tags?.includes(timeSlot));
  const pool = slotCandidates.length > 0 ? slotCandidates : candidates;

  // Fallback: if all have been recently sent, reset
  const finalPool = pool.length > 0 ? pool : LIBRARY.map((msg, idx) => ({ msg, idx }));

  const { msg, idx } = finalPool[Math.floor(Math.random() * finalPool.length)];

  let text = '';
  if (lang === 'English') text = msg.en || msg.mixed || msg.fa || '';
  else if (lang === 'Persian') text = msg.fa || msg.mixed || msg.en || '';
  else text = msg.mixed || msg.en || msg.fa || '';

  markIndexSent(idx);

  return text.replace(/\{name\}/g, name);
}

// ─── Daily scheduler check ────────────────────────────────────────────────────
// Called on app load. Returns pending time slots if they haven't been sent today.

export function getPendingTimeSlots(settings: {
  morning: boolean;
  midday: boolean;
  evening: boolean;
  morningTime: string; // 'HH:MM'
  middayTime: string;
  eveningTime: string;
}): Array<'morning' | 'midday' | 'evening'> {
  const sentKey = 'sf_family_sent_today';
  const today = new Date().toISOString().split('T')[0];
  let sent: Record<string, string[]> = {};
  try {
    const raw = localStorage.getItem(sentKey);
    sent = raw ? JSON.parse(raw) : {};
  } catch {}

  const alreadySentToday: string[] = sent[today] || [];
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const parseTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const pending: Array<'morning' | 'midday' | 'evening'> = [];
  if (settings.morning && !alreadySentToday.includes('morning') && nowMins >= parseTime(settings.morningTime)) pending.push('morning');
  if (settings.midday  && !alreadySentToday.includes('midday')  && nowMins >= parseTime(settings.middayTime))  pending.push('midday');
  if (settings.evening && !alreadySentToday.includes('evening') && nowMins >= parseTime(settings.eveningTime)) pending.push('evening');

  return pending;
}

export function markSlotSent(slot: 'morning' | 'midday' | 'evening') {
  const sentKey = 'sf_family_sent_today';
  const today = new Date().toISOString().split('T')[0];
  let sent: Record<string, string[]> = {};
  try {
    const raw = localStorage.getItem(sentKey);
    sent = raw ? JSON.parse(raw) : {};
  } catch {}
  sent[today] = [...(sent[today] || []), slot];
  try { localStorage.setItem(sentKey, JSON.stringify(sent)); } catch {}
}
