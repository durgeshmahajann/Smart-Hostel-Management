// routes/applications.js — Room applications
const express = require('express');
const pool    = require('../db/init');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/applications ─────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
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

    const [applications] = await pool.query(query, params);
    res.json({ applications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/applications ────────────────────────────────────────────────────
router.post('/', auth, requireRole('student'), async (req, res) => {
  try {
    const { department, year_of_study, room_type, block_pref, requirements, move_in_date } = req.body;

    const [[existing]] = await pool.query(
      "SELECT id FROM applications WHERE user_id = ? AND status = 'pending'",
      [req.user.id]
    );
    if (existing)
      return res.status(409).json({ error: 'You already have a pending application.' });

    const [result] = await pool.query(
      `INSERT INTO applications
         (user_id, department, year_of_study, room_type, block_pref, requirements, move_in_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, department, year_of_study, room_type, block_pref, requirements, move_in_date || null]
    );

    const [[application]] = await pool.query(
      'SELECT * FROM applications WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json({ message: 'Application submitted successfully.', application });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT /api/applications/:id/approve ────────────────────────────────────────
router.put('/:id/approve', auth, requireRole('admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { room_id } = req.body;
    const [[app]] = await conn.query('SELECT * FROM applications WHERE id = ?', [req.params.id]);
    if (!app) { await conn.rollback(); return res.status(404).json({ error: 'Application not found.' }); }
    if (app.status !== 'pending') { await conn.rollback(); return res.status(400).json({ error: 'Application is not pending.' }); }

    let roomId = room_id;
    if (!roomId) {
      const [[room]] = await conn.query(`
        SELECT id FROM rooms
        WHERE status = 'available'
          AND (? = 'No Preference' OR block = ?)
          AND (type = ? OR ? = 'No Preference')
        LIMIT 1
      `, [
        app.block_pref || 'No Preference',
        app.block_pref || '',
        app.room_type  || 'Double',
        app.room_type  || 'No Preference'
      ]);
      if (!room) { await conn.rollback(); return res.status(400).json({ error: 'No available rooms matching the preference.' }); }
      roomId = room.id;
    }

    await conn.query(
      "UPDATE applications SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
      [req.user.id, req.params.id]
    );

    await conn.query(
      "INSERT INTO allocations (user_id, room_id, status, expires_at) VALUES (?, ?, 'active', DATE_ADD(NOW(), INTERVAL 1 YEAR))",
      [app.user_id, roomId]
    );

    await conn.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [roomId]);

    await conn.commit();

    const [[room]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [roomId]);
    res.json({ message: 'Application approved and room allocated.', room });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/applications/:id/reject ─────────────────────────────────────────
router.put('/:id/reject', auth, requireRole('admin'), async (req, res) => {
  try {
    const [[app]] = await pool.query('SELECT * FROM applications WHERE id = ?', [req.params.id]);
    if (!app) return res.status(404).json({ error: 'Application not found.' });

    await pool.query(
      "UPDATE applications SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
      [req.user.id, req.params.id]
    );
    res.json({ message: 'Application rejected.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
