// src/pages/AdvancedReports.jsx
import { PageHeader, Card } from '../components/ui';
import { TrendingUp } from 'lucide-react';

export default function AdvancedReports() {
  return (
    <div className="space-y-4">
      <PageHeader title="דוחות מתקדמים" subtitle="ניתוח מעמיק של נתוני הקליניקה" />
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { title: 'ניתוח מגמות', desc: 'ניתוח מגמות לאורך זמן בטיפולים והכנסות' },
          { title: 'פילוח מטופלים', desc: 'פילוח לפי גיל, תחום טיפולי, תדירות ביקורים' },
          { title: 'ניתוח ביטולים', desc: 'ניתוח דפוסי ביטולים והחמצות לפי יום ושעה' },
          { title: 'ניתוח גבייה', desc: 'ניתוח מצב גבייה, חובות ותקופות תשלום' },
        ].map(r => (
          <Card key={r.title} className="flex gap-3 items-start cursor-pointer hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{r.title}</p>
              <p className="text-sm text-gray-500 mt-0.5">{r.desc}</p>
              <p className="text-xs text-purple-500 mt-2">בפיתוח – יהיה זמין בקרוב</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
