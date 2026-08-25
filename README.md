# 🛡️ Watchman Attendance Tracker

A full-stack web application for managing security guard attendance using QR code-based check-in and check-out — no app installation required for guards.

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite + TypeScript) |
| Backend | Node.js + Express + TypeScript |
| Database | MongoDB Atlas (Mongoose) |
| Auth | JWT (Access + Refresh Tokens) |
| Deployment | Vercel (Frontend + Backend Serverless) |
| Face Verify | face-api.js |

---

## 🏗️ Data Hierarchy

```
Super Admin (Platform Owner)
  └── Agency (Security Company) [Phase 2]
        └── Society (Residential Complex / Property)
              └── Wing (Wing A, Wing B, Gate 1, etc.)
                    └── Watchman (Security Guard)
```

---

## 👥 User Roles

### ✅ Phase 1 (Current Build — Two Roles)

#### 👑 Super Admin
- The platform owner (you).
- Has full unrestricted access to the entire system.
- Manages everything: Societies, Wings, Watchmen, Shifts, Gates.
- Generates QR Codes for gates/locations.
- Views all attendance records (check-in and check-out times).
- Runs monthly reports and exports them to Excel/PDF.
- Flags late arrivals automatically based on shift timings.

#### 👮 Watchman (Guard)
- Does **NOT** log in with email/password.
- Scans a QR Code placed at their assigned gate.
- A public web page opens (no app install needed).
- Enters their **Guard ID** only.
- System auto-detects: Name, Society, Wing, Shift, Date.
- Takes a photo for visual verification.
- Clicks **Submit** → **Check-In Time** is recorded.
- At end of shift, scans the same QR again → clicks **Checkout** → **Check-Out Time** is recorded.

---

### 🔮 Phase 2 (Planned — Agency Admin Role)

> **Note to Developer:** The database models and API structure must be built in Phase 1 with `agency_id` fields already in place on Societies, Watchmen, and Attendance records — so that Phase 2 is purely a UI and auth addition, not a database migration.

#### 🏢 Agency Admin
- A representative of a security company.
- Can log in with email/password.
- Can only see and manage their own assigned Societies, Wings, and Watchmen.
- Cannot see data belonging to other agencies.
- Receives monthly attendance reports sent by the Super Admin.

#### Super Admin additions in Phase 2:
- Full CRUD for Agencies.
- Assign Societies to specific Agencies.
- Send monthly PDF reports to Agency Admin via email.
- View a per-agency dashboard summary.

---

## ✨ Core Features

### Phase 1 Features

| Feature | Status |
|---|---|
| Super Admin login (email/password) | ✅ Built |
| Watchman QR scan + Guard ID check-in | 🔴 To Build |
| Watchman Check-Out (Logout time recording) | 🔴 To Build |
| Society Management | ✅ Built |
| Wing Management (under Societies) | 🔴 To Build |
| Watchman Management | ✅ Built |
| Shift Management (Day/Night timings) | ✅ Built |
| Gate / Location Management | 🔴 To Build |
| QR Code Generator (per Gate) | 🔴 To Build |
| Attendance Dashboard (Today's stats) | ✅ Built (partial) |
| Late Mark Auto-Detection | 🔴 To Build |
| Daily Attendance Report | ✅ Built (partial) |
| Monthly Summary Report | ✅ Built (partial) |
| Export to Excel / PDF | 🔴 To Build |
| Face Photo Capture at Check-In | ✅ Built |

### Phase 2 Features (Planned)

| Feature | Status |
|---|---|
| Agency Management (CRUD) | 🔮 Phase 2 |
| Agency Admin Role & Login | 🔮 Phase 2 |
| Agency-Scoped Dashboard | 🔮 Phase 2 |
| Email Monthly Reports to Agencies | 🔮 Phase 2 |
| Per-Agency Data Isolation | 🔮 Phase 2 |

---

## 🔄 Attendance Flow

### Check-In (Login)
```
Guard Scans QR Code at Gate
        ↓
Public Web Page Opens (no login required)
        ↓
Guard Enters Guard ID
        ↓
System Auto-Fills: Name, Society, Wing, Shift, Date
        ↓
Guard Takes a Photo
        ↓
Guard Clicks "Submit"
        ↓
✅ Check-In Time Recorded
```

### Check-Out (Logout)
```
Guard Scans Same QR Code at Gate
        ↓
Public Web Page Opens
        ↓
Guard Enters Guard ID
        ↓
System Detects: Active Check-In Exists → Shows "Checkout" button
        ↓
Guard Takes a Photo (Before Logout)
        ↓
Guard Clicks "Checkout"
        ↓
✅ Check-Out Time Recorded, Shift Duration Calculated
```

---

## 🗂️ Project Structure

```
Watchman_Attendence_Tracker/
├── backend/
│   ├── src/
│   │   ├── config/         # DB connection, env config
│   │   ├── middleware/     # Auth, error handling
│   │   ├── models/         # Mongoose schemas
│   │   ├── routes/         # Express API routes
│   │   ├── db/             # Seed scripts
│   │   └── index.ts        # App entry point
│   ├── vercel.json         # Vercel serverless config
│   └── package.json
│
├── frontend/
│   ├── public/
│   │   └── logo.png        # App logo
│   ├── src/
│   │   ├── api/            # Axios client
│   │   ├── components/     # Shared components
│   │   ├── pages/
│   │   │   ├── auth/       # Login page
│   │   │   ├── agency/     # Super Admin dashboard pages
│   │   │   └── scan/       # [Phase 1] Public QR scan pages
│   │   └── stores/         # Zustand auth store
│   ├── vercel.json         # Vercel SPA routing config
│   └── index.html
```

---

## 🚀 Deployment

Both frontend and backend are deployed as separate Vercel projects pointing to the same GitHub repository.

| Project | Vercel Root Directory | Key Env Variable |
|---|---|---|
| Backend API | `backend` | `MONGODB_URI`, `JWT_SECRET` |
| Frontend App | `frontend` | `VITE_API_URL` |

### Environment Variables

**Backend:**
```
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/watchman
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
FRONTEND_URL=https://your-frontend.vercel.app
```

**Frontend:**
```
VITE_API_URL=https://your-backend.vercel.app/api
```

---

## 🛠️ Local Development

```bash
# Start Backend
cd backend
npm install
npm run dev   # Runs on http://localhost:3001

# Start Frontend (in a new terminal)
cd frontend
npm install
npm run dev   # Runs on http://localhost:5173

# Seed Database (first time only)
cd backend
npm run db:seed
```

---

## 📋 Phase 2 Implementation Checklist (For Future Reference)

When ready to add Agency Admin support:

- [ ] Add `agency_id` FK validation to the existing Societies and Watchmen APIs (already stored in DB).
- [ ] Create `GET/POST/PUT /api/agencies` CRUD routes.
- [ ] Add `agency_admin` role to the auth middleware.
- [ ] Create Agency Admin dashboard (scoped to their `agency_id`).
- [ ] Build email service (e.g., Nodemailer + SendGrid) for monthly report delivery.
- [ ] Add "Send Report to Agency" button in the Super Admin monthly reports page.
- [ ] Create a per-agency attendance view for Agency Admin.

---

*Built with ❤️ by Kedar Naygaonkar*
