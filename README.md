# 🏠 ResidenceOS

> A full-stack hostel management system built with Node.js, Express, and SQLite — covering room allocation, complaint tracking, and role-based dashboards for students, admins, and maintenance staff.

![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000?logo=jsonwebtokens&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Demo Accounts](#demo-accounts)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

ResidenceOS is a backend-first hostel management platform with a bundled frontend. It supports three distinct roles:

- **Students** — apply for rooms, submit and track complaints
- **Admins** — manage rooms, approve applications, assign maintenance staff
- **Maintenance staff** — view and update assigned complaints

---

## Tech Stack

| Layer        | Technology                   |
|--------------|------------------------------|
| Runtime      | Node.js v18+                 |
| Framework    | Express.js                   |
| Database     | SQLite via `better-sqlite3`  |
| Auth         | JWT + bcryptjs               |
| Frontend     | Vanilla HTML/JS (served statically) |

---

## Quick Start

### Prerequisites

- Node.js v18 or higher
- npm

### 1. Install dependencies

```bash
cd hostel-backend
npm install
```

### 2. Start the server

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

The server starts at **http://localhost:5000**

### 3. Open the frontend

Open `public/index.html` in your browser, or navigate to `http://localhost:5000` if the server is configured to serve it.

---

## Demo Accounts

The database is automatically seeded with the following accounts on first run:

| Role        | Email                    | Password    |
|-------------|--------------------------|-------------|
| Student     | student@university.edu   | student123  |
| Admin       | admin@university.edu     | admin123    |
| Maintenance | mohan@university.edu     | maint123    |

> **Note:** These are for local development only. Remove or replace seed data before deploying to production.

---

## Project Structure

```
hostel-backend/
├── server.js              # Entry point — starts Express and mounts routes
├── package.json
├── .env                   # Environment config (create manually, see below)
├── db/
│   └── init.js            # Schema definition and seed data
├── middleware/
│   └── auth.js            # JWT verification and role-based guards
├── routes/
│   ├── auth.js            # Register, login, profile
│   ├── rooms.js           # Room CRUD
│   ├── applications.js    # Room applications and allocation
│   ├── complaints.js      # Complaint lifecycle and assignment
│   └── admin.js           # Admin dashboard and staff management
└── public/
    └── index.html         # Bundled frontend (single-file)
```

---

## API Reference

All protected endpoints require an `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint           | Description               | Auth     |
|--------|--------------------|---------------------------|----------|
| POST   | `/api/auth/register` | Register a new student  | None     |
| POST   | `/api/auth/login`    | Login (all roles)       | None     |
| GET    | `/api/auth/me`       | Get current user profile| Required |
| PUT    | `/api/auth/profile`  | Update profile          | Required |

**Example — Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "student@university.edu", "password": "student123"}'
```

---

### Rooms

| Method | Endpoint          | Description          | Role  |
|--------|-------------------|----------------------|-------|
| GET    | `/api/rooms`      | List all rooms       | Any   |
| GET    | `/api/rooms/stats`| Room statistics      | Any   |
| GET    | `/api/rooms/:id`  | Get single room      | Any   |
| POST   | `/api/rooms`      | Add a room           | Admin |
| PUT    | `/api/rooms/:id`  | Update a room        | Admin |
| DELETE | `/api/rooms/:id`  | Delete a room        | Admin |

---

### Applications

| Method | Endpoint                          | Description               | Role    |
|--------|-----------------------------------|---------------------------|---------|
| GET    | `/api/applications`               | List applications         | Any     |
| POST   | `/api/applications`               | Submit an application     | Student |
| PUT    | `/api/applications/:id/approve`   | Approve and allocate room | Admin   |
| PUT    | `/api/applications/:id/reject`    | Reject an application     | Admin   |

---

### Complaints

| Method | Endpoint                        | Description                  | Role        |
|--------|---------------------------------|------------------------------|-------------|
| GET    | `/api/complaints`               | List all complaints          | Any         |
| GET    | `/api/complaints/:id`           | Get complaint + timeline     | Any         |
| POST   | `/api/complaints`               | Submit a complaint           | Student     |
| PUT    | `/api/complaints/:id/assign`    | Assign to maintenance staff  | Admin       |
| PUT    | `/api/complaints/:id/status`    | Update status / add progress | Maintenance |
| DELETE | `/api/complaints/:id`           | Delete a complaint           | Admin       |

---

### Admin

| Method | Endpoint                | Description               | Role  |
|--------|-------------------------|---------------------------|-------|
| GET    | `/api/admin/dashboard`  | Full dashboard statistics | Admin |
| GET    | `/api/admin/students`   | All students list         | Admin |
| GET    | `/api/admin/staff`      | Maintenance staff list    | Admin |

---

## Environment Variables

Create a `.env` file in the project root to override defaults:

```env
PORT=5000
JWT_SECRET=your-secret-key-here
```

| Variable     | Default              | Description                        |
|--------------|----------------------|------------------------------------|
| `PORT`       | `5000`               | Port the server listens on         |
| `JWT_SECRET` | `fallback-secret`    | Secret used to sign JWT tokens     |

> **Security:** Always set a strong, unique `JWT_SECRET` in any environment beyond local development.

---

## Troubleshooting

**Port already in use**
```bash
# Find and kill the process using port 5000
lsof -i :5000
kill -9 <PID>
```

**Database not seeding / missing tables**
Delete the existing SQLite database file (if any) and restart — `db/init.js` will recreate and reseed it automatically.

**JWT errors on protected routes**
Make sure your request includes the header:
```
Authorization: Bearer <token>
```
Tokens are returned in the response body of `/api/auth/login`.

**`better-sqlite3` build errors on install**
This package compiles native bindings. Ensure you have build tools installed:
```bash
# macOS
xcode-select --install

# Ubuntu / Debian
sudo apt-get install build-essential python3
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push and open a Pull Request

Please follow the existing code style and keep route files focused on a single resource.

---

## License

MIT © ResidenceOS Contributors
