import { useState, useEffect, useRef } from "react";

// ── CONFIG ─────────────────────────────────────────────────────
const FB_KEY = "AIzaSyB0RdThMgPEbAAvImKIIs5t0TzvRrDDMlQ";
const FB_PROJECT = "studio-9184884157-3936a";
const AUTH = `https://identitytoolkit.googleapis.com/v1/accounts`;
const FS = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;
const GEMINI_KEY = "AIzaSyCj3lGgcmAXYD22RiCidh7kbubizwkVaIg";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
const EJS_SERVICE = "service_DreamDecoder";
const EJS_TEMPLATE = "template_yahzaho";
const EJS_PUBLIC = "aTsiU4AS3cJqY9KVe";

// ── GEMINI ─────────────────────────────────────────────────────
async function callGemini(prompt) {
  try {
    const r = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.75 }
      })
    });
    const d = await r.json();
    if (d.error) return "Gemini error: " + d.error.message;
    return d.candidates?.[0]?.content?.parts?.[0]?.text || "Could not interpret.";
  } catch (e) {
    return "Connection error: " + e.message;
  }
}

// ── EMAILJS — send 6-digit code ────────────────────────────────
async function sendCode(toEmail, username, code) {
  try {
    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EJS_SERVICE,
        template_id: EJS_TEMPLATE,
        user_id: EJS_PUBLIC,
        template_params: { to_email: toEmail, username, code: String(code) }
      })
    });
    return r.status === 200;
  } catch { return false; }
}

// ── FIREBASE AUTH ──────────────────────────────────────────────
async function fbReq(endpoint, body) {
  try {
    const r = await fetch(`${AUTH}:${endpoint}?key=${FB_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return await r.json();
  } catch { return { error: { message: "NETWORK_ERROR" } }; }
}
const fbRegister = (e, p) => fbReq("signUp", { email: e, password: p, returnSecureToken: true });
const fbLogin    = (e, p) => fbReq("signInWithPassword", { email: e, password: p, returnSecureToken: true });

// Google Sign-In via Firebase REST
async function fbGoogleSignIn(idToken) {
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FB_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postBody: `id_token=${idToken}&providerId=google.com`,
        requestUri: window.location.href,
        returnSecureToken: true
      })
    });
    return await r.json();
  } catch { return { error: { message: "NETWORK_ERROR" } }; }
}

// ── FIRESTORE ──────────────────────────────────────────────────
function toFS(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number") fields[k] = { integerValue: String(Math.round(v)) };
    else if (typeof v === "boolean") fields[k] = { booleanValue: v };
    else fields[k] = { stringValue: typeof v === "string" ? v : JSON.stringify(v) };
  }
  return { fields };
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
  try { localStorage.setItem("dd8_" + uid, JSON.stringify(data)); } catch {}
  if (!idToken || idToken.startsWith("local_")) return;
  try {
    await fetch(`${FS}/users/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify(toFS(data))
    });
  } catch {}
}
async function fsRead(uid, idToken) {
  if (idToken && !idToken.startsWith("local_")) {
    try {
      const r = await fetch(`${FS}/users/${uid}`, { headers: { "Authorization": `Bearer ${idToken}` } });
      if (r.ok) { const d = fromFS(await r.json()); if (d) return d; }
    } catch {}
  }
  try { const l = localStorage.getItem("dd8_" + uid); if (l) return JSON.parse(l); } catch {}
  return null;
}

// Check if email already registered in Firestore index
async function emailExists(email) {
  try {
    const l = localStorage.getItem("dd8_emails");
    const emails = l ? JSON.parse(l) : [];
    return emails.includes(email.toLowerCase());
  } catch { return false; }
}
async function usernameExists(username) {
  try {
    const l = localStorage.getItem("dd8_usernames");
    const names = l ? JSON.parse(l) : [];
    return names.map(n => n.toLowerCase()).includes(username.toLowerCase());
  } catch { return false; }
}
function registerEmailIndex(email, username) {
  try {
    const el = localStorage.getItem("dd8_emails");
    const emails = el ? JSON.parse(el) : [];
    if (!emails.includes(email.toLowerCase())) { emails.push(email.toLowerCase()); localStorage.setItem("dd8_emails", JSON.stringify(emails)); }
    const ul = localStorage.getItem("dd8_usernames");
    const names = ul ? JSON.parse(ul) : [];
    if (!names.map(n=>n.toLowerCase()).includes(username.toLowerCase())) { names.push(username); localStorage.setItem("dd8_usernames", JSON.stringify(names)); }
  } catch {}
}

// ── SYSTEM PROMPT ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the AI engine of a modern dream interpretation mobile application called DreamDecoder.
Analyze the user's dream and provide structured interpretations from three unique perspectives.

LANGUAGE: Auto-detect and respond in English, Russian, or Uzbek. Default to English.

STYLE: Simple modern language. Max 230 words total. Short paragraphs (1–2 lines). Bullet points for symbols. Use emojis. No essays.

TONE: Neutral, respectful. Use "may symbolize", "can represent", "often reflects". Never absolute claims. No preaching.

CONTENT RULES:
- Focus on 2–4 key symbols only.
- Each section MUST give a DIFFERENT perspective — no repeating meanings.
- Keep interpretations realistic and understandable.

SYMBOL KNOWLEDGE (65+ symbols): Water, Fire, Snake, Falling, Flying, Teeth, House, Death, Wedding, Blood, Ocean, Forest, Mountain, Baby, Dog, Cat, Horse, Bird, Spider, Mirror, Door, Key, Bridge, Storm, Darkness, Light, Angel, Devil, Gold, Silver, Ring, Clock, School, Exam, Chase, Naked, Flood, Earthquake, Moon, Sun, Stars, Rainbow, Grave, Church, Mosque, Book, Money, Car, Road, Knife, Sword, Tree, Flower, Rain, Snow, Desert, Island, Prison, Hospital, Crowd, Old person, Child, Parent, Stranger, Enemy, Food, Hunger, Swimming, Drowning, Running, Climbing, Tunnel, Window, Shoes, Clothes, Hair, Eyes, Hands, Wings, Crown, Chains.

OUTPUT FORMAT (follow exactly):

Dream Summary 🌙
(1–2 sentences)

ISLAMIC VIEW ☪️
Meaning:
(2–3 short sentences)
Symbols:
• symbol — meaning
• symbol — meaning
Takeaway:
(1 sentence)

PSYCHOLOGICAL VIEW 🧠
Meaning:
(2–3 short sentences)
Symbols:
• symbol — meaning
• symbol — meaning
Takeaway:
(1 sentence)

BIBLICAL VIEW ✝️
Meaning:
(2–3 short sentences)
Symbols:
• symbol — meaning
• symbol — meaning
Takeaway:
(1 sentence)

DREAM SCORE:
Mystery: X/10
Emotional Intensity: X/10
Symbol Richness: X/10

