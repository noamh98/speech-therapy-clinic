// src/pages/AIAssistant.jsx
import { useState, useRef, useEffect } from 'react';
import { PageHeader, Spinner } from '../components/ui';
import { Bot, Send, User, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';

const SUGGESTED = [
  'כיצד לתעד מטרות טיפול ביעילות?',
  'מה הפרוטוקול המומלץ לטיפול בפיגור שפתי?',
  'עזור לי לנסח סיכום מפגש',
  'כיצד להעריך דיסלקסיה בילדים?',
];

// Stub AI response – replace with real Anthropic / OpenAI call
async function callAI(messages) {
  // TODO: Replace with real LLM integration.
  // Example using Anthropic (via Cloud Function proxy to keep API key server-side):
  //
  // const res = await fetch('https://your-cloud-function-url/chat', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await auth.currentUser.getIdToken()}` },
  //   body: JSON.stringify({ messages }),
  // });
  // const data = await res.json();
  // return data.content;

  await new Promise(r => setTimeout(r, 1200)); // simulate latency

  const last = messages[messages.length - 1]?.content?.toLowerCase() || '';
  if (last.includes('מטרות')) {
    return `**מטרות טיפול** צריכות להיות מנוסחות לפי מודל SMART:\n\n- **ספציפיות** (Specific)\n- **מדידות** (Measurable)\n- **ניתנות להשגה** (Achievable)\n- **רלוונטיות** (Relevant)\n- **תחומות בזמן** (Time-bound)\n\nדוגמה: *"הילד/ה יזהה 80% מהצלילים הפוסקים בתוך 3 חודשים"*`;
  }
  if (last.includes('סיכום')) {
    return `**תבנית לסיכום מפגש:**\n\n1. **פעילויות שבוצעו:** (רשום כאן)\n2. **תגובת המטופל/ת:**\n3. **עמידה ביעדים:** (אחוז מהיעד שהושג)\n4. **תכנית לפגישה הבאה:**\n\nרוצה שאעזור לך לנסח סיכום ספציפי?`;
  }
  return `שאלה מצוינת! אני יכול לסייע בשאלות מקצועיות בתחום קלינאות תקשורת, ניסוח סיכומי טיפול, והמלצות על פרוטוקולי טיפול. \n\nכרגע אני פועל במצב הדגמה. בגרסה המלאה, אחובר ל-LLM מלא עם גישה לנתוני המערכת שלך.`;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'שלום! אני העוזר המקצועי שלך לקלינאות תקשורת. איך אוכל לסייע?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    const newMessages = [...messages, { role: 'user', content: msg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const response = await callAI(newMessages);
      setMessages(m => [...m, { role: 'assistant', content: response }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <PageHeader title="עוזר AI" subtitle="שאלות מקצועיות, ניסוח סיכומים, ייעוץ טיפולי" />

      {/* Suggested prompts */}
      {messages.length === 1 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {SUGGESTED.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-sm text-right p-3 bg-white border border-gray-100 rounded-xl hover:border-teal-300 hover:bg-teal-50 transition-all text-gray-600"
            >
              <Sparkles className="w-3 h-3 inline ml-1 text-teal-500" />
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 px-1">
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
              ${m.role === 'user' ? 'bg-teal-500' : 'bg-gradient-to-br from-purple-500 to-blue-600'}`}>
              {m.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
            </div>
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm
              ${m.role === 'user'
                ? 'bg-teal-500 text-white rounded-tr-sm'
                : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
              }`}>
              {m.role === 'assistant'
                ? <div className="prose prose-sm max-w-none"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                : m.content
              }
            </div>
          </motion.div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <span className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="שאל שאלה מקצועית..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={loading}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="btn-primary px-4 flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
