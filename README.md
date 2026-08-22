# 🛡️ Watchman Tracker — Security Agency Management Platform

A production-quality Progressive Web App for managing security agencies, watchmen, societies, shifts, and GPS-verified attendance.

## ✨ Features

- **GPS Geofencing** — Haversine-based location verification with configurable radius
- **Selfie Attendance** — Camera capture with timestamp overlay
- **Multi-Shift/Multi-Society** — Smart assignment resolver handles overnight shifts
- **Offline Support** — IndexedDB queue syncs when internet returns
- **GPS Security Flags** — Detects poor accuracy, impossible jumps, emulators
- **Role-Based Access** — Super Admin / Agency Admin / Watchman
- **Agency Isolation** — Each agency can only see its own data
- **Interactive Map** — Leaflet + OpenStreetMap for society location setup
- **PWA** — Install on Android as home screen app

## 🚀 Quick Start

- Node.js 18+
- MongoDB Atlas account (or local MongoDB)

### 1. Setup Backend

```bash
cd backend
npm install
npm run db:seed      # Load demo data
npm run dev          # Start API on port 3001
```

### 2. Setup Frontend

```bash
cd frontend
npm install
npm run dev          # Start on http://localhost:5173
```

## 🔐 Demo Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Agency Admin | admin@punesecure.com | Admin@123 |
| Watchman (Ramesh) | ramesh@punesecure.com | Guard@123 |
| Watchman (Suresh) | suresh@punesecure.com | Guard@123 |
| Watchman (Amit) | amit@punesecure.com | Guard@123 |
| Super Admin | superadmin@watchman.app | Super@123 |

## 🗂️ Project Structure

```
watchman-tracker/
├── backend/              # Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── config/       # Database + app config
│   │   ├── db/           # Schema SQL + migrate + seed
│   │   ├── middleware/   # Auth + error handler
│   │   ├── routes/       # All API endpoints
│   │   ├── utils/        # Haversine + GPS flags
│   │   └── index.ts      # Express entry point
│   └── uploads/          # Attendance photos (auto-created)
│
├── frontend/             # React 18 + Vite + Tailwind PWA
│   └── src/
│       ├── api/          # Axios client with auto-refresh
│       ├── offline/      # IndexedDB offline queue
│       ├── pages/
│       │   ├── auth/     # Login page
│       │   ├── watchman/ # Ultra-simple watchman UI
│       │   └── agency/   # Full agency dashboard
│       └── stores/       # Zustand auth store
│
└── .gitignore            # Git ignore rules
```

## 📱 Watchman Flow (Mobile)

```
Open App → See Assignment → MARK ATTENDANCE → GPS Check → Selfie → Done
```

The watchman never types the society name, employee ID, shift, or address.

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| GET | /api/attendance/my-assignment | Watchman's current assignment |
| POST | /api/attendance/mark | Mark attendance (with selfie) |
| GET | /api/dashboard/summary | Agency dashboard stats |
| GET | /api/dashboard/live-attendance | Today's live attendance |
| GET | /api/dashboard/missing-attendance | Guards without attendance |
| GET | /api/societies | List societies |
| GET | /api/watchmen | List watchmen |
| GET | /api/assignments | List assignments |
| GET | /api/reports/daily | Daily attendance report |
| GET | /api/reports/monthly | Monthly summary |

## 🌍 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 |
| State | Zustand + TanStack Query |
| Backend | Node.js + Express + TypeScript |
| Database | MongoDB Atlas + Mongoose |
| Maps | Leaflet + OpenStreetMap (free) |
| GPS | Browser Geolocation API |
| Camera | Browser MediaDevices API |
| Offline | IndexedDB (via idb) |
| PWA | Vite PWA Plugin (Workbox) |

## 🔮 Architecture for Future Features

The data model is already designed for:
- Facial verification (selfie_url stored, AI can verify later)
- Payroll (attendance_date + status = days present/late/absent)
- Multi-branch agencies (agency_id on every table)
- Subscription billing (status field on agencies)
- WhatsApp notifications (notifications table ready)
- QR/NFC check-in (assignment_id based check-in already in place)
