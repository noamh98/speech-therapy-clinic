# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SpeechCare** — a full-stack clinic management system for speech therapy clinics, built in Hebrew with RTL support. React + Vite frontend, Firebase backend (Auth, Firestore, Storage, Cloud Functions), with Google Gemini AI integration.

## Commands

```bash
npm run dev        # Start dev server at http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
firebase deploy    # Deploy hosting, Firestore rules, and Cloud Functions
```

Environment: copy `.env.example` → `.env.local` and fill in `VITE_FIREBASE_*` variables plus `VITE_ADMIN_EMAIL`.

## Architecture

### State & Data Flow

Two core React contexts power the app:

- **`src/context/AuthContext.jsx`** — Firebase Auth + Firestore user profile (email/password + Google). Exposes `user`, `userProfile`, `isAdmin`, `loading`.
- **`src/context/useClinicData.jsx`** — Global clinic state: patients, appointments, treatments, payments. `fetchAll()` loads everything on login. State setters enable optimistic UI updates. Computes `docStatusMap` (appointment documentation status) and `paymentStats` live from the payments array.

### Multi-Tenancy

Every Firestore record has an `ownerId` field (Firebase Auth UID). All queries filter by `where('ownerId', '==', user.uid)`. Never filter by email — always use UID.

### Services Layer

`src/services/` wraps all Firestore and Firebase Storage operations. Key files:

- `patients.js`, `appointments.js`, `treatments.js`, `payments.js` — CRUD with `ownerId` isolation
- `treatments.js` — creating a treatment also auto-creates a linked payment record and triggers a 9th-treatment notification (stored in `notifications` collection)
- `appointments.js` — includes overlap detection and ICS export helpers
- `firebase.js` — exports `auth`, `db`, `storage`, `functions` instances

### Shared Components

- **`TreatmentDialog`** (`src/components/shared/TreatmentDialog.jsx`) — used everywhere a treatment is created/edited (Dashboard, Calendar, PatientProfile). It atomically creates treatment + payment records.
- **`PaymentModal` / `PaymentHistory`** — reusable payment UI used across patient views.
- **`src/components/ui/index.jsx`** — primitive UI components (Badge, Spinner, Card, Modal, StatCard).

### Cloud Functions (`functions/index.js`)

- `callGemini` — authenticated HTTPS callable that proxies requests to Google Gemini API. The Gemini API key lives server-side only. Validates message history (max 50), role/content fields, and requires Firebase Auth.

### Routing

Defined in `src/App.jsx`. All routes under `/` are protected by an auth guard. Admin routes (e.g., `/admin-users`) additionally check `isAdmin` from the user's Firestore profile.

## Key Conventions

- **Hebrew RTL** everywhere. Locale-aware sorting uses Hebrew collation (`he`). Font is Heebo via Tailwind config.
- **Date handling** uses `date-fns`. Jewish holidays are precomputed in `src/utils/jewishHolidays.js` (2025–2030).
- **Formatters** (`src/utils/formatters.js`) handle Hebrew currency, date display, and enum label translation — use these rather than inline formatting.
- **Firestore retry logic** — services use 3-attempt exponential backoff (1–4s) for transient failures.
- **Markdown in AI output** is rendered with `react-markdown` + `rehype-sanitize` to prevent XSS.

## Firestore Collections

| Collection | Purpose |
|---|---|
| `users` | User profiles with `role` field (admin/therapist) |
| `patients` | Patient records; filtered by `ownerId` |
| `appointments` | Scheduled sessions; overlap detection on write |
| `treatments` | Treatment session notes; linked to appointments + payments |
| `payments` | Payment ledger; auto-created alongside treatments |
| `progress` | Progress scores per domain per patient |
| `intakeForms` | Initial intake/medical history |
| `templates` | Reusable treatment goal/description templates |
| `notifications` | 9th-treatment alerts consumed by a browser extension |

Firestore security rules are in `firestore.rules`. Composite indexes in `firestore.indexes.json`.

## Security Notes

Admin role is determined from the `role` field in the `users` Firestore collection, not from `VITE_ADMIN_EMAIL`. The env var is only used during initial seeding. Gemini API key must never be on the client — it belongs in Cloud Function environment config (`firebase functions:config:set`).
