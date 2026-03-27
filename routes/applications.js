// routes/applications.js — Room applications
const express = require('express');
const db = require('../db/init');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/applications ─────────────────────────────────────────────────
// Admin sees all, student sees only their own
router.get('/', auth, (req, res) => {
  let query, params;

  if (req.user.role === 'admin') {
    query = `
      SELECT a.*, u.name as student_name, u.email, u.student_id, u.department as student_dept
      FROM applications a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
    `;
    params = [];
  } else {
    query = `
      SELECT a.*, u.name as student_name
      FROM applications a
      JOIN users u ON u.id = a.user_id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
    `;
    params = [req.user.id];
  }

  const applications = db.prepare(query).all(...params);
  res.json({ applications });
});

// ── POST /api/applications ────────────────────────────────────────────────
router.post('/', auth, requireRole('student'), (req, res) => {
  const { department, year_of_study, room_type, block_pref, requirements, move_in_date } = req.body;

  // Check existing pending/active application
  const existing = db.prepare(`
    SELECT id FROM applications WHERE user_id = ? AND status = 'pending'
  `).get(req.user.id);
  if (existing)
    return res.status(409).json({ error: 'You already have a pending application.' });

  const result = db.prepare(`
    INSERT INTO applications (user_id, department, year_of_study, room_type, block_pref, requirements, move_in_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, department, year_of_study, room_type, block_pref, requirements, move_in_date);

  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'Application submitted successfully.', application });
});

// ── PUT /api/applications/:id/approve ────────────────────────────────────
router.put('/:id/approve', auth, requireRole('admin'), (req, res) => {
  const { room_id } = req.body;
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (app.status !== 'pending') return res.status(400).json({ error: 'Application is not pending.' });

  // Find an available room if none specified
  let roomId = room_id;
  if (!roomId) {
    const room = db.prepare(`
      SELECT id FROM rooms
      WHERE status = 'available'
      AND (? = 'No Preference' OR block = ?)
      AND (type = ? OR ? = 'No Preference')
      LIMIT 1
    `).get(app.block_pref || 'No Preference', app.block_pref || '', app.room_type || 'Double', app.room_type || 'No Preference');

    if (!room) return res.status(400).json({ error: 'No available rooms matching the preference.' });
    roomId = room.id;
  }

  const tx = db.transaction(() => {
    // Update application
    db.prepare(`
      UPDATE applications SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?
    `).run(req.user.id, req.params.id);

    // Create allocation
    db.prepare(`
      INSERT INTO allocations (user_id, room_id, status, expires_at)
      VALUES (?, ?, 'active', date('now', '+1 year'))
    `).run(app.user_id, roomId);

    // Mark room as occupied
    db.prepare("UPDATE rooms SET status = 'occupied' WHERE id = ?").run(roomId);
  });

  tx();

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  res.json({ message: 'Application approved and room allocated.', room });
});

// ── PUT /api/applications/:id/reject ─────────────────────────────────────
router.put('/:id/reject', auth, requireRole('admin'), (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found.' });

  db.prepare(`
    UPDATE applications SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?
  `).run(req.user.id, req.params.id);

  res.json({ message: 'Application rejected.' });
});

module.exports = router;
