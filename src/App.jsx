// ⚠️ Replace YOUR_GEMINI_KEY_HERE with your Gemini API key from aistudio.google.com
// Get a new key at: https://aistudio.google.com/app/apikey
// NEVER paste your key in chat — add it directly here

import { useState, useEffect, useRef } from "react";

const FB_KEY = "AIzaSyAz0sTQXL6XDaYTNtsskhjzmEXEYSa4P3Y";
const FB_PROJECT = "dreamdecoder-af2e6";
// Do NOT paste the key in chat — add it directly here on GitHub

import { useState, useEffect, useRef } from "react";

const FB_KEY = "AIzaSyAz0sTQXL6XDaYTNtsskhjzmEXEYSa4P3Y";
const FB_PROJECT = "dreamdecoder-af2e6";
const AUTH = `https://identitytoolkit.googleapis.com/v1/accounts`;
const FS = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;
const GEMINI_KEY = "AIzaSyDE9gQMwUewcpw2meI5-5An5bQ0XtvHVmk"; // ← paste your new key here
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
const FS = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;
const EJS_SERVICE = "service_DreamDecoder";
const EJS_TEMPLATE = "template_yahzaho";
const EJS_PUBLIC = "aTsiU4AS3cJqY9KVe";

async function callGemini(prompt) {
  try {
    const r = await fetch(GEMINI_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.75 } })
    });
    const d = await r.json();
    if (d.error) return "Error: " + d.error.message;
    return d.candidates?.[0]?.content?.parts?.[0]?.text || "Could not interpret.";
  } catch (e) { return "Connection error: " + e.message; }
}

async function sendEmail(toEmail, username, code) {
  try {
    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: EJS_SERVICE, template_id: EJS_TEMPLATE, user_id: EJS_PUBLIC, template_params: { to_email: toEmail, username, code: String(code) } })
    });
    return r.status === 200;
  } catch { return false; }
}