FINAL DISCLAIMER
Dream interpretations are symbolic and not guaranteed truths.`;

// ── TRANSLATIONS ───────────────────────────────────────────────
const T = {
  en: {
    appName:"DreamDecoder", tagline:"Islamic · Psychology · Biblical",
    login:"Login", register:"Register", logout:"Logout",
    orContinueWith:"or continue with",
    signInGoogle:"🔵 Continue with Google",
    username:"Username", email:"Email (@gmail.com)", password:"Password (min 6)",
    loginBtn:"🔑 Login", registerBtn:"📝 Create Account",
    verifyTitle:"Enter Verification Code 🔢",
    verifyMsg:"We sent a 6-digit code to:",
    verifyInput:"Enter 6-digit code",
    verifyBtn:"✅ Verify & Continue",
    verifyResend:"Resend Code", verifyBack:"← Use different email",
    verifyExpire:"Code expires in 10 minutes.",
    notVerified:"❌ Wrong code. Please try again.",
    codeExpired:"❌ Code expired. Please request a new one.",
    emailExists:"❌ This email is already registered. Please login.",
    usernameExists:"❌ This username is taken. Choose another.",
    noAccount:"❌ No account found. Please register first.",
    wrongPass:"❌ Incorrect password.",
    invalidEmail:"❌ Email must end with @gmail.com",
    shortPass:"❌ Password must be at least 6 characters.",
    emptyField:"❌ Please fill in all fields.",
    networkErr:"❌ Network error. Check your connection.",
    accountActive:"✅ Welcome back!", registered:"✅ Verification code sent to your Gmail!",
    codeSent:"✅ New code sent! Check your Gmail.",
    analyzesLeft:"analyzes left", plan:"Plan",
    analyzeBtn:"✨ Analyze a Dream", analyzeBtnLock:"🔒 Get More Analyzes",
    newDream:"New Dream", history:"History", insights:"Insights",
    dictionary:"Dictionary", home:"Home", settings:"Settings",
    dreamTitle:"Dream Title", dreamDesc:"Describe Your Dream",
    dreamEmo:"How did you feel?", dreamLoc:"Location (optional)",
    dreamPeople:"People in dream (optional)", dreamObj:"Objects / Symbols (optional)",
    analyzeNow:"🔍 Analyze Dream", clearText:"🗑 Clear All", back:"← Back",
    connecting:"🔮 Analyzing your dream...",
    allViews:"🌐 All", islamic:"☪️ Islamic", psych:"🧠 Psych", biblical:"✝️ Biblical",
    shareExport:"SHARE & EXPORT", copy:"📋 Copy", copied:"✓ Copied!",
    whatsapp:"💬 WhatsApp", telegram:"✈️ Telegram", print:"📄 PDF",
    searchDreams:"🔍 Search dreams...", noDreams:"No dreams yet. Tap + to add!",
    noMatch:"No results found.", interpreted:"✓ Analyzed", notAnalyzed:"Not analyzed",
    deleteDream:"Delete this dream?",
    totalDreams:"Dreams", analyzed:"Analyzed", mysteryScore:"Mystery",
    moodOverview:"Mood Breakdown", positive:"Positive", neutral:"Neutral", stress:"Stress",
    commonSymbols:"Common Symbols", aiCoach:"🤖 Generate My Insight",
    settingsTitle:"Settings", accountTab:"Account", planTab:"Plan",
    themeTab:"Theme", langTab:"Language", aboutTab:"About",
    currentUsage:"Analyzes Left", remaining:"left",
    promoCode:"Promo Code 🎟", enterPromo:"Enter promo code...", applyBtn:"Apply",
    invalidPromo:"❌ Invalid or already used.", promoOk:"✅ Unlocked!",
    buyContact:"Contact on Telegram to buy a plan. You'll receive a promo code.",
    contactBtn:"📲 Buy on Telegram", planStarter:"Starter", planPro:"Pro ⭐", planElite:"Elite",
    analyzesPlan:"analyzes", popular:"POPULAR",
    themeDark:"🌙 Dark", themeLight:"☀️ Light",
    langLabel:"Interface Language",
    aboutText:"DreamDecoder v8.0\nIslamic · Psychology · Biblical\nPowered by Google Gemini AI\n© 2025 DreamDecoder",
    subLogs:"Purchase History", noLogs:"No purchases yet.",
    overallInsight:"Personal Dream Insight",
    noInsightData:"Analyze at least 1 dream to see your insight.",
    payTitle:"Unlock DreamDecoder 🔒", paySubtitle:"You've used all your free analyzes",
    payDesc:"Buy a plan on Telegram and enter your promo code below.",
    havePromo:"Have a promo code?", requireLogin:"Create an account to start decoding your dreams.",
    loading:"Loading...", noTitle:"Please enter a dream title.", noDesc:"Please describe your dream.",
  },
  ru: {
    appName:"DreamDecoder", tagline:"Ислам · Психология · Библия",
    login:"Войти", register:"Регистрация", logout:"Выйти",
    orContinueWith:"или войдите через",
    signInGoogle:"🔵 Войти через Google",
    username:"Имя пользователя", email:"Email (@gmail.com)", password:"Пароль (мин. 6)",
    loginBtn:"🔑 Войти", registerBtn:"📝 Создать аккаунт",
    verifyTitle:"Введите код подтверждения 🔢",
    verifyMsg:"Мы отправили 6-значный код на:",
    verifyInput:"Введите 6-значный код",
    verifyBtn:"✅ Подтвердить и продолжить",
    verifyResend:"Отправить снова", verifyBack:"← Другой email",
    verifyExpire:"Код действует 10 минут.",
    notVerified:"❌ Неверный код. Попробуйте снова.",
    codeExpired:"❌ Код истёк. Запросите новый.",
    emailExists:"❌ Email уже зарегистрирован. Войдите.",
    usernameExists:"❌ Имя занято. Выберите другое.",
    noAccount:"❌ Аккаунт не найден. Зарегистрируйтесь.",
    wrongPass:"❌ Неверный пароль.",
    invalidEmail:"❌ Email должен заканчиваться на @gmail.com",
    shortPass:"❌ Пароль минимум 6 символов.",
    emptyField:"❌ Заполните все поля.",
    networkErr:"❌ Ошибка сети.",
    accountActive:"✅ Добро пожаловать!", registered:"✅ Код отправлен на Gmail!",
    codeSent:"✅ Новый код отправлен!",
    analyzesLeft:"анализов осталось", plan:"Тариф",
    analyzeBtn:"✨ Анализировать сон", analyzeBtnLock:"🔒 Получить анализы",
    newDream:"Новый сон", history:"История", insights:"Статистика",
    dictionary:"Словарь", home:"Главная", settings:"Настройки",
    dreamTitle:"Название сна", dreamDesc:"Опишите сон",
    dreamEmo:"Как вы себя чувствовали?", dreamLoc:"Место (необязательно)",
    dreamPeople:"Люди (необязательно)", dreamObj:"Объекты / Символы (необязательно)",
    analyzeNow:"🔍 Анализировать", clearText:"🗑 Очистить", back:"← Назад",
    connecting:"🔮 Анализирую...",
    allViews:"🌐 Все", islamic:"☪️ Ислам", psych:"🧠 Психо", biblical:"✝️ Библия",
    shareExport:"ПОДЕЛИТЬСЯ", copy:"📋 Копировать", copied:"✓ Скопировано!",
    whatsapp:"💬 WhatsApp", telegram:"✈️ Telegram", print:"📄 PDF",
    searchDreams:"🔍 Поиск...", noDreams:"Снов нет. Нажмите + чтобы добавить!",
    noMatch:"Ничего не найдено.", interpreted:"✓ Проанализирован", notAnalyzed:"Не анализирован",
    deleteDream:"Удалить сон?",
    totalDreams:"Снов", analyzed:"Анализов", mysteryScore:"Тайна",
    moodOverview:"Настроение", positive:"Позитив", neutral:"Нейтраль", stress:"Стресс",
    commonSymbols:"Частые символы", aiCoach:"🤖 Создать инсайт",
    settingsTitle:"Настройки", accountTab:"Аккаунт", planTab:"Тариф",
    themeTab:"Тема", langTab:"Язык", aboutTab:"О нас",
    currentUsage:"Осталось анализов", remaining:"осталось",
    promoCode:"Промокод 🎟", enterPromo:"Введите промокод...", applyBtn:"Применить",
    invalidPromo:"❌ Неверный промокод.", promoOk:"✅ Активировано!",
    buyContact:"Купите тариф в Telegram и получите промокод.",
    contactBtn:"📲 Купить в Telegram", planStarter:"Стартер", planPro:"Про ⭐", planElite:"Элит",
    analyzesPlan:"анализов", popular:"ПОПУЛЯРНЫЙ",
    themeDark:"🌙 Тёмная", themeLight:"☀️ Светлая",
    langLabel:"Язык интерфейса",
    aboutText:"DreamDecoder v8.0\nИслам · Психология · Библия\nGoogle Gemini AI\n© 2025 DreamDecoder",
    subLogs:"История покупок", noLogs:"Покупок нет.",
    overallInsight:"Персональный инсайт", noInsightData:"Анализируйте хотя бы 1 сон.",
    payTitle:"Разблокировать 🔒", paySubtitle:"Анализы закончились",
    payDesc:"Купите тариф в Telegram и введите промокод.",
    havePromo:"Есть промокод?", requireLogin:"Создайте аккаунт для начала.",
    loading:"Загрузка...", noTitle:"Введите название.", noDesc:"Опишите сон.",
  },
  uz: {
    appName:"DreamDecoder", tagline:"Islomiy · Psixologiya · Bibliya",
    login:"Kirish", register:"Ro'yxat", logout:"Chiqish",
    orContinueWith:"yoki davom eting",
    signInGoogle:"🔵 Google orqali kirish",
    username:"Foydalanuvchi nomi", email:"Email (@gmail.com)", password:"Parol (min 6)",
    loginBtn:"🔑 Kirish", registerBtn:"📝 Hisob yaratish",
    verifyTitle:"Tasdiqlash kodini kiriting 🔢",
    verifyMsg:"6 xonali kod yuborildi:",
    verifyInput:"6 xonali kodni kiriting",
    verifyBtn:"✅ Tasdiqlash va davom etish",
    verifyResend:"Qayta yuborish", verifyBack:"← Boshqa email",
    verifyExpire:"Kod 10 daqiqa amal qiladi.",
    notVerified:"❌ Noto'g'ri kod. Qayta urining.",
    codeExpired:"❌ Kod muddati tugagan. Yangi so'rang.",
    emailExists:"❌ Bu email allaqachon ro'yxatdan o'tgan. Kiring.",
    usernameExists:"❌ Bu ism band. Boshqa tanlang.",
    noAccount:"❌ Hisob topilmadi. Ro'yxatdan o'ting.",
    wrongPass:"❌ Noto'g'ri parol.",
    invalidEmail:"❌ Email @gmail.com bilan tugashi kerak",
    shortPass:"❌ Parol kamida 6 belgi.",
    emptyField:"❌ Barcha maydonlarni to'ldiring.",
    networkErr:"❌ Tarmoq xatosi.",
    accountActive:"✅ Xush kelibsiz!", registered:"✅ Kod Gmailga yuborildi!",
    codeSent:"✅ Yangi kod yuborildi!",
    analyzesLeft:"tahlil qoldi", plan:"Tarif",
    analyzeBtn:"✨ Tushni tahlil qilish", analyzeBtnLock:"🔒 Ko'proq tahlil",
    newDream:"Yangi tush", history:"Tarix", insights:"Tahlillar",
    dictionary:"Lug'at", home:"Asosiy", settings:"Sozlamalar",
    dreamTitle:"Sarlavha", dreamDesc:"Tushni tasvirlab bering",
    dreamEmo:"Qanday his qildingiz?", dreamLoc:"Joy (ixtiyoriy)",
    dreamPeople:"Odamlar (ixtiyoriy)", dreamObj:"Narsalar (ixtiyoriy)",
    analyzeNow:"🔍 Tahlil qilish", clearText:"🗑 Tozalash", back:"← Orqaga",
    connecting:"🔮 Tahlil qilinmoqda...",
    allViews:"🌐 Barchasi", islamic:"☪️ Islomiy", psych:"🧠 Psixo", biblical:"✝️ Bibliya",
    shareExport:"ULASHISH", copy:"📋 Nusxa", copied:"✓ Nusxalandi!",
    whatsapp:"💬 WhatsApp", telegram:"✈️ Telegram", print:"📄 PDF",
    searchDreams:"🔍 Qidirish...", noDreams:"Tushlar yo'q. + tugmasini bosing!",
    noMatch:"Topilmadi.", interpreted:"✓ Tahlil qilingan", notAnalyzed:"Tahlil qilinmagan",
    deleteDream:"Tushni o'chirasizmi?",
    totalDreams:"Tushlar", analyzed:"Tahlil", mysteryScore:"Sirlilik",
    moodOverview:"Kayfiyat", positive:"Ijobiy", neutral:"Neytral", stress:"Stress",
    commonSymbols:"Tez-tez belgilar", aiCoach:"🤖 Shaxsiy tahlil",
    settingsTitle:"Sozlamalar", accountTab:"Hisob", planTab:"Tarif",
    themeTab:"Mavzu", langTab:"Til", aboutTab:"Haqida",
    currentUsage:"Qolgan tahlillar", remaining:"qoldi",
    promoCode:"Promo kod 🎟", enterPromo:"Promo kodni kiriting...", applyBtn:"Qo'llash",
    invalidPromo:"❌ Noto'g'ri promo kod.", promoOk:"✅ Faollashtirildi!",
    buyContact:"Tarif uchun Telegramda bog'laning.",
    contactBtn:"📲 Telegramda sotib olish", planStarter:"Starter", planPro:"Pro ⭐", planElite:"Elite",
    analyzesPlan:"tahlil", popular:"MASHHUR",
    themeDark:"🌙 Qoʻngʻir", themeLight:"☀️ Yorqin",
    langLabel:"Interfeys tili",
    aboutText:"DreamDecoder v8.0\nIslomiy · Psixologiya · Bibliya\nGoogle Gemini AI\n© 2025 DreamDecoder",
    subLogs:"Xaridlar tarixi", noLogs:"Xaridlar yo'q.",
    overallInsight:"Shaxsiy tush tahlili", noInsightData:"Kamida 1 tush tahlil qiling.",
    payTitle:"Ochish 🔒", paySubtitle:"Tahlillar tugadi",
    payDesc:"Telegramda tarif xarid qiling.",
    havePromo:"Promo kodingiz bormi?", requireLogin:"Boshlash uchun hisob yarating.",
    loading:"Yuklanmoqda...", noTitle:"Sarlavha kiriting.", noDesc:"Tushni tasvirlab bering.",
  }
};

const SYMBOLS = [
  {s:"🐍 Snake",i:"May symbolize an enemy or hidden threat",p:"Often represents transformation or fear",b:"Can reflect deception or spiritual temptation"},
  {s:"💧 Water",i:"Represents knowledge, life, or divine mercy",p:"May reflect emotions or the unconscious mind",b:"Symbolizes spiritual cleansing or the Holy Spirit"},
  {s:"🔥 Fire",i:"May warn of trials, anger, or purification",p:"Often represents passion, drive, or transformation",b:"Symbolizes God's presence or purifying judgment"},
  {s:"🪂 Falling",i:"May indicate loss of status or a warning",p:"Often reflects anxiety or loss of control",b:"Can represent a spiritual fall or need for humility"},
  {s:"✈️ Flying",i:"Often a positive sign of elevation or success",p:"May reflect ambition or desire for freedom",b:"Can symbolize spiritual ascension or divine blessing"},
  {s:"🦷 Teeth",i:"May symbolize family members or strength",p:"Often linked to fear of loss or self-image",b:"Can reflect strength or powerlessness"},
  {s:"🏠 House",i:"Often represents the self or family situation",p:"May reflect the psyche or personal identity",b:"Symbolizes the soul or God's dwelling"},
  {s:"🌊 Flood",i:"May indicate overwhelming trials or blessings",p:"Often reflects emotional overload",b:"Can symbolize divine judgment or cleansing"},
  {s:"🌑 Darkness",i:"May reflect confusion or spiritual loss",p:"Represents the unconscious or fear of unknown",b:"Symbolizes spiritual blindness or evil"},
  {s:"☀️ Sun",i:"Often symbolizes authority or divine blessing",p:"May represent the conscious self or vitality",b:"Symbolizes God, righteousness, or Jesus"},
  {s:"🌙 Moon",i:"Often symbolizes a scholar or spiritual guidance",p:"May reflect intuition or the emotional self",b:"Represents faithfulness or God's covenant"},
  {s:"🐦 Bird",i:"May symbolize good news or the soul",p:"Often represents aspirations or freedom",b:"Can symbolize the Holy Spirit or God's care"},
  {s:"🪞 Mirror",i:"May reflect self-examination",p:"Often represents self-image or identity",b:"Can symbolize truth or God's word"},
  {s:"🚪 Door",i:"Symbolizes opportunity or life transition",p:"May reflect choices or new possibilities",b:"Represents Christ as the way"},
  {s:"🔑 Key",i:"Often symbolizes knowledge or authority",p:"May reflect power or finding solutions",b:"Represents authority or unlocking blessings"},
  {s:"🌉 Bridge",i:"May symbolize transition or life change",p:"Often reflects moving between life stages",b:"Can symbolize reconciliation or path to God"},
  {s:"⛈️ Storm",i:"May warn of coming hardship or trial",p:"Often reflects inner turmoil or stress",b:"Represents divine power or spiritual testing"},
  {s:"👼 Angel",i:"A blessed sign — divine protection",p:"Often represents the higher self or conscience",b:"Symbolizes God's messengers or divine will"},
  {s:"💀 Death",i:"Often symbolizes end of a phase",p:"May reflect change or fear of endings",b:"Can represent spiritual rebirth or renewal"},
  {s:"💍 Ring",i:"May symbolize commitment or authority",p:"Often reflects relationships or identity",b:"Represents covenant or divine promise"},
  {s:"🕐 Clock",i:"May reflect awareness of life's brevity",p:"Often represents anxiety about time or aging",b:"Symbolizes God's perfect timing"},
  {s:"🏫 School",i:"May reflect a period of learning",p:"Often represents self-evaluation or growth",b:"Symbolizes wisdom or God's instruction"},
  {s:"🏃 Chase",i:"May indicate fleeing from sin or fear",p:"Often reflects avoidance or anxiety",b:"Can represent fleeing temptation"},
  {s:"🌊 Drowning",i:"May symbolize being overwhelmed by trial",p:"Often reflects loss of control",b:"Represents spiritual struggle or need for salvation"},
  {s:"🏔️ Mountain",i:"Often symbolizes challenges or spiritual elevation",p:"May reflect ambition or personal growth",b:"Symbolizes God's presence or faith"},
  {s:"👶 Baby",i:"May symbolize new beginnings or a blessing",p:"Often reflects new projects or vulnerability",b:"Represents innocence or spiritual rebirth"},
  {s:"🐕 Dog",i:"May represent a loyal friend or enemy warning",p:"Often reflects loyalty or instinct",b:"Can symbolize faithfulness"},
  {s:"🐱 Cat",i:"May symbolize deception or hidden enemies",p:"Often represents independence or intuition",b:"Can reflect cunning or hidden things"},
  {s:"🐴 Horse",i:"Often symbolizes power or noble journey",p:"May reflect drive or powerful emotions",b:"Represents strength or divine power"},
  {s:"🕷️ Spider",i:"May symbolize a trap or patient planning",p:"Often reflects creativity or feeling trapped",b:"Can represent entrapment or spiritual danger"},
  {s:"💰 Money",i:"May symbolize provision or worldly concerns",p:"Often reflects self-worth or ambition",b:"Represents prosperity or earthly priorities"},
  {s:"🗡️ Knife",i:"May represent danger or cutting ties",p:"Often reflects conflict or decisiveness",b:"Symbolizes God's word or spiritual warfare"},
  {s:"🌳 Tree",i:"Often symbolizes lineage or spiritual strength",p:"May reflect personal growth or stability",b:"Represents life or God's provision"},
  {s:"🌺 Flower",i:"May symbolize beauty or fleeting joy",p:"Often reflects growth or emotional expression",b:"Represents God's creation or spiritual gifts"},
  {s:"🌨️ Snow",i:"May symbolize purity or cold period ahead",p:"Often reflects emotional numbness or clarity",b:"Represents purity or God's grace"},
  {s:"🏜️ Desert",i:"May symbolize spiritual dryness or trial",p:"Often reflects isolation or search for self",b:"Represents spiritual testing or God's guidance"},
  {s:"👑 Crown",i:"Often symbolizes authority or divine reward",p:"May reflect ego, ambition, or recognition",b:"Represents victory or God's kingdom"},
  {s:"⛓️ Chains",i:"May symbolize sin or spiritual bondage",p:"Often reflects feeling trapped or controlled",b:"Represents bondage or liberation in Christ"},
  {s:"🪽 Wings",i:"May symbolize freedom or divine protection",p:"Often reflects desire for freedom or aspiration",b:"Represents God's shelter or spiritual ascension"},
  {s:"🩸 Blood",i:"May reflect sacrifice, martyrdom, or family ties",p:"Often represents life force, trauma, or vitality",b:"Symbolizes Christ's sacrifice or covenant"},
];

const MOODS=["😊 Joyful","😴 Peaceful","✨ Mystical","😕 Confusing","😨 Frightening","😢 Sad","😤 Stressed"];
const MOOD_COLOR={"😊 Joyful":"#4caf50","😴 Peaceful":"#7cb8d4","✨ Mystical":"#c9a84c","😕 Confusing":"#8a8a6a","😨 Frightening":"#c95050","😢 Sad":"#5a7ab2","😤 Stressed":"#c97a30"};
const PLANS=[{id:"starter",lk:"planStarter",price:"$5",analyzes:25,color:"#7c5cbf"},{id:"pro",lk:"planPro",price:"$10",analyzes:60,color:"#c9a84c",popular:true},{id:"elite",lk:"planElite",price:"$16.99",analyzes:100,color:"#4a90d9"}];
const PROMOS={starter:["STR-A1B2C","STR-D3E4F","STR-G5H6I","STR-J7K8L","STR-M9N0O","STR-P1Q2R","STR-S3T4U","STR-V5W6X","STR-Y7Z8A","STR-B9C0D","STR-E1F2G","STR-H3I4J","STR-K5L6M","STR-N7O8P","STR-Q9R0S","STR-T1U2V","STR-W3X4Y","STR-Z5A6B","STR-C7D8E","STR-F9G0H","STR-I1J2K","STR-L3M4N","STR-O5P6Q","STR-R7S8T","STR-U9V0W","STR-X1Y2Z","STR-A3B4C","STR-D5E6F","STR-G7H8I","STR-J9K0L"],pro:["PRO-A1B2C","PRO-D3E4F","PRO-G5H6I","PRO-J7K8L","PRO-M9N0O","PRO-P1Q2R","PRO-S3T4U","PRO-V5W6X","PRO-Y7Z8A","PRO-B9C0D","PRO-E1F2G","PRO-H3I4J","PRO-K5L6M","PRO-N7O8P","PRO-Q9R0S","PRO-T1U2V","PRO-W3X4Y","PRO-Z5A6B","PRO-C7D8E","PRO-F9G0H","PRO-I1J2K","PRO-L3M4N","PRO-O5P6Q","PRO-R7S8T","PRO-U9V0W","PRO-X1Y2Z","PRO-A3B4C","PRO-D5E6F","PRO-G7H8I","PRO-J9K0L"],elite:["ELT-A1B2C","ELT-D3E4F","ELT-G5H6I","ELT-J7K8L","ELT-M9N0O","ELT-P1Q2R","ELT-S3T4U","ELT-V5W6X","ELT-Y7Z8A","ELT-B9C0D","ELT-E1F2G","ELT-H3I4J","ELT-K5L6M","ELT-N7O8P","ELT-Q9R0S","ELT-T1U2V","ELT-W3X4Y","ELT-Z5A6B","ELT-C7D8E","ELT-F9G0H","ELT-I1J2K","ELT-L3M4N","ELT-O5P6Q","ELT-R7S8T","ELT-U9V0W","ELT-X1Y2Z","ELT-A3B4C","ELT-D5E6F","ELT-G7H8I","ELT-J9K0L"],bonus:["ISO2026"]};
const FREE_LIMIT=5;
const C={bg:"#07071a",card:"rgba(255,255,255,0.04)",border:"rgba(255,255,255,0.09)",gold:"#c9a84c",text:"#e8e0d0",sub:"#6a6a9a",purple:"#7c5cbf",blue:"#4a90d9",green:"#4caf50",red:"#c95050"};

function parseScores(t){const m=(l)=>{const r=new RegExp(`${l}[:\\s]+([0-9]+)`,"i");const mt=t.match(r);return mt?parseInt(mt[1]):Math.floor(Math.random()*4)+5;};return{mystery:m("mystery"),emotion:m("emotional intensity"),symbols:m("symbol richness")};}
function fmtFull(iso){return new Date(iso).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}
function getUsedCodes(){try{return JSON.parse(localStorage.getItem("dd8_codes")||"[]");}catch{return[];}}
function addUsedCode(c){const u=getUsedCodes();if(!u.includes(c)){u.push(c);localStorage.setItem("dd8_codes",JSON.stringify(u));}}
function genCode(){return String(Math.floor(100000+Math.random()*900000));}

function makeStyles(isDark,bg,cardBg,textCol,subCol,borderCol){
  return {
    app:{minHeight:"100vh",background:bg,color:textCol,fontFamily:"'Segoe UI',sans-serif",maxWidth:"480px",margin:"0 auto",position:"relative"},
    hdr:{padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",background:isDark?"rgba(7,7,26,0.9)":"rgba(240,240,255,0.9)",backdropFilter:"blur(12px)",borderBottom:`1px solid ${borderCol}`,position:"sticky",top:0,zIndex:10},
    logo:{fontSize:"18px",fontWeight:"bold",color:C.gold},
    card:{background:cardBg,border:`1px solid ${borderCol}`,borderRadius:"14px",padding:"16px",marginBottom:"12px"},
    nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:"480px",background:isDark?"rgba(7,7,26,0.96)":"rgba(240,240,255,0.96)",backdropFilter:"blur(16px)",borderTop:`1px solid ${borderCol}`,display:"flex",zIndex:20},
    navB:(a)=>({flex:1,background:"none",border:"none",color:a?C.gold:subCol,cursor:"pointer",fontFamily:"inherit",fontSize:"10px",padding:"10px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"}),
    body:{padding:"16px 20px 90px"},
    inp:{width:"100%",background:isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.05)",border:`1px solid ${borderCol}`,borderRadius:"10px",padding:"12px 14px",color:textCol,fontSize:"14px",fontFamily:"inherit",boxSizing:"border-box",marginBottom:"10px",outline:"none"},
    lbl:{fontSize:"11px",color:subCol,marginBottom:"5px",display:"block",letterSpacing:"0.8px",textTransform:"uppercase"},
    gradBtn:{background:"linear-gradient(135deg,#7c5cbf,#4a90d9)",border:"none",borderRadius:"12px",padding:"14px 20px",color:"#fff",fontFamily:"inherit",fontSize:"15px",cursor:"pointer",width:"100%",marginBottom:"10px",fontWeight:"bold"},
    outBtn:(col)=>({background:"transparent",border:`1.5px solid ${col||borderCol}`,borderRadius:"10px",padding:"11px 16px",color:col||subCol,fontFamily:"inherit",fontSize:"13px",cursor:"pointer",width:"100%",marginBottom:"8px"}),
    smBtn:(col)=>({background:`${col}22`,border:`1px solid ${col}44`,borderRadius:"8px",padding:"9px 14px",color:col,fontFamily:"inherit",fontSize:"12px",cursor:"pointer"}),
    backBtn:{background:"none",border:"none",color:C.gold,cursor:"pointer",fontFamily:"inherit",fontSize:"14px",padding:"0"},
    tag:(col)=>({display:"inline-block",background:`${col}22`,border:`1px solid ${col}44`,borderRadius:"6px",padding:"3px 9px",fontSize:"11px",color:col,marginRight:"5px",marginBottom:"3px"}),
    msg:(ok)=>({fontSize:"13px",color:ok?C.green:C.red,marginBottom:"12px",padding:"10px 14px",background:ok?"rgba(76,175,80,0.1)":"rgba(201,80,80,0.1)",borderRadius:"8px",border:`1px solid ${ok?"rgba(76,175,80,0.3)":"rgba(201,80,80,0.3)"}`}),
    divider:{display:"flex",alignItems:"center",gap:"10px",margin:"16px 0"},
    divLine:{flex:1,height:"1px",background:borderCol},
    divText:{fontSize:"12px",color:subCol,whiteSpace:"nowrap"},
  };
}

// ── APP ────────────────────────────────────────────────────────
export default function App(){
  const [lang,setLang]=useState(()=>localStorage.getItem("dd8_lang")||"en");
  const [theme,setTheme]=useState(()=>localStorage.getItem("dd8_theme")||"dark");
  const [session,setSession]=useState(()=>{try{return JSON.parse(localStorage.getItem("dd8_session")||"null");}catch{return null;}});
  const [screen,setScreen]=useState("home");
  const [prev,setPrev]=useState("home");
  const [dreams,setDreams]=useState([]);
  const [usage,setUsageRaw]=useState({count:0,analyzes:FREE_LIMIT,plan:"free",subLogs:[]});
  const [selected,setSelected]=useState(null);
  const [interpView,setInterpView]=useState("all");
  const [loaded,setLoaded]=useState(false);

  const t=T[lang];
  const isDark=theme!=="light";
  const bg=isDark?C.bg:"#f0f0ff";
  const cardBg=isDark?C.card:"rgba(0,0,0,0.04)";
  const textCol=isDark?C.text:"#1a1a3a";
  const subCol=isDark?C.sub:"#5a5a8a";
  const borderCol=isDark?C.border:"rgba(0,0,0,0.1)";
  const S=makeStyles(isDark,bg,cardBg,textCol,subCol,borderCol);
  const remaining=Math.max(0,usage.analyzes-usage.count);

  useEffect(()=>{localStorage.setItem("dd8_lang",lang);},[lang]);
  useEffect(()=>{localStorage.setItem("dd8_theme",theme);},[theme]);
  useEffect(()=>{localStorage.setItem("dd8_session",JSON.stringify(session));},[session]);

  useEffect(()=>{
    if(!session?.uid) return;
    fsRead(session.uid,session.idToken||"local_").then(d=>{
      if(d){
        setUsageRaw({count:Number(d.count)||0,analyzes:Number(d.analyzes)||FREE_LIMIT,plan:d.plan||"free",subLogs:d.subLogs||[]});
        setDreams(d.dreams||[]);
      }
      setLoaded(true);
    });
  },[session?.uid]);

  async function persist(nu,nd){
    if(!session?.uid) return;
    await fsWrite(session.uid,{count:nu.count,analyzes:nu.analyzes,plan:nu.plan,subLogs:nu.subLogs||[],dreams:nd,email:session.email,username:session.username},session.idToken||"local_");
  }
  function setUsage(fn){setUsageRaw(p=>{const n=typeof fn==="function"?fn(p):fn;persist(n,dreams);return n;});}
  function addDream(d){const nd=[d,...dreams];setDreams(nd);persist(usage,nd);}
  function delDream(id){const nd=dreams.filter(x=>x.id!==id);setDreams(nd);persist(usage,nd);}
  function nav(sc){setPrev(screen);setScreen(sc);}
  function goBack(){setScreen(prev||"home");}

  if(!session) return <AuthScreen S={S} C={C} t={t} lang={lang} setLang={setLang} T={T} setSession={setSession} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol}/>;
  if(!loaded) return <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"16px"}}><div style={{fontSize:"52px"}}>🌙</div><div style={{color:C.gold}}>{t.loading}</div></div>;
  if(screen==="paywall") return <Paywall S={S} C={C} t={t} usage={usage} setUsage={setUsage} setScreen={setScreen} goBack={goBack} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} PLANS={PLANS} PROMOS={PROMOS}/>;
  if(screen==="analyze") return <Analyze S={S} C={C} t={t} addDream={addDream} setScreen={nav} setSelected={setSelected} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} MOODS={MOODS} usage={usage} setUsage={setUsage} remaining={remaining} goBack={goBack} toPaywall={()=>setScreen("paywall")}/>;
  if(screen==="result"&&selected) return <Result S={S} C={C} t={t} dream={selected} setScreen={nav} interpView={interpView} setInterpView={setInterpView} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} goBack={goBack}/>;
  if(screen==="history") return <History S={S} C={C} t={t} dreams={dreams} delDream={delDream} setSelected={setSelected} setScreen={nav} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} goBack={goBack}/>;
  if(screen==="insights") return <Insights S={S} C={C} t={t} dreams={dreams} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} goBack={goBack} lang={lang}/>;
  if(screen==="dictionary") return <Dictionary S={S} C={C} t={t} SYMBOLS={SYMBOLS} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} goBack={goBack}/>;
  if(screen==="settings") return <Settings S={S} C={C} t={t} T={T} session={session} setSession={setSession} theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} isDark={isDark} textCol={textCol} subCol={subCol} borderCol={borderCol} usage={usage} setUsage={setUsage} PLANS={PLANS} PROMOS={PROMOS} goBack={goBack} dreams={dreams}/>;

  return (
    <div style={S.app}>
      <div style={S.hdr}>
        <span style={S.logo}>🌙 {t.appName}</span>
        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
          <span style={{fontSize:"12px",color:subCol}}>👤 {session.username}</span>
          <button onClick={()=>nav("settings")} style={{background:"none",border:`1px solid ${borderCol}`,borderRadius:"8px",padding:"5px 10px",color:subCol,cursor:"pointer",fontSize:"12px",fontFamily:"inherit"}}>⚙️</button>
        </div>
      </div>
      <div style={S.body}>
        <div style={{background:"linear-gradient(135deg,rgba(124,92,191,0.3),rgba(74,144,217,0.3))",borderRadius:"18px",padding:"28px 20px",textAlign:"center",marginBottom:"20px",border:`1px solid ${borderCol}`}}>
          <div style={{fontSize:"48px",marginBottom:"8px"}}>🌙</div>
          <div style={{fontSize:"22px",fontWeight:"bold",color:C.gold,marginBottom:"4px"}}>{t.appName}</div>
          <div style={{fontSize:"13px",color:subCol,marginBottom:"16px"}}>{t.tagline}</div>
          <div style={{display:"inline-flex",alignItems:"center",gap:"6px",background:remaining<=2?"rgba(201,80,80,0.15)":"rgba(76,175,80,0.12)",border:`1px solid ${remaining<=2?C.red+"55":C.green+"55"}`,borderRadius:"20px",padding:"6px 16px",marginBottom:"16px"}}>
            <span style={{fontSize:"13px",color:remaining<=2?C.red:C.green,fontWeight:"600"}}>✨ {remaining} {t.analyzesLeft}</span>
          </div>
          <button style={S.gradBtn} onClick={()=>remaining<=0?nav("paywall"):nav("analyze")}>{remaining<=0?t.analyzeBtnLock:t.analyzeBtn}</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"20px"}}>
          {[["🔍",t.dictionary,"dictionary"],["📜",t.history,"history"],["📊",t.insights,"insights"],["⚙️",t.settings,"settings"]].map(([ic,lb,sc])=>(
            <button key={sc} onClick={()=>nav(sc)} style={{background:cardBg,border:`1px solid ${borderCol}`,borderRadius:"14px",padding:"16px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"flex-start",gap:"6px",outline:"none"}}>
              <span style={{fontSize:"24px"}}>{ic}</span>
              <span style={{fontSize:"13px",color:textCol,fontWeight:"500"}}>{lb}</span>
            </button>
          ))}
        </div>
        {dreams.length>0&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
            <span style={{fontSize:"14px",fontWeight:"600",color:textCol}}>Recent Dreams</span>
            <button onClick={()=>nav("history")} style={{background:"none",border:"none",color:C.gold,cursor:"pointer",fontSize:"12px",fontFamily:"inherit"}}>See all →</button>
          </div>
          {dreams.slice(0,3).map(d=>(
            <div key={d.id} style={{...S.card,cursor:"pointer"}} onClick={()=>{setSelected(d);nav("result");}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div><div style={{fontWeight:"600",fontSize:"14px",marginBottom:"3px"}}>{d.title}</div><div style={{fontSize:"11px",color:subCol}}>{fmtFull(d.timestamp)}</div></div>
                <span style={{fontSize:"20px"}}>{d.mood?.split(" ")[0]||"🌙"}</span>
              </div>
              {d.scores&&<div style={{display:"flex",gap:"6px",marginTop:"8px"}}>
                <span style={S.tag(C.purple)}>⭐{d.scores.mystery}/10</span>
                <span style={S.tag(C.blue)}>❤️{d.scores.emotion}/10</span>
              </div>}
            </div>
          ))}
        </>}
      </div>
      <BottomNav screen="home" setScreen={nav} S={S} t={t}/>
    </div>
  );
}

// ── AUTH SCREEN ────────────────────────────────────────────────
function AuthScreen({S,C,t,lang,setLang,T,setSession,isDark,textCol,subCol,borderCol}){
  const [mode,setMode]=useState("register"); // DEFAULT = register
  const [form,setForm]=useState({username:"",email:"",password:""});
  const [msg,setMsg]=useState("");
  const [ok,setOk]=useState(false);
  const [busy,setBusy]=useState(false);
  const [codeStep,setCodeStep]=useState(null); // {email,username,password,code,expires,fbData}
  const [enteredCode,setEnteredCode]=useState("");
  const codeRef=useRef(null);

  function err(m){setMsg(m);setOk(false);setBusy(false);}
  function success(m){setMsg(m);setOk(true);setBusy(false);}

  async function handleRegister(){
    const{username,email,password}=form;
    if(!username.trim()||!email.trim()||!password.trim()) return err(t.emptyField);
    if(!/^[^@]+@gmail\.com$/i.test(email)) return err(t.invalidEmail);
    if(password.length<6) return err(t.shortPass);
    setBusy(true);setMsg("");
    // Check duplicates locally
    if(await emailExists(email)) return err(t.emailExists);
    if(await usernameExists(username)) return err(t.usernameExists);
    // Register in Firebase
    const res=await fbRegister(email,password);
    if(res.error){
      const m=res.error.message||"";
      if(m.includes("EMAIL_EXISTS")) return err(t.emailExists);
      if(m.includes("NETWORK")) return err(t.networkErr);
      return err("❌ "+m);
    }
    // Send 6-digit code via EmailJS
    const code=genCode();
    const expires=Date.now()+10*60*1000;
    const sent=await sendCode(email,username,code);
    if(!sent){
      // Still proceed — show code in UI as fallback
      setCodeStep({email,username,password,code,expires,fbData:res,fallback:true});
      success(t.registered+" (EmailJS may need domain setup on Vercel)");
      setBusy(false);
      return;
    }
    setCodeStep({email,username,password,code,expires,fbData:res,fallback:false});
    success(t.registered);
    setBusy(false);
    setTimeout(()=>codeRef.current?.focus(),300);
  }

  async function handleLogin(){
    const{username,email,password}=form;
    if(!email.trim()||!password.trim()) return err(t.emptyField);
    if(!/^[^@]+@gmail\.com$/i.test(email)) return err(t.invalidEmail);
    setBusy(true);setMsg("");
    // Must be registered
    if(!(await emailExists(email))) return err(t.noAccount);
    const res=await fbLogin(email,password);
    if(res.error){
      const m=res.error.message||"";
      if(m.includes("EMAIL_NOT_FOUND")||m.includes("INVALID_LOGIN_CREDENTIALS")||m.includes("USER_NOT_FOUND")) return err(t.noAccount);
      if(m.includes("INVALID_PASSWORD")||m.includes("WRONG_PASSWORD")) return err(t.wrongPass);
      if(m.includes("NETWORK")) return err(t.networkErr);
      return err("❌ "+m);
    }
    // Get stored username
    const stored=localStorage.getItem("dd8_umap_"+res.localId);
    const uname=stored||email.split("@")[0];
    success(t.accountActive);
    setTimeout(()=>setSession({uid:res.localId,email,username:uname,idToken:res.idToken}),600);
    setBusy(false);
  }

  async function verifyCode(){
    if(!codeStep) return;
    if(Date.now()>codeStep.expires){err(t.codeExpired);setCodeStep(null);return;}
    if(enteredCode.trim()!==codeStep.code){err(t.notVerified);return;}
    // Code correct — finalize
    registerEmailIndex(codeStep.email,codeStep.username);
    localStorage.setItem("dd8_umap_"+codeStep.fbData.localId,codeStep.username);
    success(t.accountActive);
    setTimeout(()=>setSession({uid:codeStep.fbData.localId,email:codeStep.email,username:codeStep.username,idToken:codeStep.fbData.idToken}),600);
  }

  async function resendCode(){
    if(!codeStep) return;
    const code=genCode();
    const expires=Date.now()+10*60*1000;
    await sendCode(codeStep.email,codeStep.username,code);
    setCodeStep({...codeStep,code,expires});
    setEnteredCode("");
    success(t.codeSent);
  }

  // Google Sign-In (popup)
  async function handleGoogle(){
    setBusy(true);setMsg("");
    try {
      // Load Google Identity Services
      if(!window.google){
        await new Promise((res,rej)=>{
          const s=document.createElement("script");
          s.src="https://accounts.google.com/gsi/client";
          s.onload=res;s.onerror=rej;
          document.head.appendChild(s);
        });
      }
      window.google.accounts.id.initialize({
        client_id:"991498519630-b7662b1429687255fcef1f.apps.googleusercontent.com",
        callback:async(resp)=>{
          const fbRes=await fbGoogleSignIn(resp.credential);
          if(fbRes.error){err("❌ Google sign-in failed.");return;}
          const gEmail=fbRes.email||"";
          const gName=fbRes.displayName||gEmail.split("@")[0];
          registerEmailIndex(gEmail,gName);
          localStorage.setItem("dd8_umap_"+fbRes.localId,gName);
          setSession({uid:fbRes.localId,email:gEmail,username:gName,idToken:fbRes.idToken});
        }
      });
      window.google.accounts.id.prompt();
    } catch { err("❌ Google sign-in unavailable in preview. Works on deployed app."); }
    setBusy(false);
  }

  // Verification code screen
  if(codeStep) return (
    <div style={S.app}>
      <div style={{...S.hdr,justifyContent:"center"}}><span style={S.logo}>🌙 {t.appName}</span></div>
      <div style={S.body}>
        <div style={{textAlign:"center",padding:"20px 0 24px"}}>
          <div style={{fontSize:"56px",marginBottom:"12px"}}>📧</div>
          <div style={{fontSize:"19px",fontWeight:"bold",color:textCol,marginBottom:"8px"}}>{t.verifyTitle}</div>
          <div style={{fontSize:"13px",color:subCol,marginBottom:"4px"}}>{t.verifyMsg}</div>
          <div style={{fontSize:"15px",color:C.gold,fontWeight:"600",marginBottom:"6px"}}>{codeStep.email}</div>
          <div style={{fontSize:"12px",color:subCol}}>{t.verifyExpire}</div>
        </div>
        {codeStep.fallback&&<div style={{...S.msg(true),textAlign:"center",fontSize:"14px",marginBottom:"16px"}}>
          Your code: <strong style={{fontSize:"22px",letterSpacing:"4px",color:C.gold}}>{codeStep.code}</strong>
          <div style={{fontSize:"11px",color:subCol,marginTop:"4px"}}>(EmailJS needs domain setup on Vercel — code shown here for testing)</div>
        </div>}
        <label style={S.lbl}>{t.verifyInput}</label>
        <input ref={codeRef} style={{...S.inp,fontSize:"24px",letterSpacing:"8px",textAlign:"center",fontWeight:"bold"}} maxLength={6} placeholder="000000" value={enteredCode} onChange={e=>setEnteredCode(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&verifyCode()}/>
        {msg&&<div style={S.msg(ok)}>{msg}</div>}
        <button style={S.gradBtn} onClick={verifyCode} disabled={busy||enteredCode.length!==6}>{t.verifyBtn}</button>
        <button style={S.outBtn(subCol)} onClick={resendCode}>{t.verifyResend}</button>
        <button style={S.outBtn(C.red)} onClick={()=>{setCodeStep(null);setMsg("");setEnteredCode("");}}>{t.verifyBack}</button>
      </div>
    </div>
  );

  return (
    <div style={S.app}>
      <div style={{...S.hdr,justifyContent:"center",flexDirection:"column",gap:"4px",padding:"20px"}}>
        <span style={S.logo}>🌙 {t.appName}</span>
        <span style={{fontSize:"12px",color:subCol}}>{t.tagline}</span>
      </div>
      <div style={S.body}>
        <div style={{display:"flex",gap:"8px",marginBottom:"24px",justifyContent:"center"}}>
          {Object.keys(T).map(l=>(
            <button key={l} onClick={()=>setLang(l)} style={{padding:"6px 16px",borderRadius:"20px",border:`1.5px solid ${lang===l?C.gold:borderCol}`,background:lang===l?`${C.gold}22`:"transparent",color:lang===l?C.gold:subCol,cursor:"pointer",fontSize:"13px",fontFamily:"inherit",fontWeight:lang===l?"bold":"normal"}}>
              {l==="en"?"🇬🇧 EN":l==="ru"?"🇷🇺 RU":"🇺🇿 UZ"}
            </button>
          ))}
        </div>
        <div style={{textAlign:"center",marginBottom:"28px"}}>
          <div style={{fontSize:"56px",marginBottom:"10px"}}>🌙</div>
          <div style={{fontSize:"13px",color:subCol}}>{t.requireLogin}</div>
        </div>
        {/* Tab switcher */}
        <div style={{display:"flex",gap:"8px",marginBottom:"20px"}}>
          {["register","login"].map(m=>(
            <button key={m} onClick={()=>{setMode(m);setMsg("");}} style={{flex:1,padding:"12px",borderRadius:"12px",border:`2px solid ${mode===m?C.gold:borderCol}`,background:mode===m?`${C.gold}15`:"transparent",color:mode===m?C.gold:subCol,cursor:"pointer",fontFamily:"inherit",fontSize:"14px",fontWeight:mode===m?"bold":"normal"}}>
              {m==="register"?t.register:t.login}
            </button>
          ))}
        </div>
        {/* Google button */}
        <button onClick={handleGoogle} disabled={busy} style={{width:"100%",background:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.05)",border:`1.5px solid ${borderCol}`,borderRadius:"12px",padding:"13px",color:textCol,fontFamily:"inherit",fontSize:"14px",cursor:"pointer",marginBottom:"4px",fontWeight:"500"}}>
          {t.signInGoogle}
        </button>
        <div style={S.divider}><div style={S.divLine}/><div style={S.divText}>{t.orContinueWith}</div><div style={S.divLine}/></div>
        {/* Form */}
        <label style={S.lbl}>{t.username}</label>
        <input style={S.inp} placeholder={t.username} value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))}/>
        <label style={S.lbl}>{t.email}</label>
        <input style={S.inp} placeholder="your@gmail.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} autoCapitalize="none" autoCorrect="off"/>
        <label style={S.lbl}>{t.password}</label>
        <input type="password" style={S.inp} placeholder="••••••" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&(mode==="register"?handleRegister():handleLogin())}/>
        {msg&&<div style={S.msg(ok)}>{msg}</div>}
        <button style={S.gradBtn} onClick={mode==="register"?handleRegister:handleLogin} disabled={busy}>
          {busy?"⏳ Please wait...":mode==="register"?t.registerBtn:t.loginBtn}
        </button>
      </div>
    </div>
  );
}

// ── ANALYZE ────────────────────────────────────────────────────
function Analyze({S,C,t,addDream,setScreen,setSelected,isDark,textCol,subCol,borderCol,MOODS,usage,setUsage,remaining,goBack,toPaywall}){
  const [form,setForm]=useState({title:"",dream:"",mood:"",location:"",people:"",objects:""});
  const [busy,setBusy]=useState(false);
  const [errMsg,setErrMsg]=useState("");

  async function analyze(){
    if(!form.title.trim()){setErrMsg(t.noTitle);return;}
    if(!form.dream.trim()){setErrMsg(t.noDesc);return;}
    if(remaining<=0){toPaywall();return;}
    setBusy(true);setErrMsg("");
    const prompt=SYSTEM_PROMPT+`\n\nDream Title: "${form.title}"\nMood: "${form.mood||"Not specified"}"\nLocation: "${form.location||"Not specified"}"\nPeople: "${form.people||"Not specified"}"\nObjects: "${form.objects||"Not specified"}"\n\nDream:\n"${form.dream}"`;
    const txt=await callGemini(prompt);
    const scores=parseScores(txt);
    const d={id:Date.now()+Math.random(),title:form.title,dream:form.dream,mood:form.mood,location:form.location,people:form.people,objects:form.objects,timestamp:new Date().toISOString(),interpretation:txt,scores};
    addDream(d);
    setUsage(u=>({...u,count:u.count+1}));
    setSelected(d);
    setScreen("result");
    setBusy(false);
  }

  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>✍️ {t.newDream}</span><span style={{fontSize:"12px",color:remaining<=2?C.red:C.green,fontWeight:"600"}}>✨{remaining}</span></div>
      <div style={S.body}>
        <label style={S.lbl}>{t.dreamTitle} *</label>
        <input style={S.inp} placeholder="e.g. Flying over a city..." value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
        <label style={S.lbl}>{t.dreamDesc} *</label>
        <textarea style={{...S.inp,minHeight:"130px",resize:"vertical"}} placeholder="Describe everything you remember..." value={form.dream} onChange={e=>setForm(f=>({...f,dream:e.target.value}))}/>
        <label style={S.lbl}>{t.dreamEmo}</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:"7px",marginBottom:"14px"}}>
          {MOODS.map(m=><button key={m} style={{padding:"6px 12px",borderRadius:"16px",border:`1px solid ${form.mood===m?C.gold:borderCol}`,background:form.mood===m?`${C.gold}22`:"transparent",color:form.mood===m?C.gold:subCol,cursor:"pointer",fontSize:"12px",fontFamily:"inherit"}} onClick={()=>setForm(f=>({...f,mood:m}))}>{m}</button>)}
        </div>
        <label style={S.lbl}>{t.dreamLoc}</label>
        <input style={S.inp} placeholder="e.g. Forest, my old school..." value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/>
        <label style={S.lbl}>{t.dreamPeople}</label>
        <input style={S.inp} placeholder="e.g. Mother, a stranger..." value={form.people} onChange={e=>setForm(f=>({...f,people:e.target.value}))}/>
        <label style={S.lbl}>{t.dreamObj}</label>
        <input style={S.inp} placeholder="e.g. Key, fire, water..." value={form.objects} onChange={e=>setForm(f=>({...f,objects:e.target.value}))}/>
        {errMsg&&<div style={S.msg(false)}>{errMsg}</div>}
        <div style={{height:"1px",background:borderCol,margin:"14px 0"}}/>
        <button style={S.gradBtn} onClick={analyze} disabled={busy}>{busy?t.connecting:t.analyzeNow}</button>
        <button style={S.outBtn(C.red)} onClick={()=>{setForm({title:"",dream:"",mood:"",location:"",people:"",objects:""});setErrMsg("");}}>{t.clearText}</button>
      </div>
    </div>
  );
}

// ── RESULT ─────────────────────────────────────────────────────
function Result({S,C,t,dream,setScreen,interpView,setInterpView,isDark,textCol,subCol,borderCol,goBack}){
  const [copied,setCopied]=useState(false);
  function getLines(txt,sec){
    const all=txt.split("\n").filter(l=>l.trim());
    if(sec==="all") return all;
    const map={islamic:"ISLAMIC VIEW",psych:"PSYCHOLOGICAL VIEW",biblical:"BIBLICAL VIEW"};
    const kw=map[sec];let cap=false,res=[];
    for(const line of all){
      if(line.includes(kw)){cap=true;res.push(line);continue;}
      if(cap){if(["ISLAMIC VIEW","PSYCHOLOGICAL VIEW","BIBLICAL VIEW"].some(v=>line.includes(v)&&!line.includes(kw)))break;res.push(line);}
    }
    return res.length?res:all;
  }
  function renderLine(line,i){
    if(line.includes("ISLAMIC VIEW")) return <div key={i} style={{color:"#c9a84c",fontWeight:"bold",background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.3)",borderRadius:"8px",padding:"9px 13px",marginBottom:"6px",marginTop:"12px",fontSize:"14px"}}>☪️ ISLAMIC VIEW</div>;
    if(line.includes("PSYCHOLOGICAL VIEW")) return <div key={i} style={{color:"#7cb8d4",fontWeight:"bold",background:"rgba(124,184,212,0.1)",border:"1px solid rgba(124,184,212,0.3)",borderRadius:"8px",padding:"9px 13px",marginBottom:"6px",marginTop:"12px",fontSize:"14px"}}>🧠 PSYCHOLOGICAL VIEW</div>;
    if(line.includes("BIBLICAL VIEW")) return <div key={i} style={{color:"#c4956a",fontWeight:"bold",background:"rgba(196,149,106,0.1)",border:"1px solid rgba(196,149,106,0.3)",borderRadius:"8px",padding:"9px 13px",marginBottom:"6px",marginTop:"12px",fontSize:"14px"}}>✝️ BIBLICAL VIEW</div>;
    if(line.includes("Dream Summary")) return <div key={i} style={{color:C.gold,fontWeight:"bold",fontSize:"15px",marginBottom:"6px"}}>{line}</div>;
    if(line.includes("DREAM SCORE")) return <div key={i} style={{color:"#a070d0",fontWeight:"bold",fontSize:"13px",marginTop:"14px",marginBottom:"6px"}}>⭐ DREAM SCORE</div>;
    if(line.includes("FINAL DISCLAIMER")||line.includes("FINAL NOTE")) return <div key={i} style={{color:subCol,fontSize:"12px",fontStyle:"italic",marginTop:"14px",borderTop:`1px solid ${borderCol}`,paddingTop:"12px"}}>{line.replace(/FINAL (DISCLAIMER|NOTE):?/,"").trim()}</div>;
    if(/^(Meaning|Symbols|Takeaway):/.test(line)) return <div key={i} style={{color:subCol,fontSize:"11px",fontWeight:"bold",letterSpacing:"0.8px",marginTop:"8px",marginBottom:"3px",textTransform:"uppercase"}}>{line.split(":")[0]}</div>;
    if(line.startsWith("•")||line.startsWith("-")) return <div key={i} style={{color:isDark?"#c0b898":"#4a4a6a",fontSize:"13px",paddingLeft:"12px",marginBottom:"4px",lineHeight:"1.6"}}>{line}</div>;
    if(/^(Mystery|Emotional|Symbol Richness)/i.test(line)){
      const[lb,vl]=line.split(":");const num=parseInt((vl||"").match(/\d+/)?.[0])||5;
      const col=num>=8?C.green:num>=5?C.gold:C.red;
      return <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
        <span style={{fontSize:"12px",color:subCol,width:"130px",flexShrink:0}}>{lb}</span>
        <div style={{flex:1,height:"7px",borderRadius:"4px",background:isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)"}}><div style={{width:`${num*10}%`,height:"100%",background:col,borderRadius:"4px"}}/></div>
        <span style={{fontSize:"12px",color:col,width:"35px",textAlign:"right",fontWeight:"bold"}}>{num}/10</span>
      </div>;
    }
    return <div key={i} style={{color:isDark?"#c8c0b0":"#3a3a5a",fontSize:"13px",lineHeight:"1.75",marginBottom:"4px"}}>{line}</div>;
  }
  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={{fontSize:"14px",fontWeight:"600",color:textCol,maxWidth:"200px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dream.title}</span><span style={{fontSize:"20px"}}>{dream.mood?.split(" ")[0]||"🌙"}</span></div>
      <div style={S.body}>
        <div style={{...S.card,marginBottom:"14px"}}>
          <div style={{fontSize:"12px",color:subCol,marginBottom:"6px"}}>🕐 {fmtFull(dream.timestamp)}</div>
          {dream.mood&&<span style={S.tag(C.gold)}>{dream.mood}</span>}
          {dream.location&&<span style={S.tag(C.blue)}>📍 {dream.location}</span>}
        </div>
        <div style={{display:"flex",gap:"6px",marginBottom:"14px",flexWrap:"wrap"}}>
          {[["all",t.allViews,C.purple],["islamic",t.islamic,C.gold],["psych",t.psych,"#7cb8d4"],["biblical",t.biblical,"#c4956a"]].map(([v,lb,col])=>(
            <button key={v} onClick={()=>setInterpView(v)} style={{padding:"7px 14px",borderRadius:"20px",border:`1.5px solid ${interpView===v?col:`${col}44`}`,background:interpView===v?`${col}22`:"transparent",color:interpView===v?col:subCol,cursor:"pointer",fontSize:"12px",fontFamily:"inherit",fontWeight:interpView===v?"bold":"normal"}}>{lb}</button>
          ))}
        </div>
        <div style={{...S.card,lineHeight:"1.8"}}>{getLines(dream.interpretation||"",interpView).map((l,i)=>renderLine(l,i))}</div>
        <div style={{...S.card,marginTop:"4px"}}>
          <div style={{fontSize:"11px",color:subCol,marginBottom:"10px",fontWeight:"600",letterSpacing:"0.5px"}}>{t.shareExport}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
            <button style={S.smBtn(C.blue)} onClick={()=>{navigator.clipboard.writeText(dream.interpretation||"");setCopied(true);setTimeout(()=>setCopied(false),2000);}}>{copied?t.copied:t.copy}</button>
            <button style={S.smBtn("#4caf50")} onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent("🌙 "+dream.title+"\n\n"+dream.interpretation)}`)}>{t.whatsapp}</button>
            <button style={S.smBtn("#2ca5e0")} onClick={()=>window.open(`https://t.me/share/url?text=${encodeURIComponent("🌙 "+dream.title+"\n\n"+dream.interpretation)}`)}>{t.telegram}</button>
            <button style={S.smBtn(C.purple)} onClick={()=>window.print()}>{t.print}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── HISTORY ────────────────────────────────────────────────────
