# ResidenceOS — Backend Setup Guide

## Stack
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: SQLite via `better-sqlite3`


## Quick Start

### 1. Install dependencies
```bash
cd hostel-backend
npm install
```

### 2. Start the server
```bash
npm start
# or for auto-reload during development:
npm run dev
```

Server runs at: **http://localhost:5000**

### 3. Open the frontend
Open `public/index.html` in your browser.

---

## Demo Accounts (auto-seeded)
| Role        | Email                       | Password    |
|-------------|-----------------------------|-------------|
| Student     | student@university.edu      | student123  |
| Admin       | admin@university.edu        | admin123    |
| Maintenance | mohan@university.edu        | maint123    |

---

## API Endpoints

### Auth
| Method | Endpoint            | Description              | Auth     |
|--------|---------------------|--------------------------|----------|
| POST   | /api/auth/register  | Register new student     | None     |
| POST   | /api/auth/login     | Login (all roles)        | None     |
| GET    | /api/auth/me        | Get current user profile | Required |
| PUT    | /api/auth/profile   | Update profile           | Required |

### Rooms
| Method | Endpoint         | Description        | Role     |
|--------|------------------|--------------------|----------|
| GET    | /api/rooms       | List all rooms     | Any      |
| GET    | /api/rooms/stats | Room statistics    | Any      |
| GET    | /api/rooms/:id   | Get single room    | Any      |
| POST   | /api/rooms       | Add room           | Admin    |
| PUT    | /api/rooms/:id   | Update room        | Admin    |
| DELETE | /api/rooms/:id   | Delete room        | Admin    |

### Applications
| Method | Endpoint                        | Description        | Role     |
|--------|---------------------------------|--------------------|----------|
| GET    | /api/applications               | List applications  | Any      |
| POST   | /api/applications               | Submit application | Student  |
| PUT    | /api/applications/:id/approve   | Approve + allocate | Admin    |
| PUT    | /api/applications/:id/reject    | Reject             | Admin    |

### Complaints
| Method | Endpoint                       | Description             | Role        |
|--------|--------------------------------|-------------------------|-------------|
| GET    | /api/complaints                | List complaints         | Any         |
| GET    | /api/complaints/:id            | Get complaint + timeline| Any         |
| POST   | /api/complaints                | Submit complaint        | Student     |
| PUT    | /api/complaints/:id/assign     | Assign to staff         | Admin       |
| PUT    | /api/complaints/:id/status     | Update status/progress  | Maintenance |
| DELETE | /api/complaints/:id            | Delete complaint        | Admin       |

### Admin
| Method | Endpoint              | Description            | Role  |
|--------|-----------------------|------------------------|-------|
| GET    | /api/admin/dashboard  | Full dashboard stats   | Admin |
| GET    | /api/admin/students   | All students list      | Admin |
| GET    | /api/admin/staff      | Maintenance staff list | Admin |

---

## Project Structure
```
hostel-backend/
├── server.js              # Entry point
├── package.json
├── db/
│   └── init.js            # Schema + seed data
├── middleware/
│   └── auth.js            # JWT middleware + role guards
├── routes/
│   ├── auth.js            # Register / Login / Profile
│   ├── rooms.js           # Room CRUD
│   ├── applications.js    # Room applications
│   ├── complaints.js      # Complaints + assignment
│   └── admin.js           # Admin stats + staff
└── public/
    └── index.html         # Full frontend (connected to API)
```

## Environment Variables (optional)
Create a `.env` file:
```
PORT=5000
JWT_SECRET=your-secret-key-here
```
