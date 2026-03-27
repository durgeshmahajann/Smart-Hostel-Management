// db/init.js — Database schema + seed data
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'hostel.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── CREATE TABLES ───────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'student',  -- student | admin | maintenance
    student_id  TEXT    UNIQUE,
    department  TEXT,
    phone       TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    room_number TEXT    NOT NULL UNIQUE,
    block       TEXT    NOT NULL,
    floor       INTEGER NOT NULL,
    type        TEXT    NOT NULL DEFAULT 'Double',   -- Single | Double | Triple
    status      TEXT    NOT NULL DEFAULT 'available', -- available | occupied | maintenance
    capacity    INTEGER NOT NULL DEFAULT 2,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS allocations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    room_id     INTEGER NOT NULL REFERENCES rooms(id),
    status      TEXT    NOT NULL DEFAULT 'active',   -- active | expired | cancelled
    allocated_at TEXT   DEFAULT (datetime('now')),
    expires_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS applications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    department    TEXT,
    year_of_study TEXT,
    room_type     TEXT,
    block_pref    TEXT,
    requirements  TEXT,
    move_in_date  TEXT,
    status        TEXT    NOT NULL DEFAULT 'pending', -- pending | approved | rejected
    reviewed_by   INTEGER REFERENCES users(id),
    reviewed_at   TEXT,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS complaints (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_no TEXT    NOT NULL UNIQUE,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    room_id      INTEGER REFERENCES rooms(id),
    category     TEXT    NOT NULL,
    priority     TEXT    NOT NULL DEFAULT 'Medium',  -- Low | Medium | High | Urgent
    subject      TEXT    NOT NULL,
    description  TEXT    NOT NULL,
    image_url    TEXT,
    status       TEXT    NOT NULL DEFAULT 'Pending', -- Pending | In Progress | Resolved
    assigned_to  INTEGER REFERENCES users(id),
    assigned_at  TEXT,
    resolved_at  TEXT,
    progress     INTEGER DEFAULT 0,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS complaint_updates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id  INTEGER NOT NULL REFERENCES complaints(id),
    updated_by    INTEGER NOT NULL REFERENCES users(id),
    message       TEXT    NOT NULL,
    created_at    TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── SEED DEMO DATA ──────────────────────────────────────────────────────────

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) return; // already seeded

  const hash = (pw) => bcrypt.hashSync(pw, 10);

  // Seed users
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password, role, student_id, department, phone)
    VALUES (@name, @email, @password, @role, @student_id, @department, @phone)
  `);

  const adminId = insertUser.run({
    name: 'Admin User', email: 'admin@university.edu',
    password: hash('admin123'), role: 'admin',
    student_id: null, department: 'Administration', phone: '+91 98000 00001'
  }).lastInsertRowid;

  const maintId = insertUser.run({
    name: 'Mohan Kumar', email: 'mohan@university.edu',
    password: hash('maint123'), role: 'maintenance',
    student_id: null, department: 'Maintenance', phone: '+91 98000 00002'
  }).lastInsertRowid;

  insertUser.run({
    name: 'Suresh Rao', email: 'suresh@university.edu',
    password: hash('maint123'), role: 'maintenance',
    student_id: null, department: 'Maintenance', phone: '+91 98000 00003'
  });

  // Seed rooms
  const insertRoom = db.prepare(`
    INSERT INTO rooms (room_number, block, floor, type, status, capacity)
    VALUES (@room_number, @block, @floor, @type, @status, @capacity)
  `);

  const roomData = [];
  ['A','B','C'].forEach(block => {
    for (let floor = 1; floor <= 4; floor++) {
      for (let num = 1; num <= 8; num++) {
        const roomNo = `${block}-${floor}0${num}`;
        const statuses = ['available','occupied','occupied','occupied','maintenance','occupied'];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const type = num % 3 === 0 ? 'Single' : num % 5 === 0 ? 'Triple' : 'Double';
        const cap  = type === 'Single' ? 1 : type === 'Triple' ? 3 : 2;
        roomData.push({ room_number: roomNo, block, floor, type, status, capacity: cap });
      }
    }
  });

  const seedRooms = db.transaction(() => {
    roomData.forEach(r => insertRoom.run(r));
  });
  seedRooms();

  // Seed demo complaints for demo student
  const demoStudentId = insertUser.run({
    name: 'Demo Student', email: 'student@university.edu',
    password: hash('student123'), role: 'student',
    student_id: 'STU-2024-0001', department: 'Computer Science', phone: '+91 98000 00010'
  }).lastInsertRowid;

  const room = db.prepare("SELECT id FROM rooms WHERE room_number = 'A-101'").get();
  if (room) {
    db.prepare(`
      INSERT INTO allocations (user_id, room_id, status, expires_at)
      VALUES (?, ?, 'active', '2026-12-31')
    `).run(demoStudentId, room.id);

    db.prepare("UPDATE rooms SET status = 'occupied' WHERE id = ?").run(room.id);
  }

  // Seed complaints
  const insertComplaint = db.prepare(`
    INSERT INTO complaints (complaint_no, user_id, room_id, category, priority, subject, description, status, assigned_to, progress)
    VALUES (@complaint_no, @user_id, @room_id, @category, @priority, @subject, @description, @status, @assigned_to, @progress)
  `);

  insertComplaint.run({
    complaint_no: 'C-042', user_id: demoStudentId, room_id: room?.id || null,
    category: 'Electrical', priority: 'High',
    subject: 'Electrical socket not working',
    description: 'The socket near the study desk is not working since Mar 18.',
    status: 'In Progress', assigned_to: maintId, progress: 66
  });
  insertComplaint.run({
    complaint_no: 'C-041', user_id: demoStudentId, room_id: room?.id || null,
    category: 'Plumbing', priority: 'Medium',
    subject: 'Water leakage in bathroom',
    description: 'There is a slow leak under the sink.',
    status: 'Pending', assigned_to: null, progress: 10
  });
  insertComplaint.run({
    complaint_no: 'C-038', user_id: demoStudentId, room_id: room?.id || null,
    category: 'Internet', priority: 'Low',
    subject: 'Wi-Fi not connecting in room',
    description: 'Wi-Fi drops every evening after 8pm.',
    status: 'Resolved', assigned_to: maintId, progress: 100
  });

  console.log('✅ Database seeded successfully.');
  console.log('   Demo accounts:');
  console.log('   Student  → student@university.edu / student123');
  console.log('   Admin    → admin@university.edu   / admin123');
  console.log('   Staff    → mohan@university.edu   / maint123');
}

seed();

module.exports = db;