function History({S,C,t,dreams,delDream,setSelected,setScreen,isDark,textCol,subCol,borderCol,goBack}){
  const [q,setQ]=useState("");
  const list=dreams.filter(d=>d.title.toLowerCase().includes(q.toLowerCase())||d.dream?.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>📜 {t.history}</span><span style={{fontSize:"12px",color:subCol}}>{dreams.length}</span></div>
      <div style={S.body}>
        <input style={S.inp} placeholder={t.searchDreams} value={q} onChange={e=>setQ(e.target.value)}/>
        {list.length===0?<div style={{textAlign:"center",color:subCol,padding:"60px 20px"}}><div style={{fontSize:"44px",marginBottom:"12px"}}>🌙</div><div>{q?t.noMatch:t.noDreams}</div></div>
        :list.map(d=>(
          <div key={d.id} style={{...S.card,cursor:"pointer"}} onClick={()=>{setSelected(d);setScreen("result");}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1,paddingRight:"8px"}}><div style={{fontWeight:"600",fontSize:"14px",marginBottom:"3px"}}>{d.title}</div><div style={{fontSize:"11px",color:subCol}}>{fmtFull(d.timestamp)}</div></div>
              <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"4px"}}>
                <span style={{fontSize:"20px"}}>{d.mood?.split(" ")[0]||"🌙"}</span>
                {d.scores&&<span style={{fontSize:"10px",color:C.purple}}>⭐{d.scores.mystery}/10</span>}
              </div>
            </div>
            <div style={{fontSize:"12px",color:subCol,marginTop:"6px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.dream}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"8px"}}>
              {d.interpretation?<span style={{fontSize:"11px",color:C.green}}>✓ {t.interpreted}</span>:<span style={{fontSize:"11px",color:subCol}}>{t.notAnalyzed}</span>}
              <button onClick={(e)=>{e.stopPropagation();if(confirm(t.deleteDream))delDream(d.id);}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:"12px",fontFamily:"inherit"}}>🗑</button>
            </div>
          </div>
        ))}
      </div>
      <BottomNav screen="history" setScreen={setScreen} S={S} t={t}/>
    </div>
  );
}