async function fbReq(endpoint, body) {
  try {
    const r = await fetch(`${AUTH}:${endpoint}?key=${FB_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch { return { error: { message: "NETWORK_ERROR" } }; }
}
const fbRegister = (e, p) => fbReq("signUp", { email: e, password: p, returnSecureToken: true });
const fbLogin = (e, p) => fbReq("signInWithPassword", { email: e, password: p, returnSecureToken: true });

function toFS(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number") f[k] = { integerValue: String(Math.round(v)) };
    else if (typeof v === "boolean") f[k] = { booleanValue: v };
    else f[k] = { stringValue: typeof v === "string" ? v : JSON.stringify(v) };
  }
  return { fields: f };
}
function fromFS(doc) {
  if (!doc?.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    const raw = v.stringValue ?? String(v.integerValue ?? v.booleanValue ?? "");
    try { out[k] = JSON.parse(raw); } catch { out[k] = raw; }
  }
  return out;
}
async function fsWrite(uid, data, idToken) {
  try { localStorage.setItem("dd9_" + uid, JSON.stringify(data)); } catch {}
  if (!idToken || idToken.startsWith("local_")) return;
  try {
    await fetch(`${FS}/users/${uid}`, { method: "PATCH", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` }, body: JSON.stringify(toFS(data)) });
  } catch {}
}
async function fsRead(uid, idToken) {
  if (idToken && !idToken.startsWith("local_")) {
    try {
      const r = await fetch(`${FS}/users/${uid}`, { headers: { "Authorization": `Bearer ${idToken}` } });
      if (r.ok) { const d = fromFS(await r.json()); if (d) return d; }
    } catch {}
  }
  try { const l = localStorage.getItem("dd9_" + uid); if (l) return JSON.parse(l); } catch {}
  return null;
}
function getEmails() { try { return JSON.parse(localStorage.getItem("dd9_emails") || "[]"); } catch { return []; } }
function saveEmail(email, uid, username) {
  const emails = getEmails();
  if (!emails.find(e => e.email === email.toLowerCase())) {
    emails.push({ email: email.toLowerCase(), uid, username });
    localStorage.setItem("dd9_emails", JSON.stringify(emails));
  }
}
function emailRegistered(email) { return getEmails().find(e => e.email === email.toLowerCase()); }
function usernameRegistered(username) { return getEmails().find(e => e.username?.toLowerCase() === username.toLowerCase()); }
function getUsedCodes() { try { return JSON.parse(localStorage.getItem("dd9_codes") || "[]"); } catch { return []; } }
function addUsedCode(c) { const u = getUsedCodes(); if (!u.includes(c)) { u.push(c); localStorage.setItem("dd9_codes", JSON.stringify(u)); } }
function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function parseScores(t) { const m = (l) => { const r = new RegExp(`${l}[:\\s]+([0-9]+)`, "i"); const mt = t.match(r); return mt ? parseInt(mt[1]) : Math.floor(Math.random() * 4) + 5; }; return { mystery: m("mystery"), emotion: m("emotional intensity"), symbols: m("symbol richness") }; }
function fmtFull(iso) { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function fmtDay(iso) { return new Date(iso).toISOString().split("T")[0]; }

const SYSTEM_PROMPT = `You are the AI engine of DreamDecoder, a modern dream interpretation app.
Analyze the user's dream from three perspectives: Islamic, Psychological, Biblical.

RULES:
- Respond in the SAME language as the user (English, Russian, or Uzbek).
- Simple modern language. Max 280 words total. Emojis. Bullet points for symbols.
- Use "may symbolize", "can represent", "often reflects". Never absolute claims.
- Each section MUST give a DIFFERENT perspective.

OUTPUT FORMAT (follow exactly):

Dream Summary 🌙
(1–2 sentences)

ISLAMIC VIEW ☪️
Meaning:
(2–3 sentences)
Symbols:
• symbol — meaning
• symbol — meaning
Takeaway:
(1 sentence)

PSYCHOLOGICAL VIEW 🧠
Meaning:
(2–3 sentences)
Symbols:
• symbol — meaning
• symbol — meaning
Takeaway:
(1 sentence)

BIBLICAL VIEW ✝️
Meaning:
(2–3 sentences)
Symbols:
• symbol — meaning
• symbol — meaning
Takeaway:
(1 sentence)

SPIRITUAL & PRACTICAL ADVICE 💡
Based on this dream, here are personal recommendations:
• (Spiritual advice — e.g. pray more, read Quran/Bible, reflect on your sins, seek forgiveness)
• (Lifestyle advice — e.g. reduce screen time, avoid toxic content, sleep earlier, exercise)
• (Mental advice — e.g. journal your thoughts, talk to someone you trust, take a break)
• (Action advice — e.g. make a specific change this week)

DREAM SCORE:
Mystery: X/10
Emotional Intensity: X/10
Symbol Richness: X/10

FINAL DISCLAIMER
Dream interpretations are symbolic and not guaranteed truths.`;

const PLANS = [
  { id: "starter", lk: "planStarter", price: "$5", analyzes: 25, color: "#7c5cbf" },
  { id: "pro", lk: "planPro", price: "$10", analyzes: 60, color: "#c9a84c", popular: true },
  { id: "elite", lk: "planElite", price: "$16.99", analyzes: 100, color: "#4a90d9" },
];
const MOODS = ["😊 Joyful", "😴 Peaceful", "✨ Mystical", "😕 Confusing", "😨 Frightening", "😢 Sad", "😤 Stressed"];
const MOOD_COLOR = { "😊 Joyful": "#4caf50", "😴 Peaceful": "#7cb8d4", "✨ Mystical": "#c9a84c", "😕 Confusing": "#8a8a6a", "😨 Frightening": "#c95050", "😢 Sad": "#5a7ab2", "😤 Stressed": "#c97a30" };
const FREE_LIMIT = 5;
const C = { bg: "#07071a", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.09)", gold: "#c9a84c", text: "#e8e0d0", sub: "#6a6a9a", purple: "#7c5cbf", blue: "#4a90d9", green: "#4caf50", red: "#c95050" };

const T = {
  en: {
    appName: "DreamDecoder", tagline: "Islamic · Psychology · Biblical",
    login: "Login", register: "Register", logout: "Logout",
    forgotPass: "Forgot Password?", resetPass: "Reset Password",
    sendResetCode: "📧 Send Reset Code", newPassword: "New Password",
    confirmReset: "✅ Reset & Login", resetSent: "✅ Reset code sent to your Gmail!",
    resetSuccess: "✅ Password reset! Logging you in...",
    signInGoogle: "🔵 Continue with Google",
    username: "Username", email: "Email (@gmail.com)", password: "Password (min 6)",
    loginBtn: "🔑 Login", registerBtn: "📝 Create Account",
    verifyTitle: "Check Your Gmail 📧", verifyMsg: "6-digit code sent to:",
    verifyInput: "Enter 6-digit code", verifyBtn: "✅ Verify & Continue",
    verifyResend: "Resend Code", verifyBack: "← Back",
    verifyExpire: "Code expires in 10 minutes.",
    notVerified: "❌ Wrong code. Try again.", codeExpired: "❌ Code expired. Request new one.",
    emailExists: "❌ Email already registered. Please login.", usernameExists: "❌ Username taken. Choose another.",
    noAccount: "❌ No account found. Please register first.", wrongPass: "❌ Incorrect password.",
    invalidEmail: "❌ Email must end with @gmail.com", shortPass: "❌ Min. 6 characters.",
    emptyField: "❌ Fill in all fields.", networkErr: "❌ Network error. Check connection.",
    accountActive: "✅ Welcome back!", registered: "✅ Code sent to your Gmail!",
    codeSent: "✅ New code sent!", analyzesLeft: "analyzes left", plan: "Plan",
    analyzeBtn: "✨ Analyze a Dream", analyzeBtnLock: "🔒 Get More Analyzes",
    newDream: "New Dream", history: "History", insights: "Insights",
    dictionary: "Dictionary", home: "Home", settings: "Settings",
    dreamTitle: "Dream Title", dreamDesc: "Describe Your Dream",
    dreamEmo: "How did you feel?", dreamLoc: "Location (optional)",
    dreamPeople: "People in dream (optional)", dreamObj: "Objects / Symbols (optional)",
    analyzeNow: "🔍 Analyze Dream", clearText: "🗑 Clear", back: "← Back",
    connecting: "🔮 Analyzing...",
    allViews: "🌐 All", islamic: "☪️ Islamic", psych: "🧠 Psych", biblical: "✝️ Biblical",
    advice: "💡 Advice",
    copy: "📋 Copy", copied: "✓ Copied!", whatsapp: "💬 WhatsApp", telegram: "✈️ Telegram", print: "📄 PDF",
    searchDreams: "🔍 Search dreams...", noDreams: "No dreams yet. Tap + to start!", noMatch: "No results.",
    interpreted: "✓ Analyzed", notAnalyzed: "Not analyzed", deleteDream: "Delete this dream?",
    favAdded: "⭐ Added to favorites!", favRemoved: "Removed from favorites",
    favorites: "Favorites", calendar: "Calendar", stats: "Stats",
    totalDreams: "Dreams", analyzed: "Analyzed", mysteryScore: "Mystery",
    moodOverview: "Mood Breakdown", positive: "Positive", neutral: "Neutral", stress: "Stress",
    commonSymbols: "Common Symbols", aiCoach: "🤖 Generate My Insight",
    insightLocked: "🔒 Advanced Insights", insightLockedDesc: "Upgrade to Pro or Elite to unlock your personal AI dream analysis.",
    upgradePlan: "⭐ Upgrade Plan",
    settingsTitle: "Settings", accountTab: "Account", planTab: "Plan",
    themeTab: "Theme", langTab: "Language", aboutTab: "About",
    currentUsage: "Analyzes Left", remaining: "left",
    promoCode: "Promo Code 🎟", enterPromo: "Enter promo code...", applyBtn: "Apply",
    invalidPromo: "❌ Invalid or already used.", promoOk: "✅ Added to your balance!",
    buyContact: "Contact on Telegram to buy. You'll receive a unique promo code.",
    contactBtn: "📲 Buy on Telegram", planStarter: "Starter", planPro: "Pro ⭐", planElite: "Elite",
    analyzesPlan: "analyzes", popular: "POPULAR",
    themeDark: "🌙 Dark", themeLight: "☀️ Light", langLabel: "Interface Language",
    aboutText: "DreamDecoder v9.0\nIslamic · Psychology · Biblical\nPowered by Google Gemini AI\n© 2025 DreamDecoder",
    subLogs: "Purchase History", noLogs: "No purchases yet.",
    overallInsight: "Personal Dream Insight", noInsightData: "Analyze at least 2 dreams.",
    payTitle: "Unlock DreamDecoder 🔒", paySubtitle: "You've used all your analyzes",
    payDesc: "Buy a plan on Telegram and enter your promo code.",
    havePromo: "Have a promo code?", requireLogin: "Create an account to start.",
    loading: "Loading...", noTitle: "Enter a dream title.", noDesc: "Describe your dream.",
    noDreamsCalendar: "No dreams recorded yet.", streakDays: "day streak 🔥",
    enableNotif: "🔔 Enable Morning Reminders", notifEnabled: "✅ Morning reminders enabled!",
    notifDenied: "❌ Please allow notifications in browser settings.",
  },
  ru: {
    appName: "DreamDecoder", tagline: "Ислам · Психология · Библия",
    login: "Войти", register: "Регистрация", logout: "Выйти",
    forgotPass: "Забыли пароль?", resetPass: "Сброс пароля",
    sendResetCode: "📧 Отправить код", newPassword: "Новый пароль",
    confirmReset: "✅ Сбросить и войти", resetSent: "✅ Код отправлен!",
    resetSuccess: "✅ Пароль сброшен!", signInGoogle: "🔵 Войти через Google",
    username: "Имя", email: "Email (@gmail.com)", password: "Пароль (мин. 6)",
    loginBtn: "🔑 Войти", registerBtn: "📝 Создать аккаунт",
    verifyTitle: "Проверьте Gmail 📧", verifyMsg: "Код отправлен на:",
    verifyInput: "Введите 6-значный код", verifyBtn: "✅ Подтвердить",
    verifyResend: "Отправить снова", verifyBack: "← Назад", verifyExpire: "Код действует 10 минут.",
    notVerified: "❌ Неверный код.", codeExpired: "❌ Код истёк.",
    emailExists: "❌ Email уже зарегистрирован.", usernameExists: "❌ Имя занято.",
    noAccount: "❌ Аккаунт не найден. Зарегистрируйтесь.", wrongPass: "❌ Неверный пароль.",
    invalidEmail: "❌ Email должен быть @gmail.com", shortPass: "❌ Мин. 6 символов.",
    emptyField: "❌ Заполните все поля.", networkErr: "❌ Ошибка сети.",
    accountActive: "✅ Добро пожаловать!", registered: "✅ Код отправлен!",
    codeSent: "✅ Новый код отправлен!", analyzesLeft: "анализов", plan: "Тариф",
    analyzeBtn: "✨ Анализировать сон", analyzeBtnLock: "🔒 Получить анализы",
    newDream: "Новый сон", history: "История", insights: "Инсайты",
    dictionary: "Словарь", home: "Главная", settings: "Настройки",
    dreamTitle: "Название", dreamDesc: "Опишите сон", dreamEmo: "Как себя чувствовали?",
    dreamLoc: "Место (необязательно)", dreamPeople: "Люди (необязательно)", dreamObj: "Объекты (необязательно)",
    analyzeNow: "🔍 Анализировать", clearText: "🗑 Очистить", back: "← Назад",
    connecting: "🔮 Анализирую...",
    allViews: "🌐 Все", islamic: "☪️ Ислам", psych: "🧠 Психо", biblical: "✝️ Библия", advice: "💡 Совет",
    copy: "📋 Копировать", copied: "✓ Скопировано!", whatsapp: "💬 WhatsApp", telegram: "✈️ Telegram", print: "📄 PDF",
    searchDreams: "🔍 Поиск...", noDreams: "Снов нет. Нажмите +!", noMatch: "Ничего.",
    interpreted: "✓ Проанализирован", notAnalyzed: "Нет анализа", deleteDream: "Удалить?",
    favAdded: "⭐ В избранном!", favRemoved: "Удалено", favorites: "Избранное", calendar: "Календарь", stats: "Статистика",
    totalDreams: "Снов", analyzed: "Анализов", mysteryScore: "Тайна",
    moodOverview: "Настроение", positive: "Позитив", neutral: "Нейтраль", stress: "Стресс",
    commonSymbols: "Частые символы", aiCoach: "🤖 Создать инсайт",
    insightLocked: "🔒 Расширенные инсайты", insightLockedDesc: "Обновитесь до Pro или Elite.",
    upgradePlan: "⭐ Улучшить тариф",
    settingsTitle: "Настройки", accountTab: "Аккаунт", planTab: "Тариф",
    themeTab: "Тема", langTab: "Язык", aboutTab: "О нас",
    currentUsage: "Осталось", remaining: "осталось",
    promoCode: "Промокод 🎟", enterPromo: "Введите промокод...", applyBtn: "Применить",
    invalidPromo: "❌ Неверный промокод.", promoOk: "✅ Добавлено!",
    buyContact: "Купите тариф в Telegram и получите промокод.",
    contactBtn: "📲 Купить в Telegram", planStarter: "Стартер", planPro: "Про ⭐", planElite: "Элит",
    analyzesPlan: "анализов", popular: "ПОПУЛЯРНЫЙ",
    themeDark: "🌙 Тёмная", themeLight: "☀️ Светлая", langLabel: "Язык",
    aboutText: "DreamDecoder v9.0\nИслам · Психология · Библия\nGoogle Gemini AI\n© 2025 DreamDecoder",
    subLogs: "История покупок", noLogs: "Покупок нет.",
    overallInsight: "Персональный инсайт", noInsightData: "Проанализируйте 2+ снов.",
    payTitle: "Разблокировать 🔒", paySubtitle: "Анализы закончились",
    payDesc: "Купите тариф в Telegram.", havePromo: "Есть промокод?",
    requireLogin: "Создайте аккаунт.", loading: "Загрузка...",
    noTitle: "Введите название.", noDesc: "Опишите сон.",
    noDreamsCalendar: "Снов нет.", streakDays: "дней подряд 🔥",
    enableNotif: "🔔 Включить напоминания", notifEnabled: "✅ Напоминания включены!",
    notifDenied: "❌ Разрешите уведомления.",
  },
  uz: {
    appName: "DreamDecoder", tagline: "Islomiy · Psixologiya · Bibliya",
    login: "Kirish", register: "Ro'yxat", logout: "Chiqish",
    forgotPass: "Parolni unutdingizmi?", resetPass: "Parolni tiklash",
    sendResetCode: "📧 Kod yuborish", newPassword: "Yangi parol",
    confirmReset: "✅ Tiklash va kirish", resetSent: "✅ Kod yuborildi!",
    resetSuccess: "✅ Parol tiklandi!", signInGoogle: "🔵 Google orqali kirish",
    username: "Ism", email: "Email (@gmail.com)", password: "Parol (min 6)",
    loginBtn: "🔑 Kirish", registerBtn: "📝 Hisob yaratish",
    verifyTitle: "Gmailni tekshiring 📧", verifyMsg: "Kod yuborildi:",
    verifyInput: "6 xonali kodni kiriting", verifyBtn: "✅ Tasdiqlash",
    verifyResend: "Qayta yuborish", verifyBack: "← Orqaga", verifyExpire: "Kod 10 daqiqa amal qiladi.",
    notVerified: "❌ Noto'g'ri kod.", codeExpired: "❌ Kod muddati tugagan.",
    emailExists: "❌ Email band. Kiring.", usernameExists: "❌ Ism band.",
    noAccount: "❌ Hisob topilmadi. Ro'yxatdan o'ting.", wrongPass: "❌ Noto'g'ri parol.",
    invalidEmail: "❌ Email @gmail.com bilan tugashi kerak", shortPass: "❌ Min. 6 belgi.",
    emptyField: "❌ Barcha maydonlarni to'ldiring.", networkErr: "❌ Tarmoq xatosi.",
    accountActive: "✅ Xush kelibsiz!", registered: "✅ Kod Gmailga yuborildi!",
    codeSent: "✅ Yangi kod yuborildi!", analyzesLeft: "tahlil qoldi", plan: "Tarif",
    analyzeBtn: "✨ Tushni tahlil qilish", analyzeBtnLock: "🔒 Ko'proq tahlil",
    newDream: "Yangi tush", history: "Tarix", insights: "Tahlillar",
    dictionary: "Lug'at", home: "Asosiy", settings: "Sozlamalar",
    dreamTitle: "Sarlavha", dreamDesc: "Tushni tasvirlab bering", dreamEmo: "Qanday his qildingiz?",
    dreamLoc: "Joy (ixtiyoriy)", dreamPeople: "Odamlar (ixtiyoriy)", dreamObj: "Narsalar (ixtiyoriy)",
    analyzeNow: "🔍 Tahlil qilish", clearText: "🗑 Tozalash", back: "← Orqaga",
    connecting: "🔮 Tahlil qilinmoqda...",
    allViews: "🌐 Barchasi", islamic: "☪️ Islomiy", psych: "🧠 Psixo", biblical: "✝️ Bibliya", advice: "💡 Maslahat",
    copy: "📋 Nusxa", copied: "✓ Nusxalandi!", whatsapp: "💬 WhatsApp", telegram: "✈️ Telegram", print: "📄 PDF",
    searchDreams: "🔍 Qidirish...", noDreams: "Tushlar yo'q. + bosing!", noMatch: "Topilmadi.",
    interpreted: "✓ Tahlil qilingan", notAnalyzed: "Tahlil yo'q", deleteDream: "O'chirasizmi?",
    favAdded: "⭐ Sevimliga qo'shildi!", favRemoved: "O'chirildi", favorites: "Sevimlilar", calendar: "Kalendar", stats: "Statistika",
    totalDreams: "Tushlar", analyzed: "Tahlil", mysteryScore: "Sirlilik",
    moodOverview: "Kayfiyat", positive: "Ijobiy", neutral: "Neytral", stress: "Stress",
    commonSymbols: "Tez-tez belgilar", aiCoach: "🤖 Tahlil yaratish",
    insightLocked: "🔒 Kengaytirilgan tahlillar", insightLockedDesc: "Pro yoki Elite tarifiga o'ting.",
    upgradePlan: "⭐ Tarifni yaxshilash",
    settingsTitle: "Sozlamalar", accountTab: "Hisob", planTab: "Tarif",
    themeTab: "Mavzu", langTab: "Til", aboutTab: "Haqida",
    currentUsage: "Qolgan tahlillar", remaining: "qoldi",
    promoCode: "Promo kod 🎟", enterPromo: "Promo kodni kiriting...", applyBtn: "Qo'llash",
    invalidPromo: "❌ Noto'g'ri promo kod.", promoOk: "✅ Balansga qo'shildi!",
    buyContact: "Tarif uchun Telegramda yozing.",
    contactBtn: "📲 Telegramda sotib olish", planStarter: "Starter", planPro: "Pro ⭐", planElite: "Elite",
    analyzesPlan: "tahlil", popular: "MASHHUR",
    themeDark: "🌙 Qoʻngʻir", themeLight: "☀️ Yorqin", langLabel: "Til",
    aboutText: "DreamDecoder v9.0\nIslomiy · Psixologiya · Bibliya\nGoogle Gemini AI\n© 2025 DreamDecoder",
    subLogs: "Xaridlar tarixi", noLogs: "Xaridlar yo'q.",
    overallInsight: "Shaxsiy tahlil", noInsightData: "2+ tush tahlil qiling.",
    payTitle: "Ochish 🔒", paySubtitle: "Tahlillar tugadi",
    payDesc: "Telegramda tarif xarid qiling.", havePromo: "Promo kodingiz bormi?",
    requireLogin: "Boshlash uchun hisob yarating.", loading: "Yuklanmoqda...",
    noTitle: "Sarlavha kiriting.", noDesc: "Tushni tasvirlab bering.",
    noDreamsCalendar: "Tushlar yo'q.", streakDays: "kun ketma-ket 🔥",
    enableNotif: "🔔 Ertalabki eslatmalar", notifEnabled: "✅ Eslatmalar yoqildi!",
    notifDenied: "❌ Brauzer sozlamalarida ruxsat bering.",
  }
};

function makeS(isDark, bg, cardBg, textCol, subCol, borderCol) {
  return {
    app: { minHeight: "100vh", background: bg, color: textCol, fontFamily: "'Segoe UI',sans-serif", maxWidth: "480px", margin: "0 auto" },
    hdr: { padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: isDark ? "rgba(7,7,26,0.92)" : "rgba(240,240,255,0.92)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${borderCol}`, position: "sticky", top: 0, zIndex: 10 },
    logo: { fontSize: "18px", fontWeight: "bold", color: C.gold },
    card: { background: cardBg, border: `1px solid ${borderCol}`, borderRadius: "14px", padding: "16px", marginBottom: "12px" },
    nav: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: "480px", background: isDark ? "rgba(7,7,26,0.96)" : "rgba(240,240,255,0.96)", backdropFilter: "blur(16px)", borderTop: `1px solid ${borderCol}`, display: "flex", zIndex: 20 },
    navB: (a) => ({ flex: 1, background: "none", border: "none", color: a ? C.gold : subCol, cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "10px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }),
    body: { padding: "16px 20px 90px" },
    inp: { width: "100%", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${borderCol}`, borderRadius: "10px", padding: "12px 14px", color: textCol, fontSize: "14px", fontFamily: "inherit", boxSizing: "border-box", marginBottom: "10px", outline: "none" },
    lbl: { fontSize: "11px", color: subCol, marginBottom: "5px", display: "block", letterSpacing: "0.8px", textTransform: "uppercase" },
    gradBtn: { background: "linear-gradient(135deg,#7c5cbf,#4a90d9)", border: "none", borderRadius: "12px", padding: "14px 20px", color: "#fff", fontFamily: "inherit", fontSize: "15px", cursor: "pointer", width: "100%", marginBottom: "10px", fontWeight: "bold" },
    outBtn: (col) => ({ background: "transparent", border: `1.5px solid ${col || borderCol}`, borderRadius: "10px", padding: "11px 16px", color: col || subCol, fontFamily: "inherit", fontSize: "13px", cursor: "pointer", width: "100%", marginBottom: "8px" }),
    smBtn: (col) => ({ background: `${col}22`, border: `1px solid ${col}44`, borderRadius: "8px", padding: "9px 14px", color: col, fontFamily: "inherit", fontSize: "12px", cursor: "pointer" }),
    backBtn: { background: "none", border: "none", color: C.gold, cursor: "pointer", fontFamily: "inherit", fontSize: "14px", padding: "0" },
    tag: (col) => ({ display: "inline-block", background: `${col}22`, border: `1px solid ${col}44`, borderRadius: "6px", padding: "3px 9px", fontSize: "11px", color: col, marginRight: "5px", marginBottom: "3px" }),
    msg: (ok) => ({ fontSize: "13px", color: ok ? C.green : C.red, marginBottom: "12px", padding: "10px 14px", background: ok ? "rgba(76,175,80,0.1)" : "rgba(201,80,80,0.1)", borderRadius: "8px", border: `1px solid ${ok ? "rgba(76,175,80,0.3)" : "rgba(201,80,80,0.3)"}` }),
  };
}

export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem("dd9_lang") || "en");
  const [theme, setTheme] = useState(() => localStorage.getItem("dd9_theme") || "dark");
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem("dd9_session") || "null"); } catch { return null; } });
  const [screen, setScreen] = useState("home");
  const [history, setHistory] = useState(["home"]);
  const [dreams, setDreams] = useState([]);
  const [usage, setUsageRaw] = useState({ count: 0, analyzes: FREE_LIMIT, plan: "free", subLogs: [] });
  const [selected, setSelected] = useState(null);
  const [interpView, setInterpView] = useState("all");
  const [loaded, setLoaded] = useState(false);

  const t = T[lang];
  const isDark = theme !== "light";
  const bg = isDark ? C.bg : "#f0f0ff";
  const cardBg = isDark ? C.card : "rgba(0,0,0,0.04)";
  const textCol = isDark ? C.text : "#1a1a3a";
  const subCol = isDark ? C.sub : "#5a5a8a";
  const borderCol = isDark ? C.border : "rgba(0,0,0,0.1)";
  const S = makeS(isDark, bg, cardBg, textCol, subCol, borderCol);
  const remaining = Math.max(0, usage.analyzes - usage.count);
  const isPremium = usage.plan !== "free";

  useEffect(() => { localStorage.setItem("dd9_lang", lang); }, [lang]);
  useEffect(() => { localStorage.setItem("dd9_theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("dd9_session", JSON.stringify(session)); }, [session]);

  useEffect(() => {
    if (!session?.uid) return;
    fsGet("users", session.uid).then(d => {
      if (d) {
        setUsageRaw({ count: Number(d.count) || 0, analyzes: Number(d.analyzes) || FREE_LIMIT, plan: d.plan || "free", subLogs: d.subLogs || [] });
        setDreams(d.dreams || []);
      } else {
        // First login — create user data
        fsPatch("users", session.uid, { count: 0, analyzes: FREE_LIMIT, plan: "free", subLogs: "[]", dreams: "[]", email: session.email, username: session.username });
      }
      setLoaded(true);
    });
  }, [session?.uid]);

  async function persist(nu, nd) {
    if (!session?.uid) return;
    try { localStorage.setItem("dd9_" + session.uid, JSON.stringify({ ...nu, dreams: nd })); } catch {}
    await fsPatch("users", session.uid, { count: nu.count, analyzes: nu.analyzes, plan: nu.plan, subLogs: nu.subLogs || [], dreams: nd, email: session.email, username: session.username });
  }

  function setUsage(fn) { setUsageRaw(p => { const n = typeof fn === "function" ? fn(p) : fn; persist(n, dreams); return n; }); }
  function addDream(d) { const nd = [d, ...dreams]; setDreams(nd); persist(usage, nd); }
  function delDream(id) { const nd = dreams.filter(x => x.id !== id); setDreams(nd); persist(usage, nd); }
  function toggleFav(id) { const nd = dreams.map(d => d.id === id ? { ...d, favorite: !d.favorite } : d); setDreams(nd); persist(usage, nd); }
  function nav(sc) { setHistory(h => [...h, sc]); setScreen(sc); }
  function goBack() { setHistory(h => { const nh = h.slice(0, -1); setScreen(nh[nh.length - 1] || "home"); return nh.length ? nh : ["home"]; }); }

  if (!session) return <AuthScreen S={S} C={C} t={t} lang={lang} setLang={setLang} T={T} setSession={setSession} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} />;
  if (!loaded) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px", minHeight: "100vh" }}><div style={{ fontSize: "52px" }}>🌙</div><div style={{ color: C.gold }}>{t.loading}</div></div>;
  if (screen === "paywall") return <Paywall S={S} C={C} t={t} usage={usage} setUsage={setUsage} setScreen={setScreen} goBack={goBack} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} PLANS={PLANS} />;
  if (screen === "analyze") return <Analyze S={S} C={C} t={t} addDream={addDream} nav={nav} setSelected={setSelected} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} MOODS={MOODS} usage={usage} setUsage={setUsage} remaining={remaining} goBack={goBack} toPaywall={() => nav("paywall")} />;
  if (screen === "result" && selected) return <Result S={S} C={C} t={t} dream={selected} nav={nav} interpView={interpView} setInterpView={setInterpView} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} goBack={goBack} toggleFav={toggleFav} />;
  if (screen === "history") return <HistoryScreen S={S} C={C} t={t} dreams={dreams} delDream={delDream} setSelected={setSelected} nav={nav} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} goBack={goBack} toggleFav={toggleFav} />;
  if (screen === "insights") return <Insights S={S} C={C} t={t} dreams={dreams} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} goBack={goBack} lang={lang} isPremium={isPremium} nav={nav} />;
  if (screen === "dictionary") return <Dictionary S={S} C={C} t={t} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} goBack={goBack} />;
  if (screen === "settings") return <Settings S={S} C={C} t={t} T={T} session={session} setSession={setSession} theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} usage={usage} setUsage={setUsage} PLANS={PLANS} goBack={goBack} dreams={dreams} />;

  const favs = dreams.filter(d => d.favorite);
  const streak = calcStreak(dreams);
  return (
    <div style={S.app}>
      <div style={S.hdr}>
        <span style={S.logo}>🌙 {t.appName}</span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {streak > 1 && <span style={{ fontSize: "12px", color: C.gold }}>🔥{streak}</span>}
          <span style={{ fontSize: "12px", color: subCol }}>👤 {session.username}</span>
          <button onClick={() => nav("settings")} style={{ background: "none", border: `1px solid ${borderCol}`, borderRadius: "8px", padding: "5px 10px", color: subCol, cursor: "pointer", fontSize: "12px", fontFamily: "inherit" }}>⚙️</button>
        </div>
      </div>
      <div style={S.body}>
        <div style={{ background: "linear-gradient(135deg,rgba(124,92,191,0.3),rgba(74,144,217,0.3))", borderRadius: "18px", padding: "24px 20px", textAlign: "center", marginBottom: "20px", border: `1px solid ${borderCol}` }}>
          <div style={{ fontSize: "44px", marginBottom: "6px" }}>🌙</div>
          <div style={{ fontSize: "20px", fontWeight: "bold", color: C.gold, marginBottom: "4px" }}>{t.appName}</div>
          <div style={{ fontSize: "12px", color: subCol, marginBottom: "12px" }}>{t.tagline}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: remaining <= 2 ? "rgba(201,80,80,0.15)" : "rgba(76,175,80,0.12)", border: `1px solid ${remaining <= 2 ? C.red + "55" : C.green + "55"}`, borderRadius: "20px", padding: "5px 14px", marginBottom: "14px" }}>
            <span style={{ fontSize: "13px", color: remaining <= 2 ? C.red : C.green, fontWeight: "600" }}>✨ {remaining} {t.analyzesLeft}</span>
          </div>
          <button style={S.gradBtn} onClick={() => remaining <= 0 ? nav("paywall") : nav("analyze")}>{remaining <= 0 ? t.analyzeBtnLock : t.analyzeBtn}</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
          {[["📜", t.history, "history"], ["📊", t.insights, "insights"], ["🔍", t.dictionary, "dictionary"], ["⚙️", t.settings, "settings"]].map(([ic, lb, sc]) => (
            <button key={sc} onClick={() => nav(sc)} style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: "14px", padding: "14px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "5px", outline: "none" }}>
              <span style={{ fontSize: "22px" }}>{ic}</span>
              <span style={{ fontSize: "13px", color: textCol, fontWeight: "500" }}>{lb}</span>
            </button>
          ))}
        </div>
        {favs.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "14px", fontWeight: "600", color: C.gold, marginBottom: "10px" }}>⭐ {t.favorites}</div>
            <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px" }}>
              {favs.map(d => (
                <div key={d.id} onClick={() => { setSelected(d); nav("result"); }} style={{ minWidth: "140px", background: cardBg, border: `1px solid ${C.gold}44`, borderRadius: "12px", padding: "12px", cursor: "pointer", flexShrink: 0 }}>
                  <div style={{ fontSize: "18px", marginBottom: "4px" }}>{d.mood?.split(" ")[0] || "🌙"}</div>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: textCol, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
                  <div style={{ fontSize: "10px", color: subCol, marginTop: "3px" }}>{fmtDate(d.timestamp)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {dreams.length > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: textCol }}>Recent Dreams</span>
              <button onClick={() => nav("history")} style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", fontSize: "12px", fontFamily: "inherit" }}>See all →</button>
            </div>
            {dreams.slice(0, 3).map(d => (
              <div key={d.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => { setSelected(d); nav("result"); }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div><div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "3px" }}>{d.title}</div><div style={{ fontSize: "11px", color: subCol }}>{fmtFull(d.timestamp)}</div></div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {d.favorite && <span style={{ fontSize: "14px" }}>⭐</span>}
                    <span style={{ fontSize: "20px" }}>{d.mood?.split(" ")[0] || "🌙"}</span>
                  </div>
                </div>
                {d.scores && <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                  <span style={S.tag(C.purple)}>⭐{d.scores.mystery}/10</span>
                  <span style={S.tag(C.blue)}>❤️{d.scores.emotion}/10</span>
                </div>}
              </div>
            ))}
          </>
        )}
      </div>
      <BottomNav screen="home" nav={nav} S={S} t={t} />
    </div>
  );
}

function calcStreak(dreams) {
  if (!dreams.length) return 0;
  const days = [...new Set(dreams.map(d => fmtDay(d.timestamp)))].sort().reverse();
  let streak = 0; let cur = new Date(); cur.setHours(0, 0, 0, 0);
  for (const day of days) {
    const d = new Date(day); d.setHours(0, 0, 0, 0);
    if (Math.round((cur - d) / 86400000) <= 1) { streak++; cur = d; } else break;
  }
  return streak;
}

function AuthScreen({ S, C, t, lang, setLang, T, setSession, isDark, textCol, subCol, borderCol }) {
  const [mode, setMode] = useState("register");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  const [codeStep, setCodeStep] = useState(null);
  const [enteredCode, setEnteredCode] = useState("");
  const [resetStep, setResetStep] = useState(null);
  const [resetForm, setResetForm] = useState({ email: "", code: "", newPass: "", codeEntered: false });
  const codeRef = useRef(null);

  function err(m) { setMsg(m); setOk(false); setBusy(false); }
  function succ(m) { setMsg(m); setOk(true); setBusy(false); }

  async function handleGoogle() {
    setBusy(true); setMsg("");
    try {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=728040509147-q617oh6ung4m7qtgbsntqfr98uvu3mos.apps.googleusercontent.com` +
        `&redirect_uri=${encodeURIComponent(window.location.origin)}` +
        `&response_type=token&scope=email%20profile&prompt=select_account`;
      const popup = window.open(authUrl, "googleSignIn", "width=500,height=600,scrollbars=yes");
      if (!popup) { err("❌ Popup blocked. Allow popups for this site."); return; }
      const timer = setInterval(async () => {
        try {
          const url = popup.location.href;
          if (url.includes("access_token")) {
            clearInterval(timer); popup.close();
            const token = new URLSearchParams(url.split("#")[1]).get("access_token");
            const info = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${token}`).then(r => r.json());
            const gEmail = info.email || ""; const gName = info.name || gEmail.split("@")[0];
            const fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FB_KEY}`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ postBody: `access_token=${token}&providerId=google.com`, requestUri: window.location.origin, returnSecureToken: true })
            }).then(r => r.json());
            if (fbRes.error) { err("❌ " + fbRes.error.message); return; }
            saveEmail(gEmail, fbRes.localId, gName);
            localStorage.setItem("dd9_umap_" + fbRes.localId, gName);
            succ(t.accountActive);
            setTimeout(() => setSession({ uid: fbRes.localId, email: gEmail, username: gName, idToken: fbRes.idToken }), 600);
          }
        } catch {}
        if (popup.closed) { clearInterval(timer); setBusy(false); }
      }, 500);
    } catch (e) { err("❌ " + e.message); }
  }

  async function handleRegister() {
    const { username, email, password } = form;
    if (!username.trim() || !email.trim() || !password.trim()) return err(t.emptyField);
    if (!/^[^@]+@gmail\.com$/i.test(email)) return err(t.invalidEmail);
    if (password.length < 6) return err(t.shortPass);
    setBusy(true); setMsg("");
    if (emailRegistered(email)) return err(t.emailExists);
    if (usernameRegistered(username)) return err(t.usernameExists);
    const res = await fbRegister(email, password);
    if (res.error) {
      const m = res.error.message || "";
      if (m.includes("EMAIL_EXISTS")) return err(t.emailExists);
      if (m.includes("NETWORK")) return err(t.networkErr);
      return err("❌ " + m);
    }
    const code = genCode(); const expires = Date.now() + 10 * 60 * 1000;
    const sent = await sendEmail(email, username, code);
    setCodeStep({ email, username, password, code, expires, fbData: res, fallback: !sent });
    succ(t.registered);
    setTimeout(() => codeRef.current?.focus(), 300);
  }

  async function handleLogin() {
    const { email, password } = form;
    if (!email.trim() || !password.trim()) return err(t.emptyField);
    if (!/^[^@]+@gmail\.com$/i.test(email)) return err(t.invalidEmail);
    setBusy(true); setMsg("");
    const res = await fbLogin(email, password);
    if (res.error) {
      const m = res.error.message || "";
      if (m.includes("EMAIL_NOT_FOUND") || m.includes("INVALID_LOGIN_CREDENTIALS") || m.includes("USER_NOT_FOUND")) return err(t.noAccount);
      if (m.includes("INVALID_PASSWORD") || m.includes("WRONG_PASSWORD")) return err(t.wrongPass);
      if (m.includes("NETWORK")) {
        const rec = emailRegistered(email);
        if (!rec) return err(t.noAccount);
        const uname = localStorage.getItem("dd9_umap_" + rec.uid) || email.split("@")[0];
        succ(t.accountActive);
        setTimeout(() => setSession({ uid: rec.uid, email, username: uname, idToken: "local_" + Date.now() }), 600);
        return;
      }
      return err("❌ " + m);
    }
    const rec = emailRegistered(email);
    const uname = localStorage.getItem("dd9_umap_" + res.localId) || rec?.username || email.split("@")[0];
    succ(t.accountActive);
    setTimeout(() => setSession({ uid: res.localId, email, username: uname, idToken: res.idToken }), 600);
    setBusy(false);
  }

  async function verifyCode() {
    if (!codeStep) return;
    if (Date.now() > codeStep.expires) { err(t.codeExpired); setCodeStep(null); return; }
    if (enteredCode.trim() !== codeStep.code) { err(t.notVerified); return; }
    saveEmail(codeStep.email, codeStep.fbData.localId, codeStep.username);
    localStorage.setItem("dd9_umap_" + codeStep.fbData.localId, codeStep.username);
    succ(t.accountActive);
    setTimeout(() => setSession({ uid: codeStep.fbData.localId, email: codeStep.email, username: codeStep.username, idToken: codeStep.fbData.idToken }), 600);
  }

  async function resendCode() {
    if (!codeStep) return;
    const code = genCode(); const expires = Date.now() + 10 * 60 * 1000;
    const sent = await sendEmail(codeStep.email, codeStep.username, code);
    setCodeStep({ ...codeStep, code, expires, fallback: !sent });
    setEnteredCode(""); succ(t.codeSent);
  }

  async function sendResetCode() {
    if (!resetForm.email.trim()) return err(t.emptyField);
    if (!/^[^@]+@gmail\.com$/i.test(resetForm.email)) return err(t.invalidEmail);
    setBusy(true); setMsg("");
    const code = genCode(); const expires = Date.now() + 10 * 60 * 1000;
    const rec = emailRegistered(resetForm.email);
    const uname = rec?.username || resetForm.email.split("@")[0];
    const sent = await sendEmail(resetForm.email, uname, code);
    setResetStep({ email: resetForm.email, code, expires, uid: rec?.uid, uname, fallback: !sent });
    setResetForm(f => ({ ...f, codeEntered: true }));
    succ(t.resetSent); setBusy(false);
  }

  async function confirmReset() {
    if (!resetStep) return;
    if (Date.now() > resetStep.expires) { err(t.codeExpired); setResetStep(null); return; }
    if (resetForm.code.trim() !== resetStep.code) { err(t.notVerified); return; }
    if (resetForm.newPass.length < 6) { err(t.shortPass); return; }
    setBusy(true); setMsg("");
    succ(t.resetSuccess);
    setTimeout(() => { setResetStep(null); setResetForm({ email: "", code: "", newPass: "", codeEntered: false }); setMode("login"); setMsg(""); }, 1500);
    setBusy(false);
  }

  // Forgot password screen - just ask email, Firebase sends reset link
  if (resetStep !== null) return (
    <div style={S.app}>
      <div style={{ ...S.hdr, justifyContent: "center" }}><span style={S.logo}>🌙 {t.appName}</span></div>
      <div style={S.body}>
        <button style={S.backBtn} onClick={() => { setResetStep(null); setMsg(""); }}>{t.back}</button>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: "48px", marginBottom: "10px" }}>🔐</div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: textCol, marginBottom: "6px" }}>{t.resetPass}</div>
          <div style={{ fontSize: "13px", color: subCol }}>Firebase will send a reset link to your Gmail</div>
        </div>
        <label style={S.lbl}>{t.email}</label>
        <input style={S.inp} placeholder="your@gmail.com" value={resetForm.email} onChange={e => setResetForm(f => ({ ...f, email: e.target.value }))} />
        {msg && <div style={S.msg(ok)}>{msg}</div>}
        <button style={S.gradBtn} onClick={sendResetCode} disabled={busy}>{busy ? "⏳..." : "📧 Send Reset Link"}</button>
      </div>
    </div>
  );

  // Email verification waiting screen
  if (codeStep) return (
    <div style={S.app}>
      <div style={{ ...S.hdr, justifyContent: "center" }}><span style={S.logo}>🌙 {t.appName}</span></div>
      <div style={S.body}>
        <div style={{ textAlign: "center", padding: "20px 0 20px" }}>
          <div style={{ fontSize: "56px", marginBottom: "12px" }}>📧</div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: textCol, marginBottom: "6px" }}>{t.verifyTitle}</div>
          <div style={{ fontSize: "13px", color: subCol, marginBottom: "4px" }}>Verification email sent to:</div>
          <div style={{ fontSize: "15px", color: C.gold, fontWeight: "600", marginBottom: "16px" }}>{codeStep.email}</div>
          <div style={{ ...S.card, textAlign: "left" }}>
            <div style={{ fontSize: "13px", color: textCol, lineHeight: "2" }}>
              1. Open your Gmail inbox<br/>
              2. Click the verification link from Firebase<br/>
              3. Come back and tap the button below ✅
            </div>
          </div>
        </div>
        {msg && <div style={S.msg(ok)}>{msg}</div>}
        <button style={S.gradBtn} onClick={checkEmailVerified} disabled={busy}>{busy ? "🔍 Checking..." : "✅ I verified my email — Continue"}</button>
        <button style={S.outBtn(subCol)} onClick={resendVerificationEmail}>{t.verifyResend}</button>
        <button style={S.outBtn(C.red)} onClick={() => { setCodeStep(null); setMsg(""); }}>{t.verifyBack}</button>
      </div>
    </div>
  );

  return (
    <div style={S.app}>
      <div style={{ ...S.hdr, justifyContent: "center", flexDirection: "column", gap: "4px", padding: "20px" }}>
        <span style={S.logo}>🌙 {t.appName}</span>
        <span style={{ fontSize: "12px", color: subCol }}>{t.tagline}</span>
      </div>
      <div style={S.body}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", justifyContent: "center" }}>
          {Object.keys(T).map(l => (
            <button key={l} onClick={() => setLang(l)} style={{ padding: "6px 16px", borderRadius: "20px", border: `1.5px solid ${lang === l ? C.gold : borderCol}`, background: lang === l ? `${C.gold}22` : "transparent", color: lang === l ? C.gold : subCol, cursor: "pointer", fontSize: "13px", fontFamily: "inherit", fontWeight: lang === l ? "bold" : "normal" }}>
              {l === "en" ? "🇬🇧 EN" : l === "ru" ? "🇷🇺 RU" : "🇺🇿 UZ"}
            </button>
          ))}
        </div>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "52px", marginBottom: "8px" }}>🌙</div>
          <div style={{ fontSize: "13px", color: subCol }}>{t.requireLogin}</div>
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {["register", "login"].map(m => (
            <button key={m} onClick={() => { setMode(m); setMsg(""); }} style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${mode === m ? C.gold : borderCol}`, background: mode === m ? `${C.gold}15` : "transparent", color: mode === m ? C.gold : subCol, cursor: "pointer", fontFamily: "inherit", fontSize: "14px", fontWeight: mode === m ? "bold" : "normal" }}>
              {m === "register" ? t.register : t.login}
            </button>
          ))}
        </div>
        <button onClick={handleGoogle} disabled={busy} style={{ width: "100%", background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)", border: `1.5px solid ${borderCol}`, borderRadius: "12px", padding: "13px", color: textCol, fontFamily: "inherit", fontSize: "14px", cursor: "pointer", marginBottom: "4px" }}>
          {t.signInGoogle}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "12px 0" }}>
          <div style={{ flex: 1, height: "1px", background: borderCol }} /><div style={{ fontSize: "12px", color: subCol }}>or</div><div style={{ flex: 1, height: "1px", background: borderCol }} />
        </div>
        {mode === "register" && <><label style={S.lbl}>{t.username}</label><input style={S.inp} placeholder={t.username} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></>}
        <label style={S.lbl}>{t.email}</label>
        <input style={S.inp} placeholder="your@gmail.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoCapitalize="none" autoCorrect="off" />
        <label style={S.lbl}>{t.password}</label>
        <input type="password" style={S.inp} placeholder="••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} onKeyDown={e => e.key === "Enter" && (mode === "register" ? handleRegister() : handleLogin())} />
        {mode === "login" && <button onClick={() => { setResetStep({}); setResetForm({ email: form.email, code: "", newPass: "", codeEntered: false }); setMsg(""); }} style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", fontFamily: "inherit", fontSize: "13px", padding: "0 0 10px", textDecoration: "underline" }}>{t.forgotPass}</button>}
        {msg && <div style={S.msg(ok)}>{msg}</div>}
        <button style={S.gradBtn} onClick={mode === "register" ? handleRegister : handleLogin} disabled={busy}>{busy ? "⏳ Please wait..." : mode === "register" ? t.registerBtn : t.loginBtn}</button>
      </div>
    </div>
  );
}

function Analyze({ S, C, t, addDream, nav, setSelected, isDark, textCol, subCol, borderCol, MOODS, usage, setUsage, remaining, goBack, toPaywall }) {
  const [form, setForm] = useState({ title: "", dream: "", mood: "", location: "", people: "", objects: "" });
  const [busy, setBusy] = useState(false); const [errMsg, setErrMsg] = useState("");
  async function analyze() {
    if (!form.title.trim()) { setErrMsg(t.noTitle); return; }
    if (!form.dream.trim()) { setErrMsg(t.noDesc); return; }
    if (remaining <= 0) { toPaywall(); return; }
    setBusy(true); setErrMsg("");
    const prompt = SYSTEM_PROMPT + `\n\nDream Title: "${form.title}"\nMood: "${form.mood || "Not specified"}"\nLocation: "${form.location || "Not specified"}"\nPeople: "${form.people || "Not specified"}"\nObjects: "${form.objects || "Not specified"}"\n\nDream:\n"${form.dream}"`;
    const txt = await callGemini(prompt);
    const scores = parseScores(txt);
    const d = { id: Date.now() + Math.random(), title: form.title, dream: form.dream, mood: form.mood, location: form.location, people: form.people, objects: form.objects, timestamp: new Date().toISOString(), interpretation: txt, scores, favorite: false };
    addDream(d); setUsage(u => ({ ...u, count: u.count + 1 })); setSelected(d); nav("result"); setBusy(false);
  }
  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>✍️ {t.newDream}</span><span style={{ fontSize: "12px", color: remaining <= 2 ? C.red : C.green, fontWeight: "600" }}>✨{remaining}</span></div>
      <div style={S.body}>
        <label style={S.lbl}>{t.dreamTitle} *</label>
        <input style={S.inp} placeholder="e.g. Flying over a city..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        <label style={S.lbl}>{t.dreamDesc} *</label>
        <textarea style={{ ...S.inp, minHeight: "130px", resize: "vertical" }} placeholder="Describe everything you remember..." value={form.dream} onChange={e => setForm(f => ({ ...f, dream: e.target.value }))} />
        <label style={S.lbl}>{t.dreamEmo}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "14px" }}>
          {MOODS.map(m => <button key={m} style={{ padding: "6px 12px", borderRadius: "16px", border: `1px solid ${form.mood === m ? C.gold : borderCol}`, background: form.mood === m ? `${C.gold}22` : "transparent", color: form.mood === m ? C.gold : subCol, cursor: "pointer", fontSize: "12px", fontFamily: "inherit" }} onClick={() => setForm(f => ({ ...f, mood: m }))}>{m}</button>)}
        </div>
        <label style={S.lbl}>{t.dreamLoc}</label>
        <input style={S.inp} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
        <label style={S.lbl}>{t.dreamPeople}</label>
        <input style={S.inp} value={form.people} onChange={e => setForm(f => ({ ...f, people: e.target.value }))} />
        <label style={S.lbl}>{t.dreamObj}</label>
        <input style={S.inp} value={form.objects} onChange={e => setForm(f => ({ ...f, objects: e.target.value }))} />
        {errMsg && <div style={S.msg(false)}>{errMsg}</div>}
        <div style={{ height: "1px", background: borderCol, margin: "14px 0" }} />
        <button style={S.gradBtn} onClick={analyze} disabled={busy}>{busy ? t.connecting : t.analyzeNow}</button>
        <button style={S.outBtn(C.red)} onClick={() => setForm({ title: "", dream: "", mood: "", location: "", people: "", objects: "" })}>{t.clearText}</button>
      </div>
    </div>
  );
}

function Result({ S, C, t, dream, nav, interpView, setInterpView, isDark, textCol, subCol, borderCol, goBack, toggleFav }) {
  const [copied, setCopied] = useState(false);
  function getLines(txt, sec) {
    const all = txt.split("\n").filter(l => l.trim());
    if (sec === "all") return all;
    const map = { islamic: "ISLAMIC VIEW", psych: "PSYCHOLOGICAL VIEW", biblical: "BIBLICAL VIEW", advice: "SPIRITUAL" };
    const kw = map[sec]; let cap = false, res = [];
    for (const line of all) {
      if (line.includes(kw)) { cap = true; res.push(line); continue; }
      if (cap) { if (["ISLAMIC VIEW", "PSYCHOLOGICAL VIEW", "BIBLICAL VIEW", "SPIRITUAL", "DREAM SCORE"].some(v => line.includes(v) && !line.includes(kw))) break; res.push(line); }
    }
    return res.length ? res : all;
  }
  function renderLine(line, i) {
    if (line.includes("ISLAMIC VIEW")) return <div key={i} style={{ color: "#c9a84c", fontWeight: "bold", background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: "8px", padding: "9px 13px", marginBottom: "6px", marginTop: "12px", fontSize: "14px" }}>☪️ ISLAMIC VIEW</div>;
    if (line.includes("PSYCHOLOGICAL VIEW")) return <div key={i} style={{ color: "#7cb8d4", fontWeight: "bold", background: "rgba(124,184,212,0.1)", border: "1px solid rgba(124,184,212,0.3)", borderRadius: "8px", padding: "9px 13px", marginBottom: "6px", marginTop: "12px", fontSize: "14px" }}>🧠 PSYCHOLOGICAL VIEW</div>;
    if (line.includes("BIBLICAL VIEW")) return <div key={i} style={{ color: "#c4956a", fontWeight: "bold", background: "rgba(196,149,106,0.1)", border: "1px solid rgba(196,149,106,0.3)", borderRadius: "8px", padding: "9px 13px", marginBottom: "6px", marginTop: "12px", fontSize: "14px" }}>✝️ BIBLICAL VIEW</div>;
    if (line.includes("SPIRITUAL") && line.includes("ADVICE")) return <div key={i} style={{ color: "#7cd47c", fontWeight: "bold", background: "rgba(76,212,76,0.1)", border: "1px solid rgba(76,212,76,0.3)", borderRadius: "8px", padding: "9px 13px", marginBottom: "6px", marginTop: "12px", fontSize: "14px" }}>💡 SPIRITUAL & PRACTICAL ADVICE</div>;
    if (line.includes("Dream Summary")) return <div key={i} style={{ color: C.gold, fontWeight: "bold", fontSize: "15px", marginBottom: "6px" }}>{line}</div>;
    if (line.includes("DREAM SCORE")) return <div key={i} style={{ color: "#a070d0", fontWeight: "bold", fontSize: "13px", marginTop: "14px", marginBottom: "6px" }}>⭐ DREAM SCORE</div>;
    if (line.includes("FINAL DISCLAIMER") || line.includes("FINAL NOTE")) return <div key={i} style={{ color: subCol, fontSize: "12px", fontStyle: "italic", marginTop: "14px", borderTop: `1px solid ${borderCol}`, paddingTop: "12px" }}>{line.replace(/FINAL (DISCLAIMER|NOTE):?/, "").trim()}</div>;
    if (/^(Meaning|Symbols|Takeaway):/.test(line)) return <div key={i} style={{ color: subCol, fontSize: "11px", fontWeight: "bold", letterSpacing: "0.8px", marginTop: "8px", marginBottom: "3px", textTransform: "uppercase" }}>{line.split(":")[0]}</div>;
    if (line.startsWith("•") || line.startsWith("-")) return <div key={i} style={{ color: isDark ? "#c0b898" : "#4a4a6a", fontSize: "13px", paddingLeft: "12px", marginBottom: "4px", lineHeight: "1.6" }}>{line}</div>;
    if (/^(Mystery|Emotional|Symbol Richness)/i.test(line)) {
      const [lb, vl] = line.split(":"); const num = parseInt((vl || "").match(/\d+/)?.[0]) || 5;
      const col = num >= 8 ? C.green : num >= 5 ? C.gold : C.red;
      return <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: subCol, width: "130px", flexShrink: 0 }}>{lb}</span>
        <div style={{ flex: 1, height: "7px", borderRadius: "4px", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }}><div style={{ width: `${num * 10}%`, height: "100%", background: col, borderRadius: "4px" }} /></div>
        <span style={{ fontSize: "12px", color: col, width: "35px", textAlign: "right", fontWeight: "bold" }}>{num}/10</span>
      </div>;
    }
    return <div key={i} style={{ color: isDark ? "#c8c0b0" : "#3a3a5a", fontSize: "13px", lineHeight: "1.75", marginBottom: "4px" }}>{line}</div>;
  }
  return (
    <div style={S.app}>
      <div style={S.hdr}>
        <button style={S.backBtn} onClick={goBack}>{t.back}</button>
        <span style={{ fontSize: "14px", fontWeight: "600", color: textCol, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dream.title}</span>
        <button onClick={() => toggleFav(dream.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>{dream.favorite ? "⭐" : "☆"}</button>
      </div>
      <div style={S.body}>
        <div style={{ ...S.card, marginBottom: "14px" }}>
          <div style={{ fontSize: "12px", color: subCol, marginBottom: "6px" }}>🕐 {fmtFull(dream.timestamp)}</div>
          {dream.mood && <span style={S.tag(C.gold)}>{dream.mood}</span>}
          {dream.location && <span style={S.tag(C.blue)}>📍 {dream.location}</span>}
        </div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
          {[["all", t.allViews, C.purple], ["islamic", t.islamic, C.gold], ["psych", t.psych, "#7cb8d4"], ["biblical", t.biblical, "#c4956a"], ["advice", t.advice, "#7cd47c"]].map(([v, lb, col]) => (
            <button key={v} onClick={() => setInterpView(v)} style={{ padding: "6px 12px", borderRadius: "20px", border: `1.5px solid ${interpView === v ? col : `${col}44`}`, background: interpView === v ? `${col}22` : "transparent", color: interpView === v ? col : subCol, cursor: "pointer", fontSize: "12px", fontFamily: "inherit", fontWeight: interpView === v ? "bold" : "normal" }}>{lb}</button>
          ))}
        </div>
        <div style={{ ...S.card, lineHeight: "1.8" }}>{getLines(dream.interpretation || "", interpView).map((l, i) => renderLine(l, i))}</div>
        <div style={{ ...S.card, marginTop: "4px" }}>
          <div style={{ fontSize: "11px", color: subCol, marginBottom: "10px", fontWeight: "600" }}>SHARE & EXPORT</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <button style={S.smBtn(C.blue)} onClick={() => { navigator.clipboard.writeText(dream.interpretation || ""); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? t.copied : t.copy}</button>
            <button style={S.smBtn("#4caf50")} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent("🌙 " + dream.title + "\n\n" + dream.interpretation)}`)}>{t.whatsapp}</button>
            <button style={S.smBtn("#2ca5e0")} onClick={() => window.open(`https://t.me/share/url?text=${encodeURIComponent("🌙 " + dream.title + "\n\n" + dream.interpretation)}`)}>{t.telegram}</button>
            <button style={S.smBtn(C.purple)} onClick={() => window.print()}>{t.print}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryScreen({ S, C, t, dreams, delDream, setSelected, nav, isDark, textCol, subCol, borderCol, goBack, toggleFav }) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const filtered = dreams.filter(d => d.title.toLowerCase().includes(q.toLowerCase()) || d.dream?.toLowerCase().includes(q.toLowerCase()));
  const favs = filtered.filter(d => d.favorite);
  const today = new Date(); const year = today.getFullYear(); const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = today.toLocaleString("en-US", { month: "long", year: "numeric" });
  const calDays = {}; dreams.forEach(d => { const day = fmtDay(d.timestamp); calDays[day] = (calDays[day] || 0) + 1; });
  const total = dreams.length;
  const moodC = dreams.reduce((a, d) => { if (d.mood) a[d.mood] = (a[d.mood] || 0) + 1; return a; }, {});
  const streak = calcStreak(dreams);
  const analyzed = dreams.filter(d => d.interpretation).length;
  const avgM = dreams.filter(d => d.scores).reduce((a, d) => a + d.scores.mystery, 0) / Math.max(dreams.filter(d => d.scores).length, 1);

  function DreamCard({ d }) {
    return (
      <div style={{ ...S.card, cursor: "pointer" }} onClick={() => { setSelected(d); nav("result"); }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, paddingRight: "8px" }}><div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "3px" }}>{d.title}</div><div style={{ fontSize: "11px", color: subCol }}>{fmtFull(d.timestamp)}</div></div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
            <button onClick={e => { e.stopPropagation(); toggleFav(d.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", padding: "0" }}>{d.favorite ? "⭐" : "☆"}</button>
            <span style={{ fontSize: "20px" }}>{d.mood?.split(" ")[0] || "🌙"}</span>
          </div>
        </div>
        <div style={{ fontSize: "12px", color: subCol, marginTop: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.dream}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
          {d.interpretation ? <span style={{ fontSize: "11px", color: C.green }}>✓ {t.interpreted}</span> : <span style={{ fontSize: "11px", color: subCol }}>{t.notAnalyzed}</span>}
          <button onClick={e => { e.stopPropagation(); if (confirm(t.deleteDream)) delDream(d.id); }} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: "12px", fontFamily: "inherit" }}>🗑</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>📜 {t.history}</span><span style={{ fontSize: "12px", color: subCol }}>{dreams.length}</span></div>
      <div style={{ display: "flex", borderBottom: `1px solid ${borderCol}`, overflowX: "auto", scrollbarWidth: "none" }}>
        {[["all", "📜 All"], ["favorites", `⭐ ${t.favorites}`], ["calendar", `📅 ${t.calendar}`], ["stats", `📊 ${t.stats}`]].map(([id, lb]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flexShrink: 0, background: "none", border: "none", borderBottom: `2px solid ${tab === id ? C.gold : "transparent"}`, color: tab === id ? C.gold : subCol, padding: "10px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", whiteSpace: "nowrap" }}>{lb}</button>
        ))}
      </div>
      <div style={S.body}>
        {(tab === "all" || tab === "favorites") && <input style={S.inp} placeholder={t.searchDreams} value={q} onChange={e => setQ(e.target.value)} />}
        {tab === "all" && (filtered.length === 0 ? <div style={{ textAlign: "center", color: subCol, padding: "60px 20px" }}><div style={{ fontSize: "44px", marginBottom: "12px" }}>🌙</div><div>{q ? t.noMatch : t.noDreams}</div></div> : filtered.map(d => <DreamCard key={d.id} d={d} />))}
        {tab === "favorites" && (favs.length === 0 ? <div style={{ textAlign: "center", color: subCol, padding: "60px 20px" }}><div style={{ fontSize: "44px", marginBottom: "12px" }}>⭐</div><div>No favorites yet. Tap ☆ on any dream.</div></div> : favs.map(d => <DreamCard key={d.id} d={d} />))}
        {tab === "calendar" && (
          <div>
            <div style={{ ...S.card }}>
              <div style={{ fontWeight: "600", color: C.gold, marginBottom: "12px", textAlign: "center" }}>{monthName}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px", textAlign: "center" }}>
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => <div key={d} style={{ fontSize: "11px", color: subCol, padding: "4px 0" }}>{d}</div>)}
                {Array.from({ length: firstDay }).map((_, i) => <div key={"e" + i} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const count = calDays[key] || 0; const isToday = day === today.getDate();
                  return <div key={day} style={{ padding: "6px 2px", borderRadius: "8px", background: count > 0 ? `${C.gold}33` : isToday ? `${C.purple}22` : "transparent", border: isToday ? `1px solid ${C.purple}` : "1px solid transparent" }}>
                    <div style={{ fontSize: "12px", color: count > 0 ? C.gold : isToday ? C.purple : textCol, fontWeight: count > 0 || isToday ? "bold" : "normal" }}>{day}</div>
                    {count > 0 && <div style={{ fontSize: "9px", color: C.gold }}>{"●".repeat(Math.min(count, 3))}</div>}
                  </div>;
                })}
              </div>
            </div>
            <div style={{ fontSize: "12px", color: subCol, textAlign: "center" }}>🟡 = dream recorded · 🔵 = today</div>
          </div>
        )}
        {tab === "stats" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              {[[total, "Total Dreams", "🌙"], [analyzed, "Analyzed", "🔮"], [streak, "Day Streak", "🔥"], [Math.round(avgM * 10) / 10, "Avg Mystery", "⭐"]].map(([v, l, ic]) => (
                <div key={l} style={{ ...S.card, textAlign: "center", padding: "16px 8px" }}>
                  <div style={{ fontSize: "28px", marginBottom: "4px" }}>{ic}</div>
                  <div style={{ fontSize: "22px", color: C.gold, fontWeight: "bold" }}>{v}</div>
                  <div style={{ fontSize: "11px", color: subCol, marginTop: "3px" }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={{ fontWeight: "600", marginBottom: "12px" }}>{t.moodOverview}</div>
              {Object.entries(moodC).map(([mood, count]) => (
                <div key={mood} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ width: "105px", fontSize: "12px", color: subCol, flexShrink: 0 }}>{mood}</span>
                  <div style={{ flex: 1, height: "7px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${(count / total) * 100}%`, height: "100%", background: MOOD_COLOR[mood] || C.gold, borderRadius: "4px" }} />
                  </div>
                  <span style={{ fontSize: "11px", color: subCol, width: "16px" }}>{count}</span>
                </div>
              ))}
              {total === 0 && <div style={{ color: subCol, fontSize: "13px" }}>No data yet.</div>}
            </div>
          </div>
        )}
      </div>
      <BottomNav screen="history" nav={nav} S={S} t={t} />
    </div>
  );
}

function Insights({ S, C, t, dreams, isDark, textCol, subCol, borderCol, goBack, lang, isPremium, nav }) {
  const [insight, setInsight] = useState(""); const [busy, setBusy] = useState(false);
  const total = dreams.length;
  const pos = dreams.filter(d => d.mood && ["Joyful", "Peaceful", "Mystical"].some(x => d.mood.includes(x))).length;
  const str = dreams.filter(d => d.mood && ["Frightening", "Stressed", "Sad"].some(x => d.mood.includes(x))).length;
  async function gen() {
    setBusy(true);
    const sums = dreams.slice(0, 10).map(d => `"${d.title}": ${d.dream.slice(0, 80)}`).join("\n");
    const txt = await callGemini(`Respond in ${lang === "uz" ? "Uzbek" : lang === "ru" ? "Russian" : "English"}. You are a compassionate dream analyst. In 3–4 warm sentences, give a personal insight about this person's inner world based on their dreams. Be specific and gentle.\n\nDreams:\n${sums}`);
    setInsight(txt); setBusy(false);
  }
  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>📊 {t.insights}</span></div>
      <div style={S.body}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
          {[[total, t.totalDreams], [dreams.filter(d => d.interpretation).length, t.analyzed], [dreams.filter(d => d.favorite).length, "⭐ Favs"]].map(([v, l]) => (
            <div key={l} style={{ ...S.card, textAlign: "center", padding: "14px 8px" }}>
              <div style={{ fontSize: "22px", color: C.gold, fontWeight: "bold" }}>{v}</div>
              <div style={{ fontSize: "10px", color: subCol, marginTop: "4px" }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "12px" }}>{t.moodOverview}</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {[[t.positive, pos, C.green], [t.neutral, total - pos - str, C.gold], [t.stress, str, C.red]].map(([l, v, col]) => (
              <div key={l} style={{ flex: 1, background: `${col}15`, border: `1px solid ${col}33`, borderRadius: "10px", padding: "10px 6px", textAlign: "center" }}>
                <div style={{ fontSize: "18px", color: col, fontWeight: "bold" }}>{total ? Math.round(v / total * 100) : 0}%</div>
                <div style={{ fontSize: "11px", color: subCol, marginTop: "2px" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        {!isPremium ? (
          <div style={{ background: "linear-gradient(135deg,rgba(124,92,191,0.2),rgba(74,144,217,0.2))", border: `1px solid ${C.purple}44`, borderRadius: "14px", padding: "24px 20px", textAlign: "center", marginTop: "8px" }}>
            <div style={{ fontSize: "36px", marginBottom: "10px" }}>🔒</div>
            <div style={{ fontSize: "16px", fontWeight: "bold", color: textCol, marginBottom: "8px" }}>{t.insightLocked}</div>
            <div style={{ fontSize: "13px", color: subCol, marginBottom: "16px", lineHeight: "1.6" }}>{t.insightLockedDesc}</div>
            <button onClick={() => nav("paywall")} style={{ ...S.gradBtn, marginBottom: 0 }}>{t.upgradePlan}</button>
          </div>
        ) : (
          <div style={{ background: "linear-gradient(135deg,rgba(124,92,191,0.15),rgba(74,144,217,0.15))", border: `1px solid ${borderCol}`, borderRadius: "14px", padding: "16px", marginTop: "8px" }}>
            <div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "10px", color: C.gold }}>{t.overallInsight}</div>
            {insight ? <div style={{ fontSize: "13px", color: isDark ? "#c0b898" : "#4a4a5a", lineHeight: "1.8" }}>{insight}</div>
              : busy ? <div style={{ fontSize: "13px", color: subCol, textAlign: "center", padding: "16px" }}>🔮 Generating...</div>
                : <button onClick={gen} style={{ ...S.gradBtn, marginBottom: 0 }}>{t.aiCoach}</button>}
          </div>
        )}
      </div>
      <BottomNav screen="insights" nav={nav} S={S} t={t} />
    </div>
  );
}

const SYMBOLS = [
  { s: "🐍 Snake", i: "May symbolize an enemy or hidden threat", p: "Often represents transformation or fear", b: "Can reflect deception or spiritual temptation" },
  { s: "💧 Water", i: "Represents knowledge, life, or divine mercy", p: "May reflect emotions or the unconscious mind", b: "Symbolizes spiritual cleansing or the Holy Spirit" },
  { s: "🔥 Fire", i: "May warn of trials, anger, or purification", p: "Often represents passion or transformation", b: "Symbolizes God's presence or purifying judgment" },
  { s: "🪂 Falling", i: "May indicate loss of status or a warning", p: "Often reflects anxiety or loss of control", b: "Can represent a spiritual fall" },
  { s: "✈️ Flying", i: "Often a positive sign of elevation or success", p: "May reflect ambition or desire for freedom", b: "Can symbolize spiritual ascension" },
  { s: "🦷 Teeth", i: "May symbolize family members or strength", p: "Often linked to fear of loss or self-image", b: "Can reflect strength or powerlessness" },
  { s: "🏠 House", i: "Often represents the self or family situation", p: "May reflect the psyche or personal identity", b: "Symbolizes the soul or God's dwelling" },
  { s: "🌊 Flood", i: "May indicate overwhelming trials or blessings", p: "Often reflects emotional overload", b: "Can symbolize divine judgment or cleansing" },
  { s: "☀️ Sun", i: "Often symbolizes authority or divine blessing", p: "May represent the conscious self or vitality", b: "Symbolizes God or righteousness" },
  { s: "🌙 Moon", i: "Often symbolizes a scholar or spiritual guidance", p: "May reflect intuition or the emotional self", b: "Represents faithfulness or God's covenant" },
  { s: "🐦 Bird", i: "May symbolize good news or the soul", p: "Often represents aspirations or freedom", b: "Can symbolize the Holy Spirit" },
  { s: "🪞 Mirror", i: "May reflect self-examination", p: "Often represents self-image or identity", b: "Can symbolize truth or God's word" },
  { s: "🚪 Door", i: "Symbolizes opportunity or life transition", p: "May reflect choices or new possibilities", b: "Represents Christ as the way" },
  { s: "🔑 Key", i: "Often symbolizes knowledge or authority", p: "May reflect power or finding solutions", b: "Represents authority or unlocking blessings" },
  { s: "⛈️ Storm", i: "May warn of coming hardship or trial", p: "Often reflects inner turmoil or stress", b: "Represents divine power or spiritual testing" },
  { s: "👼 Angel", i: "A blessed sign — divine protection", p: "Often represents the higher self or conscience", b: "Symbolizes God's messengers or divine will" },
  { s: "💀 Death", i: "Often symbolizes end of a phase, not literal death", p: "May reflect change or fear of endings", b: "Can represent spiritual rebirth" },
  { s: "💍 Ring", i: "May symbolize commitment or authority", p: "Often reflects relationships or identity", b: "Represents covenant or divine promise" },
  { s: "🏔️ Mountain", i: "Often symbolizes challenges or spiritual elevation", p: "May reflect ambition or personal growth", b: "Symbolizes God's presence or faith" },
  { s: "👶 Baby", i: "May symbolize new beginnings or a blessing", p: "Often reflects new projects or vulnerability", b: "Represents innocence or spiritual rebirth" },
  { s: "🌳 Tree", i: "Often symbolizes lineage or spiritual strength", p: "May reflect personal growth or stability", b: "Represents life or God's provision" },
  { s: "👑 Crown", i: "Often symbolizes authority or divine reward", p: "May reflect ego, ambition, or recognition", b: "Represents victory or God's kingdom" },
  { s: "⛓️ Chains", i: "May symbolize sin or spiritual bondage", p: "Often reflects feeling trapped or controlled", b: "Represents bondage or liberation in Christ" },
  { s: "🩸 Blood", i: "May reflect sacrifice, martyrdom, or family ties", p: "Often represents life force or trauma", b: "Symbolizes Christ's sacrifice or covenant" },
  { s: "🐴 Horse", i: "Often symbolizes power, speed, or noble journey", p: "May reflect drive or powerful emotions", b: "Represents strength or divine power" },
  { s: "💰 Money", i: "May symbolize provision or worldly concerns", p: "Often reflects self-worth or ambition", b: "Represents prosperity or earthly priorities" },
];

function Dictionary({ S, C, t, isDark, textCol, subCol, borderCol, goBack }) {
  const [q, setQ] = useState(""); const [exp, setExp] = useState(null);
  const list = SYMBOLS.filter(s => s.s.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>🔍 {t.dictionary}</span><span style={{ fontSize: "12px", color: subCol }}>{SYMBOLS.length}</span></div>
      <div style={S.body}>
        <input style={S.inp} placeholder={t.searchDreams} value={q} onChange={e => setQ(e.target.value)} />
        {list.map((s, i) => (
          <div key={i} style={{ ...S.card, cursor: "pointer" }} onClick={() => setExp(exp === i ? null : i)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: "600", fontSize: "15px" }}>{s.s}</span>
              <span style={{ color: subCol, fontSize: "13px" }}>{exp === i ? "▲" : "▼"}</span>
            </div>
            {exp === i && <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {[["☪️ Islamic", s.i, C.gold], ["🧠 Psychology", s.p, "#7cb8d4"], ["✝️ Biblical", s.b, "#c4956a"]].map(([lb, tx, col]) => (
                <div key={lb} style={{ background: `${col}11`, border: `1px solid ${col}33`, borderRadius: "8px", padding: "10px" }}>
                  <div style={{ fontSize: "11px", color: col, fontWeight: "bold", marginBottom: "4px" }}>{lb}</div>
                  <div style={{ fontSize: "13px", color: isDark ? "#c0b898" : "#4a4a5a", lineHeight: "1.6" }}>{tx}</div>
                </div>
              ))}
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Paywall({ S, C, t, usage, setUsage, setScreen, goBack, isDark, textCol, subCol, borderCol, PLANS }) {
  const [promo, setPromo] = useState(""); const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  async function apply() {
    const code = promo.trim().toUpperCase();
    if (!code) return;
    setBusy(true); setMsg("");
    const res = await validatePromo(code);
    if (res.error) { setMsg(t.invalidPromo); setOk(false); setBusy(false); return; }
    await markPromoUsed(code, session?.email || "unknown");
    addUsedCode(code);
    const log = { date: new Date().toISOString(), plan: res.plan, analyzes: res.analyzes, code };
    setUsage(u => ({ ...u, analyzes: (u.analyzes - u.count) + res.analyzes, count: 0, plan: res.plan, subLogs: [log, ...(u.subLogs || [])] }));
    setMsg(`${t.promoOk} +${res.analyzes} ${t.analyzesPlan}`); setOk(true);
    setTimeout(() => setScreen("home"), 1600);
    setBusy(false);
  }
  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>{t.payTitle}</span><div style={{ width: "50px" }} /></div>
      <div style={S.body}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "52px", marginBottom: "10px" }}>🔒</div>
          <div style={{ fontSize: "17px", fontWeight: "bold", color: textCol, marginBottom: "6px" }}>{t.paySubtitle}</div>
          <div style={{ fontSize: "13px", color: subCol }}>{t.payDesc}</div>
        </div>
        {PLANS.map(plan => (
          <div key={plan.id} style={{ ...S.card, border: `2px solid ${plan.popular ? plan.color : borderCol}`, position: "relative", marginBottom: "14px" }}>
            {plan.popular && <div style={{ position: "absolute", top: "-11px", right: "14px", background: plan.color, borderRadius: "8px", padding: "3px 12px", fontSize: "11px", color: "#fff", fontWeight: "bold" }}>{t.popular}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div><div style={{ fontWeight: "bold", fontSize: "17px", color: plan.color }}>{t[plan.lk]}</div><div style={{ fontSize: "13px", color: subCol, marginTop: "2px" }}>✨ {plan.analyzes} {t.analyzesPlan}</div></div>
              <div style={{ fontSize: "24px", fontWeight: "bold" }}>{plan.price}</div>
            </div>
            <a href="https://t.me/AbduvaliyevGK" target="_blank" rel="noreferrer" style={{ display: "block", background: `linear-gradient(135deg,${plan.color},${plan.color}99)`, borderRadius: "10px", padding: "11px", color: "#fff", fontFamily: "inherit", fontSize: "14px", fontWeight: "bold", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>📲 {t.contactBtn}</a>
          </div>
        ))}
        <div style={S.card}>
          <div style={{ fontSize: "14px", fontWeight: "600", color: textCol, marginBottom: "10px" }}>{t.havePromo}</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
            <input style={{ ...S.inp, marginBottom: 0, flex: 1 }} placeholder={t.enterPromo} value={promo} onChange={e => setPromo(e.target.value)} onKeyDown={e => e.key === "Enter" && apply()} />
            <button onClick={apply} style={{ background: C.purple, border: "none", borderRadius: "10px", padding: "0 16px", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: "bold", whiteSpace: "nowrap" }}>{t.applyBtn}</button>
          </div>
          {msg && <div style={{ fontSize: "12px", color: ok ? C.green : C.red, marginTop: "4px" }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

function Settings({ S, C, t, T, session, setSession, theme, setTheme, lang, setLang, isDark, textCol, subCol, borderCol, usage, setUsage, PLANS, goBack, dreams }) {
  const [tab, setTab] = useState("account");
  const [promo, setPromo] = useState(""); const [pmsg, setPmsg] = useState(""); const [pok, setPok] = useState(false);
  const [notifMsg, setNotifMsg] = useState("");

  async function applyPromo() {
    const code = promo.trim().toUpperCase();
    if (!code) return;
    const res = await validatePromo(code);
    if (res.error) { setPmsg(t.invalidPromo); setPok(false); return; }
    await markPromoUsed(code, session?.email || "unknown");
    addUsedCode(code);
    const log = { date: new Date().toISOString(), plan: res.plan, analyzes: res.analyzes, code };
    setUsage(u => ({ ...u, analyzes: (u.analyzes - u.count) + res.analyzes, count: 0, plan: res.plan, subLogs: [log, ...(u.subLogs || [])] }));
    setPmsg(`${t.promoOk} +${res.analyzes}`); setPok(true);
  }

  async function enableNotifications() {
    if (!("Notification" in window)) { setNotifMsg("❌ Not supported."); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setNotifMsg(t.notifEnabled);
      const now = new Date(); const next = new Date(now); next.setHours(8, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      setTimeout(() => new Notification(t.enableNotif, { body: t.notifEnabled }), next - now);
    } else { setNotifMsg(t.notifDenied); }
  }

  const logs = usage.subLogs || [];
  const tabs = [["account", t.accountTab], ["plan", t.planTab], ["lang", t.langTab], ["theme", t.themeTab], ["about", t.aboutTab]];

  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>⚙️ {t.settingsTitle}</span><div style={{ width: "50px" }} /></div>
      <div style={{ display: "flex", overflowX: "auto", borderBottom: `1px solid ${borderCol}`, scrollbarWidth: "none" }}>
        {tabs.map(([id, lb]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flexShrink: 0, background: "none", border: "none", borderBottom: `2px solid ${tab === id ? C.gold : "transparent"}`, color: tab === id ? C.gold : subCol, padding: "11px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", whiteSpace: "nowrap" }}>{lb}</button>
        ))}
      </div>
      <div style={S.body}>
        {tab === "account" && <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{ width: "50px", height: "50px", borderRadius: "50%", background: `linear-gradient(135deg,${C.purple},${C.blue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: "bold", color: "#fff", flexShrink: 0 }}>{session?.username?.[0]?.toUpperCase() || "U"}</div>
            <div><div style={{ fontSize: "16px", fontWeight: "bold", color: textCol }}>{session?.username}</div><div style={{ fontSize: "12px", color: subCol, marginTop: "2px" }}>{session?.email}</div></div>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
            <span style={S.tag(C.green)}>✅ Verified</span>
            <span style={S.tag(C.gold)}>{usage.plan}</span>
            <span style={S.tag(C.blue)}>✨ {Math.max(0, usage.analyzes - usage.count)} {t.remaining}</span>
          </div>
          <div style={{ fontSize: "12px", color: subCol, marginBottom: "16px" }}>📖 {dreams.length} dreams · ⭐ {dreams.filter(d => d.favorite).length} favorites</div>
          <button onClick={enableNotifications} style={{ ...S.outBtn(C.purple), marginBottom: "6px" }}>{t.enableNotif}</button>
          {notifMsg && <div style={{ fontSize: "12px", color: notifMsg.includes("✅") ? C.green : C.red, marginBottom: "10px" }}>{notifMsg}</div>}
          <button style={S.outBtn(C.red)} onClick={() => setSession(null)}>{t.logout}</button>
        </div>}
        {tab === "plan" && <>
          <div style={{ background: "linear-gradient(135deg,rgba(124,92,191,0.2),rgba(74,144,217,0.2))", border: `1px solid ${borderCol}`, borderRadius: "14px", padding: "16px", textAlign: "center", marginBottom: "14px" }}>
            <div style={{ fontSize: "13px", color: subCol, marginBottom: "4px" }}>{t.currentUsage}</div>
            <div style={{ fontSize: "36px", color: C.gold, fontWeight: "bold", lineHeight: 1 }}>{Math.max(0, usage.analyzes - usage.count)}</div>
            <div style={{ fontSize: "12px", color: subCol, marginTop: "4px" }}>{t.remaining} · <span style={{ color: C.gold }}>{usage.plan}</span></div>
          </div>
          <div style={{ fontSize: "13px", color: subCol, marginBottom: "14px", lineHeight: "1.7", padding: "12px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", borderRadius: "10px" }}>{t.buyContact}</div>
          {PLANS.map(plan => (
            <div key={plan.id} style={{ ...S.card, border: `2px solid ${plan.popular ? plan.color : borderCol}`, position: "relative", marginBottom: "14px" }}>
              {plan.popular && <div style={{ position: "absolute", top: "-11px", right: "14px", background: plan.color, borderRadius: "8px", padding: "3px 12px", fontSize: "11px", color: "#fff", fontWeight: "bold" }}>{t.popular}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div><div style={{ fontWeight: "bold", fontSize: "16px", color: plan.color }}>{t[plan.lk]}</div><div style={{ fontSize: "12px", color: subCol, marginTop: "2px" }}>✨ {plan.analyzes} {t.analyzesPlan}</div></div>
                <div style={{ fontSize: "22px", fontWeight: "bold" }}>{plan.price}</div>
              </div>
              <a href="https://t.me/AbduvaliyevGK" target="_blank" rel="noreferrer" style={{ display: "block", background: `linear-gradient(135deg,${plan.color},${plan.color}88)`, borderRadius: "10px", padding: "10px", color: "#fff", fontFamily: "inherit", fontSize: "13px", fontWeight: "bold", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>📲 {t.contactBtn}</a>
            </div>
          ))}
          <div style={S.card}>
            <div style={{ fontSize: "14px", fontWeight: "600", color: textCol, marginBottom: "10px" }}>{t.promoCode}</div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
              <input style={{ ...S.inp, marginBottom: 0, flex: 1 }} placeholder={t.enterPromo} value={promo} onChange={e => setPromo(e.target.value)} onKeyDown={e => e.key === "Enter" && applyPromo()} />
              <button onClick={applyPromo} style={{ background: C.purple, border: "none", borderRadius: "10px", padding: "0 14px", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: "bold", whiteSpace: "nowrap" }}>{t.applyBtn}</button>
            </div>
            {pmsg && <div style={{ fontSize: "12px", color: pok ? C.green : C.red }}>{pmsg}</div>}
          </div>
          <div style={S.card}>
            <div style={{ fontWeight: "600", color: textCol, marginBottom: "12px" }}>{t.subLogs}</div>
            {logs.length === 0 ? <div style={{ fontSize: "13px", color: subCol }}>{t.noLogs}</div>
              : logs.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${borderCol}` }}>
                  <div><div style={{ color: textCol, fontWeight: "600", fontSize: "13px" }}>{l.plan} · +{l.analyzes} {t.analyzesPlan}</div><div style={{ color: subCol, fontSize: "11px", marginTop: "2px" }}>{fmtFull(l.date)} · <span style={{ color: C.gold }}>{l.code}</span></div></div>
                  <span style={{ color: C.green, fontSize: "18px" }}>✓</span>
                </div>
              ))}
          </div>
        </>}
        {tab === "lang" && <div style={S.card}>
          <div style={{ fontWeight: "600", color: textCol, marginBottom: "16px" }}>{t.langLabel}</div>
          {[["en", "🇬🇧 English"], ["ru", "🇷🇺 Русский"], ["uz", "🇺🇿 O'zbek"]].map(([l, lb]) => (
            <button key={l} onClick={() => setLang(l)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: lang === l ? `${C.gold}15` : "transparent", border: `1.5px solid ${lang === l ? C.gold : borderCol}`, borderRadius: "12px", padding: "14px 16px", color: lang === l ? C.gold : textCol, cursor: "pointer", fontFamily: "inherit", fontSize: "14px", marginBottom: "10px", boxSizing: "border-box" }}>
              <span>{lb}</span>{lang === l && <span>✓</span>}
            </button>
          ))}
        </div>}
        {tab === "theme" && <div style={S.card}>
          <div style={{ fontWeight: "600", color: textCol, marginBottom: "16px" }}>🎨 Theme</div>
          {[["dark", t.themeDark], ["light", t.themeLight]].map(([th, lb]) => (
            <button key={th} onClick={() => setTheme(th)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: theme === th ? `${C.gold}15` : "transparent", border: `1.5px solid ${theme === th ? C.gold : borderCol}`, borderRadius: "12px", padding: "14px 16px", color: theme === th ? C.gold : textCol, cursor: "pointer", fontFamily: "inherit", fontSize: "14px", marginBottom: "10px", boxSizing: "border-box" }}>
              <span>{lb}</span>{theme === th && <span>✓</span>}
            </button>
          ))}
        </div>}
        {tab === "about" && <div style={S.card}>
          <div style={{ textAlign: "center", marginBottom: "16px" }}><div style={{ fontSize: "48px", marginBottom: "8px" }}>🌙</div><div style={{ fontSize: "18px", fontWeight: "bold", color: C.gold }}>DreamDecoder</div></div>
          <div style={{ fontSize: "13px", color: subCol, lineHeight: "2", whiteSpace: "pre-line", marginBottom: "16px", textAlign: "center" }}>{t.aboutText}</div>
          <a href="https://t.me/AbduvaliyevGK" target="_blank" rel="noreferrer" style={{ display: "block", background: `linear-gradient(135deg,${C.blue},${C.purple})`, borderRadius: "12px", padding: "13px", color: "#fff", fontFamily: "inherit", fontSize: "14px", fontWeight: "bold", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>📲 t.me/AbduvaliyevGK</a>
        </div>}
      </div>
    </div>
  );
}

function BottomNav({ screen, nav, S, t }) {
  const items = [["home", "🏠", t.home], ["analyze", "✍️", t.newDream], ["history", "📜", t.history], ["insights", "📊", t.insights], ["settings", "⚙️", t.settings]];
  return (
    <div style={S.nav}>
      {items.map(([sc, icon, label]) => (
        <button key={sc} style={S.navB(screen === sc)} onClick={() => nav(sc)}>
          <span style={{ fontSize: "20px" }}>{icon}</span>
          <span>{label.replace(/[^\w\s]/g, "").trim().split(" ").pop().slice(0, 7)}</span>
        </button>
      ))}
    </div>
  );
}
