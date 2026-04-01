// routes/complaints.js — Complaint management
const express = require('express');
const pool    = require('../db/init');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Helper: generate next complaint number
async function nextComplaintNo() {
  const [[last]] = await pool.query(
    'SELECT complaint_no FROM complaints ORDER BY id DESC LIMIT 1'
  );
  if (!last) return 'C-001';
  const num = parseInt(last.complaint_no.replace('C-', ''), 10) + 1;
  return 'C-' + String(num).padStart(3, '0');
}

// ── GET /api/complaints ───────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { status, category, assigned_to } = req.query;
    let params = [];

    const baseSelect = `
      SELECT c.*,
             u.name  as student_name, u.student_id,
             r.room_number,
             a.name  as assigned_name
      FROM complaints c
      JOIN  users u ON u.id = c.user_id
      LEFT JOIN rooms r ON r.id = c.room_id
      LEFT JOIN users a ON a.id = c.assigned_to
      WHERE 1=1
    `;

    let query = baseSelect;

    if (req.user.role === 'student') {
      query += ' AND c.user_id = ?'; params.push(req.user.id);
    } else if (req.user.role === 'maintenance') {
      query += ' AND c.assigned_to = ?'; params.push(req.user.id);
    }

    if (status)      { query += ' AND c.status = ?';      params.push(status); }
    if (category)    { query += ' AND c.category = ?';    params.push(category); }
    if (assigned_to) { query += ' AND c.assigned_to = ?'; params.push(assigned_to); }

    query += ' ORDER BY c.created_at DESC';

    const [complaints] = await pool.query(query, params);
    res.json({ complaints });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/complaints/:id ───────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const [[complaint]] = await pool.query(`
      SELECT c.*,
             u.name as student_name, u.student_id,
             r.room_number,
             a.name as assigned_name
      FROM complaints c
      JOIN  users u ON u.id = c.user_id
      LEFT JOIN rooms r ON r.id = c.room_id
      LEFT JOIN users a ON a.id = c.assigned_to
      WHERE c.id = ?
    `, [req.params.id]);

    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    if (req.user.role === 'student' && complaint.user_id !== req.user.id)
      return res.status(403).json({ error: 'Access denied.' });

    const [updates] = await pool.query(`
      SELECT cu.*, u.name as updated_by_name
      FROM complaint_updates cu
      JOIN users u ON u.id = cu.updated_by
      WHERE cu.complaint_id = ?
      ORDER BY cu.created_at ASC
    `, [req.params.id]);

    res.json({ complaint, updates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/complaints ──────────────────────────────────────────────────────
router.post('/', auth, requireRole('student'), async (req, res) => {
  try {
    const { category, priority, subject, description, image_url } = req.body;

    if (!subject || !description || !category)
      return res.status(400).json({ error: 'Category, subject and description are required.' });

    const [[allocation]] = await pool.query(
      "SELECT room_id FROM allocations WHERE user_id = ? AND status = 'active' LIMIT 1",
      [req.user.id]
    );

    const complaint_no = await nextComplaintNo();

    const [result] = await pool.query(
      `INSERT INTO complaints
         (complaint_no, user_id, room_id, category, priority, subject, description, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        complaint_no,
        req.user.id,
        allocation?.room_id || null,
        category,
        priority || 'Medium',
        subject,
        description,
        image_url || null
      ]
    );

    const [[complaint]] = await pool.query(
      'SELECT * FROM complaints WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json({ message: 'Complaint submitted successfully.', complaint });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT /api/complaints/:id/assign ────────────────────────────────────────────
router.put('/:id/assign', auth, requireRole('admin'), async (req, res) => {
  try {
    const { staff_id } = req.body;
    if (!staff_id) return res.status(400).json({ error: 'staff_id is required.' });

    const [[staff]] = await pool.query(
      "SELECT id, name FROM users WHERE id = ? AND role = 'maintenance'",
      [staff_id]
    );
    if (!staff) return res.status(404).json({ error: 'Maintenance staff not found.' });

    await pool.query(
      `UPDATE complaints
       SET assigned_to = ?, assigned_at = NOW(), status = 'In Progress', progress = 33
       WHERE id = ?`,
      [staff_id, req.params.id]
    );

    await pool.query(
      'INSERT INTO complaint_updates (complaint_id, updated_by, message) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, `Assigned to ${staff.name}`]
    );

    res.json({ message: `Complaint assigned to ${staff.name}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT /api/complaints/:id/status ────────────────────────────────────────────
router.put('/:id/status', auth, requireRole('maintenance', 'admin'), async (req, res) => {
  try {
    const { status, progress, message } = req.body;
    const [[complaint]] = await pool.query(
      'SELECT * FROM complaints WHERE id = ?',
      [req.params.id]
    );
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    if (req.user.role === 'maintenance' && complaint.assigned_to !== req.user.id)
      return res.status(403).json({ error: 'This complaint is not assigned to you.' });

    const newStatus   = status   ?? complaint.status;
    const newProgress = progress ?? complaint.progress;
    const resolvedAt  = newStatus === 'Resolved' ? new Date() : complaint.resolved_at;

    await pool.query(
      'UPDATE complaints SET status = ?, progress = ?, resolved_at = ? WHERE id = ?',
      [newStatus, newProgress, resolvedAt, req.params.id]
    );

    if (message) {
      await pool.query(
        'INSERT INTO complaint_updates (complaint_id, updated_by, message) VALUES (?, ?, ?)',
        [req.params.id, req.user.id, message]
      );
    }

    res.json({ message: 'Complaint updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── DELETE /api/complaints/:id ────────────────────────────────────────────────
router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM complaint_updates WHERE complaint_id = ?', [req.params.id]);
    await pool.query('DELETE FROM complaints WHERE id = ?', [req.params.id]);
    res.json({ message: 'Complaint deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