// ── INSIGHTS ───────────────────────────────────────────────────
function Insights({S,C,t,dreams,isDark,textCol,subCol,borderCol,goBack,lang}){
  const [insight,setInsight]=useState("");const [busy,setBusy]=useState(false);
  const total=dreams.length;
  const mC=dreams.reduce((a,d)=>{if(d.mood)a[d.mood]=(a[d.mood]||0)+1;return a;},{});
  const interped=dreams.filter(d=>d.interpretation).length;
  const avgM=dreams.filter(d=>d.scores).reduce((a,d)=>a+d.scores.mystery,0)/Math.max(dreams.filter(d=>d.scores).length,1);
  const pos=dreams.filter(d=>d.mood&&["Joyful","Peaceful","Mystical"].some(x=>d.mood.includes(x))).length;
  const str=dreams.filter(d=>d.mood&&["Frightening","Stressed","Sad"].some(x=>d.mood.includes(x))).length;
  const sC={};dreams.forEach(d=>{(d.objects||"").split(",").forEach(s=>{const k=s.trim().toLowerCase();if(k)sC[k]=(sC[k]||0)+1;});});
  const topS=Object.entries(sC).sort((a,b)=>b[1]-a[1]).slice(0,5);
  async function gen(){
    setBusy(true);
    const sums=dreams.slice(0,10).map(d=>`"${d.title}": ${d.dream.slice(0,80)}`).join("\n");
    const txt=await callGemini(`Respond in ${lang==="uz"?"Uzbek":lang==="ru"?"Russian":"English"}. You are a compassionate dream analyst. In 3–4 warm sentences, give a personal insight about this person's inner world based on their dreams. Be specific.\n\nDreams:\n${sums}`);
    setInsight(txt);setBusy(false);
  }
  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>📊 {t.insights}</span><span style={{fontSize:"12px",color:subCol}}>{total}</span></div>
      <div style={S.body}>
        {total===0?<div style={{textAlign:"center",color:subCol,padding:"60px 20px"}}><div style={{fontSize:"44px",marginBottom:"12px"}}>📊</div><div>{t.noInsightData}</div></div>:<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",marginBottom:"14px"}}>
            {[[total,t.totalDreams],[interped,t.analyzed],[Math.round(avgM*10)/10,t.mysteryScore]].map(([v,l])=>(
              <div key={l} style={{...S.card,textAlign:"center",padding:"14px 8px"}}>
                <div style={{fontSize:"24px",color:C.gold,fontWeight:"bold"}}>{v}</div>
                <div style={{fontSize:"10px",color:subCol,marginTop:"4px"}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={S.card}>
            <div style={{fontWeight:"600",fontSize:"14px",marginBottom:"14px"}}>{t.moodOverview}</div>
            <div style={{display:"flex",gap:"8px",marginBottom:"14px"}}>
              {[[t.positive,pos,C.green],[t.neutral,total-pos-str,C.gold],[t.stress,str,C.red]].map(([l,v,col])=>(
                <div key={l} style={{flex:1,background:`${col}15`,border:`1px solid ${col}33`,borderRadius:"10px",padding:"12px 8px",textAlign:"center"}}>
                  <div style={{fontSize:"20px",color:col,fontWeight:"bold"}}>{total?Math.round(v/total*100):0}%</div>
                  <div style={{fontSize:"11px",color:subCol,marginTop:"2px"}}>{l}</div>
                </div>
              ))}
            </div>
            {Object.entries(mC).map(([mood,count])=>(
              <div key={mood} style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
                <span style={{width:"105px",fontSize:"12px",color:subCol,flexShrink:0}}>{mood}</span>
                <div style={{flex:1,height:"7px",background:isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)",borderRadius:"4px",overflow:"hidden"}}>
                  <div style={{width:`${(count/total)*100}%`,height:"100%",background:MOOD_COLOR[mood]||C.gold,borderRadius:"4px"}}/>
                </div>
                <span style={{fontSize:"11px",color:subCol,width:"16px"}}>{count}</span>
              </div>
            ))}
          </div>
          {topS.length>0&&<div style={S.card}>
            <div style={{fontWeight:"600",fontSize:"14px",marginBottom:"10px"}}>{t.commonSymbols}</div>
            {topS.map(([sym,cnt])=>(
              <div key={sym} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${borderCol}`}}>
                <span style={{fontSize:"13px",textTransform:"capitalize"}}>{sym}</span>
                <span style={{fontSize:"12px",color:C.gold,fontWeight:"600"}}>{cnt}×</span>
              </div>
            ))}
          </div>}
          <div style={{background:"linear-gradient(135deg,rgba(124,92,191,0.15),rgba(74,144,217,0.15))",border:`1px solid ${borderCol}`,borderRadius:"14px",padding:"16px",marginBottom:"12px"}}>
            <div style={{fontWeight:"600",fontSize:"14px",marginBottom:"10px",color:C.gold}}>{t.overallInsight}</div>
            {insight?<div style={{fontSize:"13px",color:isDark?"#c0b898":"#4a4a5a",lineHeight:"1.8"}}>{insight}</div>
            :busy?<div style={{fontSize:"13px",color:subCol,textAlign:"center",padding:"16px"}}>🔮 Generating...</div>
            :<button onClick={gen} style={{...S.gradBtn,marginBottom:0}}>{t.aiCoach}</button>}
          </div>
        </>}
      </div>
      <BottomNav screen="insights" setScreen={()=>{}} S={S} t={t}/>
    </div>
  );
}

// ── DICTIONARY ─────────────────────────────────────────────────
function Dictionary({S,C,t,SYMBOLS,isDark,textCol,subCol,borderCol,goBack}){
  const [q,setQ]=useState("");const [exp,setExp]=useState(null);
  const list=SYMBOLS.filter(s=>s.s.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>🔍 {t.dictionary}</span><span style={{fontSize:"12px",color:subCol}}>{SYMBOLS.length}</span></div>
      <div style={S.body}>
        <input style={S.inp} placeholder={t.searchDreams} value={q} onChange={e=>setQ(e.target.value)}/>
        {list.map((s,i)=>(
          <div key={i} style={{...S.card,cursor:"pointer"}} onClick={()=>setExp(exp===i?null:i)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:"600",fontSize:"15px"}}>{s.s}</span>
              <span style={{color:subCol,fontSize:"13px"}}>{exp===i?"▲":"▼"}</span>
            </div>
            {exp===i&&<div style={{marginTop:"12px",display:"flex",flexDirection:"column",gap:"8px"}}>
              {[["☪️ Islamic",s.i,C.gold],["🧠 Psychology",s.p,"#7cb8d4"],["✝️ Biblical",s.b,"#c4956a"]].map(([lb,tx,col])=>(
                <div key={lb} style={{background:`${col}11`,border:`1px solid ${col}33`,borderRadius:"8px",padding:"10px"}}>
                  <div style={{fontSize:"11px",color:col,fontWeight:"bold",marginBottom:"4px"}}>{lb}</div>
                  <div style={{fontSize:"13px",color:isDark?"#c0b898":"#4a4a5a",lineHeight:"1.6"}}>{tx}</div>
                </div>
              ))}
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PAYWALL ────────────────────────────────────────────────────
function Paywall({S,C,t,usage,setUsage,setScreen,goBack,isDark,textCol,subCol,borderCol,PLANS,PROMOS}){
  const [promo,setPromo]=useState("");const [msg,setMsg]=useState("");const [ok,setOk]=useState(false);
  function apply(){
    const code=promo.trim().toUpperCase();
    if(getUsedCodes().includes(code)){setMsg(t.invalidPromo);setOk(false);return;}
    let found=null;
    for(const [plan,codes] of Object.entries(PROMOS)){if(codes.map(c=>c.toUpperCase()).includes(code)){found=plan;break;}}
    if(!found){setMsg(t.invalidPromo);setOk(false);return;}
    const pd=PLANS.find(p=>p.id===found);
    const analyzes=found==="bonus"?30:(pd?.analyzes||25);
    addUsedCode(code);
    const log={date:new Date().toISOString(),plan:found,analyzes,code};
    setUsage(u=>({...u,count:0,analyzes,plan:found,subLogs:[log,...(u.subLogs||[])]}));
    setMsg(`${t.promoOk} +${analyzes}`);setOk(true);
    setTimeout(()=>setScreen("home"),1600);
  }
  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>{t.payTitle}</span><div style={{width:"50px"}}/></div>
      <div style={S.body}>
        <div style={{textAlign:"center",marginBottom:"24px"}}>
          <div style={{fontSize:"52px",marginBottom:"10px"}}>🔒</div>
          <div style={{fontSize:"17px",fontWeight:"bold",color:textCol,marginBottom:"6px"}}>{t.paySubtitle}</div>
          <div style={{fontSize:"13px",color:subCol}}>{t.payDesc}</div>
        </div>
        {PLANS.map(plan=>(
          <div key={plan.id} style={{...S.card,border:`2px solid ${plan.popular?plan.color:borderCol}`,position:"relative",marginBottom:"14px"}}>
            {plan.popular&&<div style={{position:"absolute",top:"-11px",right:"14px",background:plan.color,borderRadius:"8px",padding:"3px 12px",fontSize:"11px",color:"#fff",fontWeight:"bold"}}>{t.popular}</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
              <div><div style={{fontWeight:"bold",fontSize:"17px",color:plan.color}}>{t[plan.lk]}</div><div style={{fontSize:"13px",color:subCol,marginTop:"2px"}}>✨ {plan.analyzes} {t.analyzesPlan}</div></div>
              <div style={{fontSize:"24px",fontWeight:"bold"}}>{plan.price}</div>
            </div>
            <a href="https://t.me/AbduvaliyevGK" target="_blank" rel="noreferrer" style={{display:"block",background:`linear-gradient(135deg,${plan.color},${plan.color}99)`,borderRadius:"10px",padding:"11px",color:"#fff",fontFamily:"inherit",fontSize:"14px",fontWeight:"bold",textAlign:"center",textDecoration:"none",boxSizing:"border-box"}}>📲 {t.contactBtn}</a>
          </div>
        ))}
        <div style={S.card}>
          <div style={{fontSize:"14px",fontWeight:"600",color:textCol,marginBottom:"10px"}}>{t.havePromo}</div>
          <div style={{display:"flex",gap:"8px",marginBottom:"6px"}}>
            <input style={{...S.inp,marginBottom:0,flex:1}} placeholder={t.enterPromo} value={promo} onChange={e=>setPromo(e.target.value)} onKeyDown={e=>e.key==="Enter"&&apply()}/>
            <button onClick={apply} style={{background:C.purple,border:"none",borderRadius:"10px",padding:"0 16px",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:"13px",fontWeight:"bold",whiteSpace:"nowrap"}}>{t.applyBtn}</button>
          </div>
          {msg&&<div style={{fontSize:"12px",color:ok?C.green:C.red,marginTop:"4px"}}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS ───────────────────────────────────────────────────
function Settings({S,C,t,T,session,setSession,theme,setTheme,lang,setLang,isDark,textCol,subCol,borderCol,usage,setUsage,PLANS,PROMOS,goBack,dreams}){
  const [tab,setTab]=useState("account");
  const [promo,setPromo]=useState("");const [pmsg,setPmsg]=useState("");const [pok,setPok]=useState(false);
  function applyPromo(){
    const code=promo.trim().toUpperCase();
    if(getUsedCodes().includes(code)){setPmsg(t.invalidPromo);setPok(false);return;}
    let found=null;
    for(const [plan,codes] of Object.entries(PROMOS)){if(codes.map(c=>c.toUpperCase()).includes(code)){found=plan;break;}}
    if(!found){setPmsg(t.invalidPromo);setPok(false);return;}
    const pd=PLANS.find(p=>p.id===found);
    const analyzes=found==="bonus"?30:(pd?.analyzes||25);
    addUsedCode(code);
    const log={date:new Date().toISOString(),plan:found,analyzes,code};
    setUsage(u=>({...u,count:0,analyzes,plan:found,subLogs:[log,...(u.subLogs||[])]}));
    setPmsg(`${t.promoOk} +${analyzes}`);setPok(true);
  }
  const tabs=[["account",t.accountTab],["plan",t.planTab],["lang",t.langTab],["theme",t.themeTab],["about",t.aboutTab]];
  const logs=usage.subLogs||[];
  return (
    <div style={S.app}>
      <div style={S.hdr}><button style={S.backBtn} onClick={goBack}>{t.back}</button><span style={S.logo}>⚙️ {t.settingsTitle}</span><div style={{width:"50px"}}/></div>
      <div style={{display:"flex",overflowX:"auto",borderBottom:`1px solid ${borderCol}`,background:isDark?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)",scrollbarWidth:"none"}}>
        {tabs.map(([id,lb])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flexShrink:0,background:"none",border:"none",borderBottom:`2px solid ${tab===id?C.gold:"transparent"}`,color:tab===id?C.gold:subCol,padding:"11px 16px",cursor:"pointer",fontFamily:"inherit",fontSize:"12px",whiteSpace:"nowrap"}}>{lb}</button>
        ))}
      </div>
      <div style={S.body}>
        {tab==="account"&&<div style={S.card}>
          <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"16px"}}>
            <div style={{width:"50px",height:"50px",borderRadius:"50%",background:`linear-gradient(135deg,${C.purple},${C.blue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",fontWeight:"bold",color:"#fff",flexShrink:0}}>{session?.username?.[0]?.toUpperCase()||"U"}</div>
            <div><div style={{fontSize:"16px",fontWeight:"bold",color:textCol}}>{session?.username}</div><div style={{fontSize:"12px",color:subCol,marginTop:"2px"}}>{session?.email}</div></div>
          </div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"12px"}}>
            <span style={S.tag(C.green)}>✅ Verified</span>
            <span style={S.tag(C.gold)}>{usage.plan}</span>
            <span style={S.tag(C.blue)}>✨ {Math.max(0,usage.analyzes-usage.count)} {t.remaining}</span>
          </div>
          <div style={{fontSize:"12px",color:subCol,marginBottom:"16px",lineHeight:"1.6"}}>📖 {dreams.length} dreams · 🔮 {dreams.filter(d=>d.interpretation).length} analyzed</div>
          <button style={S.outBtn(C.red)} onClick={()=>setSession(null)}>{t.logout}</button>
        </div>}
        {tab==="plan"&&<>
          <div style={{background:"linear-gradient(135deg,rgba(124,92,191,0.2),rgba(74,144,217,0.2))",border:`1px solid ${borderCol}`,borderRadius:"14px",padding:"16px",textAlign:"center",marginBottom:"14px"}}>
            <div style={{fontSize:"13px",color:subCol,marginBottom:"4px"}}>{t.currentUsage}</div>
            <div style={{fontSize:"36px",color:C.gold,fontWeight:"bold",lineHeight:1}}>{Math.max(0,usage.analyzes-usage.count)}</div>
            <div style={{fontSize:"12px",color:subCol,marginTop:"4px"}}>{t.remaining} · <span style={{color:C.gold}}>{usage.plan}</span></div>
          </div>
          <div style={{fontSize:"13px",color:subCol,marginBottom:"14px",lineHeight:"1.7",padding:"12px",background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)",borderRadius:"10px"}}>{t.buyContact}</div>
          {PLANS.map(plan=>(
            <div key={plan.id} style={{...S.card,border:`2px solid ${plan.popular?plan.color:borderCol}`,position:"relative",marginBottom:"14px"}}>
              {plan.popular&&<div style={{position:"absolute",top:"-11px",right:"14px",background:plan.color,borderRadius:"8px",padding:"3px 12px",fontSize:"11px",color:"#fff",fontWeight:"bold"}}>{t.popular}</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                <div><div style={{fontWeight:"bold",fontSize:"16px",color:plan.color}}>{t[plan.lk]}</div><div style={{fontSize:"12px",color:subCol,marginTop:"2px"}}>✨ {plan.analyzes} {t.analyzesPlan}</div></div>
                <div style={{fontSize:"22px",fontWeight:"bold"}}>{plan.price}</div>
              </div>
              <a href="https://t.me/AbduvaliyevGK" target="_blank" rel="noreferrer" style={{display:"block",background:`linear-gradient(135deg,${plan.color},${plan.color}88)`,borderRadius:"10px",padding:"10px",color:"#fff",fontFamily:"inherit",fontSize:"13px",fontWeight:"bold",textAlign:"center",textDecoration:"none",boxSizing:"border-box"}}>📲 {t.contactBtn}</a>
            </div>
          ))}
          <div style={S.card}>
            <div style={{fontSize:"14px",fontWeight:"600",color:textCol,marginBottom:"10px"}}>{t.promoCode}</div>
            <div style={{display:"flex",gap:"8px",marginBottom:"6px"}}>
              <input style={{...S.inp,marginBottom:0,flex:1}} placeholder={t.enterPromo} value={promo} onChange={e=>setPromo(e.target.value)} onKeyDown={e=>e.key==="Enter"&&applyPromo()}/>
              <button onClick={applyPromo} style={{background:C.purple,border:"none",borderRadius:"10px",padding:"0 14px",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:"13px",fontWeight:"bold",whiteSpace:"nowrap"}}>{t.applyBtn}</button>
            </div>
            {pmsg&&<div style={{fontSize:"12px",color:pok?C.green:C.red}}>{pmsg}</div>}
          </div>
          <div style={S.card}>
            <div style={{fontWeight:"600",color:textCol,marginBottom:"12px"}}>{t.subLogs}</div>
            {logs.length===0?<div style={{fontSize:"13px",color:subCol}}>{t.noLogs}</div>
            :logs.map((l,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${borderCol}`}}>
                <div><div style={{color:textCol,fontWeight:"600",fontSize:"13px"}}>{l.plan} · +{l.analyzes} {t.analyzesPlan}</div><div style={{color:subCol,fontSize:"11px",marginTop:"2px"}}>{fmtFull(l.date)} · <span style={{color:C.gold}}>{l.code}</span></div></div>
                <span style={{color:C.green,fontSize:"18px"}}>✓</span>
              </div>
            ))}
          </div>
        </>}
        {tab==="lang"&&<div style={S.card}>
          <div style={{fontWeight:"600",color:textCol,marginBottom:"16px"}}>{t.langLabel}</div>
          {[["en","🇬🇧 English"],["ru","🇷🇺 Русский"],["uz","🇺🇿 O'zbek"]].map(([l,lb])=>(
            <button key={l} onClick={()=>setLang(l)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:lang===l?`${C.gold}15`:"transparent",border:`1.5px solid ${lang===l?C.gold:borderCol}`,borderRadius:"12px",padding:"14px 16px",color:lang===l?C.gold:textCol,cursor:"pointer",fontFamily:"inherit",fontSize:"14px",marginBottom:"10px",boxSizing:"border-box"}}>
              <span>{lb}</span>{lang===l&&<span style={{color:C.gold}}>✓</span>}
            </button>
          ))}
        </div>}
        {tab==="theme"&&<div style={S.card}>
          <div style={{fontWeight:"600",color:textCol,marginBottom:"16px"}}>🎨 Theme</div>
          {[["dark",t.themeDark],["light",t.themeLight]].map(([th,lb])=>(
            <button key={th} onClick={()=>setTheme(th)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:theme===th?`${C.gold}15`:"transparent",border:`1.5px solid ${theme===th?C.gold:borderCol}`,borderRadius:"12px",padding:"14px 16px",color:theme===th?C.gold:textCol,cursor:"pointer",fontFamily:"inherit",fontSize:"14px",marginBottom:"10px",boxSizing:"border-box"}}>
              <span>{lb}</span>{theme===th&&<span style={{color:C.gold}}>✓</span>}
            </button>
          ))}
        </div>}
        {tab==="about"&&<div style={S.card}>
          <div style={{textAlign:"center",marginBottom:"16px"}}><div style={{fontSize:"48px",marginBottom:"8px"}}>🌙</div><div style={{fontSize:"18px",fontWeight:"bold",color:C.gold}}>DreamDecoder</div></div>
          <div style={{fontSize:"13px",color:subCol,lineHeight:"2",whiteSpace:"pre-line",marginBottom:"16px",textAlign:"center"}}>{t.aboutText}</div>
          <a href="https://t.me/AbduvaliyevGK" target="_blank" rel="noreferrer" style={{display:"block",background:`linear-gradient(135deg,${C.blue},${C.purple})`,borderRadius:"12px",padding:"13px",color:"#fff",fontFamily:"inherit",fontSize:"14px",fontWeight:"bold",textAlign:"center",textDecoration:"none",boxSizing:"border-box"}}>📲 t.me/AbduvaliyevGK</a>
        </div>}
      </div>
    </div>
  );
}

// ── BOTTOM NAV ─────────────────────────────────────────────────
function BottomNav({screen,setScreen,S,t}){
  const items=[["home","🏠",t.home],["analyze","✍️",t.newDream],["history","📜",t.history],["insights","📊",t.insights],["dictionary","🔍",t.dictionary]];
  return (
    <div style={S.nav}>
      {items.map(([sc,icon,label])=>(
        <button key={sc} style={S.navB(screen===sc)} onClick={()=>setScreen(sc)}>
          <span style={{fontSize:"20px"}}>{icon}</span>
          <span>{label.replace(/[^\w\s]/g,"").trim().split(" ").pop().slice(0,7)}</span>
        </button>
      ))}
    </div>
  );
}
