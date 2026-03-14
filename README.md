# 🏥 מערכת ניהול קליניקת תקשורת

מערכת ניהול דיגיטלית מלאה לקלינאי/ות תקשורת.

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + framer-motion
- **Backend**: Firebase (Auth, Firestore, Storage)
- **UI**: Lucide React icons + Recharts charts
- **Language**: Hebrew RTL

---

## 🚀 Quick Start (Setup Instructions)

### 1. Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"** → name it (e.g. `clinic-app`)
3. Enable **Authentication** → Sign-in method → **Email/Password**
4. Enable **Firestore Database** → Start in **production mode**
5. Enable **Storage** → Start in **production mode**

### 2. Get Firebase Config

In Firebase Console → Project Settings → General → Your apps → **Add app** (Web `</>`) → register it → copy the `firebaseConfig` object.

### 3. Configure Environment

```bash
cp .env.example .env.local
# Edit .env.local and paste your Firebase values
```

### 4. Install & Run Locally

```bash
npm install
npm run dev
# Opens at http://localhost:5173
```

### 5. Create First Admin User

In Firebase Console → Authentication → Users → **Add user**:
- Email: `noamh98@gmail.com` (this is the admin)
- Set a password

### 6. Deploy Firestore Rules & Indexes

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore
```

### 7. Build & Deploy to Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

---

## 📁 Project Structure

```
src/
├── components/
│   ├── layout/        # Layout, sidebar, header
│   ├── shared/        # TreatmentDialog (reused across pages)
│   └── ui/            # Badge, Modal, Card, StatCard, etc.
├── context/
│   └── AuthContext.jsx  # Firebase Auth + user profile
├── pages/
│   ├── Dashboard.jsx
│   ├── Calendar.jsx
│   ├── Patients.jsx
│   ├── PatientProfile/
│   │   ├── index.jsx        # 4-tab wrapper
│   │   ├── PatientDetails.jsx
│   │   ├── PatientTreatments.jsx
│   │   ├── PatientProgress.jsx
│   │   └── PatientAppointments.jsx
│   ├── IntakeForms.jsx
│   ├── Reports.jsx
│   ├── AdvancedReports.jsx
│   ├── Templates.jsx
│   ├── AIAssistant.jsx
│   ├── Settings.jsx
│   ├── AdminUsers.jsx
│   └── PatientPortal.jsx
├── services/
│   ├── firebase.js       # Firebase init
│   ├── patients.js       # CRUD + ID validation
│   ├── appointments.js   # CRUD + overlap check + ICS
│   ├── treatments.js     # CRUD + 9th treatment logic
│   ├── notifications.js  # Create notification records
│   └── templates.js      # CRUD
└── utils/
    ├── jewishHolidays.js # Holiday list 2025–2030
    ├── icsUtils.js       # ICS export/import
    └── formatters.js     # Currency, dates, enums
```

## 🔒 Firestore Data Model

| Collection     | Key Fields                                                |
|---------------|-----------------------------------------------------------|
| `users`       | email, name, role (admin/user)                           |
| `patients`    | full_name, id_number, phone, email, status, therapist_email |
| `appointments`| patient_id, date, start_time, duration_minutes, status, series_id |
| `treatments`  | patient_id, treatment_number, date, amount, payment_status |
| `progress`    | patient_id, date, type, score, domain                    |
| `intakeForms` | patient_id, status, chief_complaint, medical_history     |
| `templates`   | name, type, active, default_goals, default_description   |
| `notifications`| type, recipient_email, status, channel                 |

All records include: `id`, `created_date`, `updated_date`, `created_by`, `therapist_email`

## 🤖 AI Assistant Integration

The AI Assistant currently uses a stub. To connect a real LLM:

1. Create a Firebase Cloud Function (`functions/src/chat.ts`)
2. Inside it, call Anthropic or OpenAI API using a server-side API key
3. In `AIAssistant.jsx`, replace the `callAI` stub with a `fetch` to your Cloud Function URL
4. Authenticate the call with `await auth.currentUser.getIdToken()`

## 📧 Email Notifications

The 9th-treatment notification is stored in Firestore (`notifications` collection).
To actually send emails, use the **Firebase Extension: "Trigger Email from Firestore"**:
1. Go to Firebase Extensions → Install "Trigger Email"
2. Configure with your SendGrid/SMTP credentials
3. The extension will watch the `notifications` collection and send emails automatically

## 📱 Mobile App Extension

This app is structured as a PWA-ready SPA. To extend to React Native / Expo:
- Share `services/` (Firebase calls) directly
- Share `utils/` (formatters, ICS, holidays)
- Rebuild UI components with React Native equivalents
- Firebase SDK has a dedicated React Native package (`@react-native-firebase`)
