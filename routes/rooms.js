// routes/rooms.js — Room management
const express = require('express');
const pool    = require('../db/init');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/rooms ────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { status, block } = req.query;
    let query  = 'SELECT * FROM rooms WHERE 1=1';
    const params = [];

    if (status) { query += ' AND status = ?'; params.push(status); }
    if (block)  { query += ' AND block = ?';  params.push(block); }
    query += ' ORDER BY block, floor, room_number';

    const [rooms] = await pool.query(query, params);
    res.json({ rooms, total: rooms.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/rooms/stats ──────────────────────────────────────────────────────
router.get('/stats', auth, async (req, res) => {
  try {
    const [[stats]] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(status = 'available')   as available,
        SUM(status = 'occupied')    as occupied,
        SUM(status = 'maintenance') as maintenance
      FROM rooms
    `);
    res.json({ stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/rooms/:id ────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const [[room]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    const [occupants] = await pool.query(`
      SELECT u.id, u.name, u.student_id, u.department
      FROM allocations a
      JOIN users u ON u.id = a.user_id
      WHERE a.room_id = ? AND a.status = 'active'
    `, [req.params.id]);

    res.json({ room, occupants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/rooms ───────────────────────────────────────────────────────────
router.post('/', auth, requireRole('admin'), async (req, res) => {
  try {
    const { room_number, block, floor, type, capacity } = req.body;
    if (!room_number || !block || !floor)
      return res.status(400).json({ error: 'room_number, block, floor are required.' });

    const [[exists]] = await pool.query('SELECT id FROM rooms WHERE room_number = ?', [room_number]);
    if (exists) return res.status(409).json({ error: 'Room number already exists.' });

    const [result] = await pool.query(
      'INSERT INTO rooms (room_number, block, floor, type, capacity) VALUES (?, ?, ?, ?, ?)',
      [room_number, block, floor, type || 'Double', capacity || 2]
    );

    const [[room]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Room added successfully.', room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT /api/rooms/:id ────────────────────────────────────────────────────────
router.put('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const { status, type, capacity } = req.body;
    const [[room]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    await pool.query(
      'UPDATE rooms SET status = ?, type = ?, capacity = ? WHERE id = ?',
      [status || room.status, type || room.type, capacity || room.capacity, req.params.id]
    );

    const [[updated]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
    res.json({ message: 'Room updated.', room: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── DELETE /api/rooms/:id ─────────────────────────────────────────────────────
router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const [[active]] = await pool.query(
      "SELECT id FROM allocations WHERE room_id = ? AND status = 'active'",
      [req.params.id]
    );
    if (active)
      return res.status(400).json({ error: 'Cannot delete a room with active occupants.' });

    await pool.query('DELETE FROM rooms WHERE id = ?', [req.params.id]);
    res.json({ message: 'Room deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
