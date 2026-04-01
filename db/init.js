// db/init.js — MySQL connection pool + schema + seed
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// ─── CONNECTION POOL ──────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'residenceos',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
});

// ─── CREATE TABLES ────────────────────────────────────────────────────────────
async function createTables() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(100)    NOT NULL,
        email       VARCHAR(150)    NOT NULL UNIQUE,
        password    VARCHAR(255)    NOT NULL,
        role        ENUM('student','admin','maintenance') NOT NULL DEFAULT 'student',
        student_id  VARCHAR(30)     UNIQUE,
        department  VARCHAR(100),
        phone       VARCHAR(20),
        created_at  DATETIME        NOT NULL DEFAULT NOW(),
        updated_at  DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW(),
        INDEX idx_users_role  (role),
        INDEX idx_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS otp_tokens (
        id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
        user_id     INT UNSIGNED    NOT NULL,
        otp_code    CHAR(4)         NOT NULL,
        expires_at  DATETIME        NOT NULL,
        attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
        created_at  DATETIME        NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_otp_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_otp_user    (user_id),
        INDEX idx_otp_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
        room_number VARCHAR(20)     NOT NULL UNIQUE,
        block       CHAR(1)         NOT NULL,
        floor       TINYINT UNSIGNED NOT NULL,
        type        ENUM('Single','Double','Triple') NOT NULL DEFAULT 'Double',
        status      ENUM('available','occupied','maintenance') NOT NULL DEFAULT 'available',
        capacity    TINYINT UNSIGNED NOT NULL DEFAULT 2,
        created_at  DATETIME        NOT NULL DEFAULT NOW(),
        updated_at  DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW(),
        INDEX idx_rooms_status (status),
        INDEX idx_rooms_block  (block),
        INDEX idx_rooms_floor  (floor)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS allocations (
        id           INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
        user_id      INT UNSIGNED    NOT NULL,
        room_id      INT UNSIGNED    NOT NULL,
        status       ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active',
        allocated_at DATETIME        NOT NULL DEFAULT NOW(),
        expires_at   DATE,
        CONSTRAINT fk_alloc_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_alloc_room FOREIGN KEY (room_id)
          REFERENCES rooms(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        INDEX idx_alloc_user   (user_id),
        INDEX idx_alloc_room   (room_id),
        INDEX idx_alloc_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
        user_id       INT UNSIGNED    NOT NULL,
        department    VARCHAR(100),
        year_of_study VARCHAR(20),
        room_type     VARCHAR(20)     DEFAULT 'No Preference',
        block_pref    VARCHAR(20)     DEFAULT 'No Preference',
        requirements  TEXT,
        move_in_date  DATE,
        status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        reviewed_by   INT UNSIGNED,
        reviewed_at   DATETIME,
        created_at    DATETIME        NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_app_student  FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_app_reviewer FOREIGN KEY (reviewed_by)
          REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
        INDEX idx_app_user     (user_id),
        INDEX idx_app_status   (status),
        INDEX idx_app_reviewer (reviewed_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id           INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
        complaint_no VARCHAR(10)     NOT NULL UNIQUE,
        user_id      INT UNSIGNED    NOT NULL,
        room_id      INT UNSIGNED,
        category     VARCHAR(50)     NOT NULL,
        priority     ENUM('Low','Medium','High','Urgent') NOT NULL DEFAULT 'Medium',
        subject      VARCHAR(200)    NOT NULL,
        description  TEXT            NOT NULL,
        image_url    VARCHAR(500),
        status       ENUM('Pending','In Progress','Resolved') NOT NULL DEFAULT 'Pending',
        assigned_to  INT UNSIGNED,
        assigned_at  DATETIME,
        resolved_at  DATETIME,
        progress     TINYINT UNSIGNED NOT NULL DEFAULT 0,
        created_at   DATETIME        NOT NULL DEFAULT NOW(),
        updated_at   DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW(),
        CONSTRAINT fk_comp_student FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_comp_room    FOREIGN KEY (room_id)
          REFERENCES rooms(id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_comp_staff   FOREIGN KEY (assigned_to)
          REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
        INDEX idx_comp_user     (user_id),
        INDEX idx_comp_room     (room_id),
        INDEX idx_comp_assigned (assigned_to),
        INDEX idx_comp_status   (status),
        INDEX idx_comp_category (category),
        INDEX idx_comp_priority (priority)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS complaint_updates (
        id           INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
        complaint_id INT UNSIGNED    NOT NULL,
        updated_by   INT UNSIGNED    NOT NULL,
        message      TEXT            NOT NULL,
        created_at   DATETIME        NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_cu_complaint FOREIGN KEY (complaint_id)
          REFERENCES complaints(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_cu_user      FOREIGN KEY (updated_by)
          REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_cu_complaint (complaint_id),
        INDEX idx_cu_user      (updated_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✅ All tables created/verified.');
  } finally {
    conn.release();
  }
}

// ─── SEED DATA ────────────────────────────────────────────────────────────────
async function seed() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT COUNT(*) as c FROM users');
    if (rows[0].c > 0) return; // already seeded

    const hash = (pw) => bcrypt.hashSync(pw, 10);

    // Seed users
    const [adminRes] = await conn.query(
      `INSERT INTO users (name, email, password, role, department, phone)
       VALUES (?, ?, ?, 'admin', 'Administration', '+91 98000 00001')`,
      ['Admin User', 'admin@university.edu', hash('admin123')]
    );

    const [maintRes] = await conn.query(
      `INSERT INTO users (name, email, password, role, department, phone)
       VALUES (?, ?, ?, 'maintenance', 'Maintenance', '+91 98000 00002')`,
      ['Mohan Kumar', 'mohan@university.edu', hash('maint123')]
    );

    await conn.query(
      `INSERT INTO users (name, email, password, role, department, phone)
       VALUES (?, ?, ?, 'maintenance', 'Maintenance', '+91 98000 00003')`,
      ['Suresh Rao', 'suresh@university.edu', hash('maint123')]
    );

    const [stuRes] = await conn.query(
      `INSERT INTO users (name, email, password, role, student_id, department, phone)
       VALUES (?, ?, ?, 'student', 'STU-2024-0001', 'Computer Science', '+91 98000 00010')`,
      ['Demo Student', 'student@university.edu', hash('student123')]
    );

    const studentId = stuRes.insertId;
    const maintId   = maintRes.insertId;

    // Seed rooms — Blocks A, B, C
    const roomData = [];
    ['A','B','C'].forEach(block => {
      for (let floor = 1; floor <= 4; floor++) {
        for (let num = 1; num <= 8; num++) {
          const roomNo   = `${block}-${floor}0${num}`;
          const statuses = ['available','occupied','occupied','occupied','maintenance','occupied'];
          const status   = statuses[Math.floor(Math.random() * statuses.length)];
          const type     = num % 3 === 0 ? 'Single' : num % 5 === 0 ? 'Triple' : 'Double';
          const capacity = type === 'Single' ? 1 : type === 'Triple' ? 3 : 2;
          roomData.push([roomNo, block, floor, type, status, capacity]);
        }
      }
    });

    await conn.query(
      `INSERT INTO rooms (room_number, block, floor, type, status, capacity) VALUES ?`,
      [roomData]
    );

    // Force A-101 to available so we can allocate it
    await conn.query(`UPDATE rooms SET status = 'occupied' WHERE room_number = 'A-101'`);

    const [[room]] = await conn.query(`SELECT id FROM rooms WHERE room_number = 'A-101'`);

    if (room) {
      await conn.query(
        `INSERT INTO allocations (user_id, room_id, status, expires_at) VALUES (?, ?, 'active', '2026-12-31')`,
        [studentId, room.id]
      );

      // Seed complaints
      await conn.query(
        `INSERT INTO complaints
           (complaint_no, user_id, room_id, category, priority, subject, description, status, assigned_to, progress)
         VALUES (?, ?, ?, 'Electrical', 'High', ?, ?, 'In Progress', ?, 66)`,
        ['C-042', studentId, room.id,
         'Electrical socket not working',
         'The socket near the study desk is not working since Mar 18.',
         maintId]
      );

      await conn.query(
        `INSERT INTO complaints
           (complaint_no, user_id, room_id, category, priority, subject, description, status, progress)
         VALUES (?, ?, ?, 'Plumbing', 'Medium', ?, ?, 'Pending', 10)`,
        ['C-041', studentId, room.id,
         'Water leakage in bathroom',
         'There is a slow leak under the sink.']
      );

      await conn.query(
        `INSERT INTO complaints
           (complaint_no, user_id, room_id, category, priority, subject, description, status, assigned_to, resolved_at, progress)
         VALUES (?, ?, ?, 'Internet', 'Low', ?, ?, 'Resolved', ?, NOW(), 100)`,
        ['C-038', studentId, room.id,
         'Wi-Fi not connecting in room',
         'Wi-Fi drops every evening after 8pm.',
         maintId]
      );
    }

    console.log('✅ Database seeded successfully.');
    console.log('   student@university.edu / student123');
    console.log('   admin@university.edu   / admin123');
    console.log('   mohan@university.edu   / maint123');
  } finally {
    conn.release();
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function initDB() {
  try {
    await createTables();
    await seed();
  } catch (err) {
    console.error('❌ Database init failed:', err.message);
    process.exit(1);
  }
}

initDB();

module.exports = pool;
