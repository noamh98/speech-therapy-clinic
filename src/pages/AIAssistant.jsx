// src/pages/AIAssistant.jsx — AI Assistant with Google Gemini 1.5 Flash
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useClinicData } from '../context/useClinicData';
import {
  Bot, Send, User, Sparkles, RefreshCw, Copy, Check,
  AlertCircle, Lightbulb, ChevronDown, Brain
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { motion, AnimatePresence } from 'framer-motion';
import { localDateStr, formatCurrency } from '../utils/formatters';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';

// ─── Suggested prompts (grouped by category) ─────────────────────────────
const SUGGESTED_GROUPS = [
  {
    label: 'תיעוד קליני',
    icon: '📋',
    prompts: [
      'עזור לי לנסח סיכום מפגש לילד עם פיגור שפתי',
      'כתוב מטרות טיפול בפונולוגיה לגיל 5',
      'נסח דוח לקופת חולים עבור מטופל עם גמגום',
    ],
  },
  {
    label: 'תובנות מהמערכת',
    icon: '📊',
    prompts: [
      'אילו מטופלים לא היו בטיפול מעל 30 יום?',
      'מה הסטטוס הכולל של הקליניקה החודש?',
      'האם יש תשלומים שלא התקבלו?',
    ],
  },
  {
    label: 'הנחיות מקצועיות',
    icon: '🎓',
    prompts: [
      'מה הפרוטוקול המומלץ להערכת דיסלקסיה?',
      'כיצד לעבוד עם ילד עם ASD על פרגמטיקה?',
      'מהם קריטריוני הזכאות לטיפול בסל הבריאות?',
    ],
  },
];

// ─── Build system prompt with live clinic context ─────────────────────────────
// עדכון: הפונקציה מקבלת כעת גם את paymentStats ו-payments לסנכרון מלא
function buildSystemPrompt({ patients, appointments, treatments, today, paymentStats, payments, patientMap }) {
  const activePatients = patients.filter(p => p.status === 'active' && !p.is_archived);
  const todayAppts = appointments.filter(a => a.date === today && a.status === 'scheduled');

  // שימוש בנתונים המסונכרנים מהקונטקסט במקום חישוב ידני חלקי
  const monthRevenue = paymentStats.completed_amount || 0;
  const pendingRevenue = paymentStats.pending_amount || 0;
  
  // הכנת רשימת חובות ספציפית עבור ה-AI
  const pendingList = payments
    .filter(p => p.payment_status === 'pending')
    .slice(0, 10)
    .map(p => {
      const name = patientMap[p.patientId || p.patient_id]?.full_name || 'מטופל';
      return `  • ${name}: ${p.amount}₪ (${p.payment_date})`;
    }).join('\n');

  // Overdue patients (no appointment in last 30 days)
  const thirtyDaysAgo = localDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const recentPatientIds = new Set(
    appointments.filter(a => a.date >= thirtyDaysAgo).map(a => a.patient_id)
  );
  const overduePatients = activePatients
    .filter(p => !recentPatientIds.has(p.id))
    .map(p => p.full_name)
    .slice(0, 10);

  // Today's appointments list
  const todayList = todayAppts
    .map(a => `  • ${patientMap[a.patient_id]?.full_name || 'מטופל'} בשעה ${a.start_time || '?'}`)
    .join('\n') || '  (אין תורים היום)';

  // Upcoming 7 days
  const in7 = localDateStr(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const upcomingCount = appointments.filter(
    a => a.date > today && a.date <= in7 && a.status === 'scheduled'
  ).length;

  return `אתה עוזר קליני מקצועי למערכת ניהול קליניקת קלינאות תקשורת בישראל בשם "SpeechCare".

## תפקידך
אתה מסייע לקלינאי/ת התקשורת בתיעוד, הנחיות מקצועיות ותובנות ניהוליות.

## נתוני הקליניקה (מסונכרנים בזמן אמת):
- **תאריך היום:** ${today}
- **מטופלים פעילים:** ${activePatients.length}
- **תורים היום:**
${todayList}
- **תורים ב-7 ימים הקרובים:** ${upcomingCount}
- **הכנסות שהתקבלו החודש (סטטוס שולם):** ${formatCurrency(monthRevenue)}
- **תשלומים ממתינים/חובות (סטטוס בהמתנה):** ${formatCurrency(pendingRevenue)}
${pendingRevenue > 0 ? `\nפירוט חובות חלקי:\n${pendingList}` : ''}
- **מטופלים ללא תור מעל 30 יום:** ${overduePatients.length > 0 ? overduePatients.join(', ') : 'אין'}

## כללי התנהגות
- **אמינות הנתונים:** כששואלים על כסף, השתמש אך ורק בנתוני ההכנסות והחובות שצוינו לעיל. אל תחשב אותם מחדש לפי כמות הטיפולים.
- **שפה:** ענה תמיד בעברית מקצועית ואדיבה.
- **פרטיות:** לעולם אל תציג פרטים מזהים רגישים.
- **תובנות:** אם שואלים על "סטטוס הקליניקה", סכם את מצב התורים והתשלומים (שולמו מול ממתינים).`;
}

// ─── Google Gemini API call via Cloud Function ───────────────────────────────
// SECURITY: API calls go through backend Cloud Function which keeps API key secure
async function callGemini(messages, systemPrompt) {
  try {
    const callGeminiFunction = httpsCallable(functions, 'callGemini');
    const result = await callGeminiFunction({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      systemPrompt: systemPrompt,
    });

    if (!result.data?.reply) {
      throw new Error('Empty response from Gemini');
    }

    return result.data.reply;
  } catch (err) {
    console.error('Gemini call error:', err);
    throw new Error(err.message || 'Failed to get response from Gemini API');
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AIAssistant() {
  const { user } = useAuth();
  const { 
    patients, 
    appointments, 
    treatments, 
    payments, 
    paymentStats, 
    patientMap, 
    fetchAll, 
    hasFetched 
  } = useClinicData();

  const today = localDateStr();

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `שלום! אני העוזר הקליני של SpeechCare 🩺\n\nאני יכול לסייע לך ב:\n- **תיעוד קליני** — סיכומי מפגש, מטרות SMART, דוחות\n- **תובנות מהמערכת** — ניתוח נתוני המטופלים שלך\n- **הנחיות מקצועיות** — פרוטוקולים, כלי הערכה\n\nאיך אוכל לסייע היום?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [activeGroup, setActiveGroup] = useState(0);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!hasFetched) fetchAll();
  }, [hasFetched, fetchAll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // בניית ה-Prompt עם הנתונים המורחבים
  const systemPrompt = useMemo(() => buildSystemPrompt({ 
    patients, 
    appointments, 
    treatments, 
    today, 
    paymentStats, 
    payments, 
    patientMap 
  }), [patients, appointments, treatments, today, paymentStats, payments, patientMap]);

  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    // SECURITY: Rate limiting — max 1 message per 2 seconds
    const now = Date.now();
    if (now - lastMessageTime < 2000) {
      setError('⏳ אנא חכה 2 שניות בין הודעות');
      return;
    }
    setLastMessageTime(now);

    setInput('');
    setError(null);
    setShowSuggestions(false);

    const newMessages = [...messages, { role: 'user', content: msg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const reply = await callGemini(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        systemPrompt
      );
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      console.error('Gemini call failed:', err);
      setError(err.message);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ אירעה שגיאה בחיבור ל-Gemini API.\n\n\`\`\`\n${err.message}\n\`\`\`\n\nאנא בדוק את הגדרות ה-API ונסה שוב.`,
        isError: true,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, loading, messages, systemPrompt, lastMessageTime]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const copyMessage = async (content, idx) => {
    await navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: 'שיחה חדשה התחילה. איך אוכל לסייע?',
    }]);
    setShowSuggestions(true);
    setError(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] lg:h-[calc(100vh-5rem)] max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            עוזר AI קליני
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {hasFetched
              ? `מחובר לנתוני הקליניקה — ${patients.length} מטופלים, ${appointments.length} תורים`
              : 'טוען נתוני קליניקה...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${
            hasFetched ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${hasFetched ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
            {hasFetched ? 'הקשר פעיל' : 'טוען הקשר'}
          </div>
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="נקה שיחה"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">נקה</span>
          </button>
        </div>
      </div>

      {/* ── Suggested Prompts ── */}
      <AnimatePresence>
        {showSuggestions && messages.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 flex-shrink-0 overflow-hidden"
          >
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
              {SUGGESTED_GROUPS.map((g, i) => (
                <button
                  key={i}
                  onClick={() => setActiveGroup(i)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                    activeGroup === i
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>{g.icon}</span>
                  {g.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SUGGESTED_GROUPS[activeGroup].prompts.map((s, i) => (
                <motion.button
                  key={s}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => send(s)}
                  className="text-sm text-right p-3 bg-white border border-gray-100 rounded-xl hover:border-purple-200 hover:bg-purple-50 transition-all text-gray-700 leading-snug group"
                >
                  <Sparkles className="w-3 h-3 inline ml-1 text-purple-400 group-hover:text-purple-600 transition-colors" />
                  {s}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chat Messages ── */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 px-1 scroll-smooth">
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm
              ${m.role === 'user'
                ? 'bg-blue-600'
                : m.isError
                  ? 'bg-red-100'
                  : 'bg-gradient-to-br from-purple-500 to-blue-600'
              }`}
            >
              {m.role === 'user'
                ? <User className="w-4 h-4 text-white" />
                : m.isError
                  ? <AlertCircle className="w-4 h-4 text-red-500" />
                  : <Bot className="w-4 h-4 text-white" />
              }
            </div>

            <div className={`relative max-w-[85%] md:max-w-[75%] group`}>
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed
                ${m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : m.isError
                    ? 'bg-red-50 border border-red-200 text-gray-800 rounded-tl-sm'
                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-strong:text-gray-900 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded">
                    <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span>{m.content}</span>
                )}
              </div>

              {m.role === 'assistant' && !m.isError && (
                <button
                  onClick={() => copyMessage(m.content, i)}
                  className="absolute -bottom-2 left-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-100 rounded-full px-2 py-0.5 shadow-sm transition-all"
                >
                  {copiedIdx === i
                    ? <><Check className="w-3 h-3 text-green-500" /> הועתק</>
                    : <><Copy className="w-3 h-3" /> העתק</>
                  }
                </button>
              )}
            </div>
          </motion.div>
        ))}

        {loading && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
                <span className="text-xs text-gray-400">חושב...</span>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="flex-shrink-0 space-y-2">
        {!showSuggestions && messages.length > 1 && (
          <button
            onClick={() => setShowSuggestions(true)}
            className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 transition-colors"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            הצג הצעות
          </button>
        )}

        <div className="flex gap-2 bg-white border border-gray-200 rounded-2xl p-2 shadow-sm focus-within:border-purple-300 focus-within:ring-2 focus-within:ring-purple-100 transition-all">
          <textarea
            ref={inputRef}
            className="flex-1 resize-none text-sm text-gray-800 placeholder:text-gray-400 bg-transparent outline-none px-2 py-1 max-h-32 min-h-[2.5rem] leading-relaxed"
            placeholder="שאל שאלה קלינית, בקש סיכום מפגש, או בקש תובנות..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
            style={{ height: 'auto' }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className={`self-end flex items-center justify-center w-9 h-9 rounded-xl transition-all flex-shrink-0
              ${input.trim() && !loading
                ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
          >
            {loading ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center">
          Enter לשליחה • מופעל ע"י Google Gemini 1.5 Flash • המידע מסונכרן לדאשבורד
        </p>
      </div>
    </div>
  );
}