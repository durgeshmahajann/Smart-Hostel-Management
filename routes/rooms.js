// routes/rooms.js — Room management
const express = require('express');
const db = require('../db/init');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/rooms ─────────────────────────────────────────────────────────
// Public summary for students, full list for admin
router.get('/', auth, (req, res) => {
  const { status, block } = req.query;
  let query = 'SELECT * FROM rooms WHERE 1=1';
  const params = [];
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (block)  { query += ' AND block = ?';  params.push(block); }
  query += ' ORDER BY block, floor, room_number';

  const rooms = db.prepare(query).all(...params);
  res.json({ rooms, total: rooms.length });
});

// ── GET /api/rooms/stats ──────────────────────────────────────────────────
router.get('/stats', auth, (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='available'   THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status='occupied'    THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN status='maintenance' THEN 1 ELSE 0 END) as maintenance
    FROM rooms
  `).get();
  res.json({ stats });
});

// ── GET /api/rooms/:id ────────────────────────────────────────────────────
router.get('/:id', auth, (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const occupants = db.prepare(`
    SELECT u.id, u.name, u.student_id, u.department
    FROM allocations a
    JOIN users u ON u.id = a.user_id
    WHERE a.room_id = ? AND a.status = 'active'
  `).all(req.params.id);

  res.json({ room, occupants });
});

// ── POST /api/rooms ───────────────────────────────────────────────────────
// Admin only
router.post('/', auth, requireRole('admin'), (req, res) => {
  const { room_number, block, floor, type, capacity } = req.body;
  if (!room_number || !block || !floor)
    return res.status(400).json({ error: 'room_number, block, floor are required.' });

  const exists = db.prepare('SELECT id FROM rooms WHERE room_number = ?').get(room_number);
  if (exists) return res.status(409).json({ error: 'Room number already exists.' });

  const result = db.prepare(`
    INSERT INTO rooms (room_number, block, floor, type, capacity)
    VALUES (?, ?, ?, ?, ?)
  `).run(room_number, block, floor, type || 'Double', capacity || 2);

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'Room added successfully.', room });
});

// ── PUT /api/rooms/:id ────────────────────────────────────────────────────
router.put('/:id', auth, requireRole('admin'), (req, res) => {
  const { status, type, capacity } = req.body;
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  db.prepare('UPDATE rooms SET status = ?, type = ?, capacity = ? WHERE id = ?')
    .run(status || room.status, type || room.type, capacity || room.capacity, req.params.id);

  const updated = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  res.json({ message: 'Room updated.', room: updated });
});

// ── DELETE /api/rooms/:id ─────────────────────────────────────────────────
router.delete('/:id', auth, requireRole('admin'), (req, res) => {
  const active = db.prepare("SELECT id FROM allocations WHERE room_id = ? AND status = 'active'").get(req.params.id);
  if (active) return res.status(400).json({ error: 'Cannot delete a room with active occupants.' });

  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  res.json({ message: 'Room deleted successfully.' });
});

module.exports = router;
