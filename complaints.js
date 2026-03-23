// routes/complaints.js — Complaint management
const express = require('express');
const db = require('../db/init');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Helper: generate next complaint number
function nextComplaintNo() {
  const last = db.prepare("SELECT complaint_no FROM complaints ORDER BY id DESC LIMIT 1").get();
  if (!last) return 'C-001';
  const num = parseInt(last.complaint_no.replace('C-', ''), 10) + 1;
  return 'C-' + String(num).padStart(3, '0');
}

// ── GET /api/complaints ───────────────────────────────────────────────────
router.get('/', auth, (req, res) => {
  const { status, category, assigned_to } = req.query;
  let query, params = [];

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

  if (req.user.role === 'student') {
    query = baseSelect + ' AND c.user_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'maintenance') {
    query = baseSelect + ' AND c.assigned_to = ?';
    params.push(req.user.id);
  } else {
    query = baseSelect;
  }

  if (status)      { query += ' AND c.status = ?';      params.push(status); }
  if (category)    { query += ' AND c.category = ?';    params.push(category); }
  if (assigned_to) { query += ' AND c.assigned_to = ?'; params.push(assigned_to); }

  query += ' ORDER BY c.created_at DESC';

  const complaints = db.prepare(query).all(...params);
  res.json({ complaints });
});

// ── GET /api/complaints/:id ───────────────────────────────────────────────
router.get('/:id', auth, (req, res) => {
  const complaint = db.prepare(`
    SELECT c.*,
           u.name as student_name, u.student_id,
           r.room_number,
           a.name as assigned_name
    FROM complaints c
    JOIN  users u ON u.id = c.user_id
    LEFT JOIN rooms r ON r.id = c.room_id
    LEFT JOIN users a ON a.id = c.assigned_to
    WHERE c.id = ?
  `).get(req.params.id);

  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

  // Role check: students can only see their own
  if (req.user.role === 'student' && complaint.user_id !== req.user.id)
    return res.status(403).json({ error: 'Access denied.' });

  const updates = db.prepare(`
    SELECT cu.*, u.name as updated_by_name
    FROM complaint_updates cu
    JOIN users u ON u.id = cu.updated_by
    WHERE cu.complaint_id = ?
    ORDER BY cu.created_at ASC
  `).all(req.params.id);

  res.json({ complaint, updates });
});

// ── POST /api/complaints ──────────────────────────────────────────────────
router.post('/', auth, requireRole('student'), (req, res) => {
  const { category, priority, subject, description, image_url } = req.body;

  if (!subject || !description || !category)
    return res.status(400).json({ error: 'Category, subject and description are required.' });

  // Get student's allocated room
  const allocation = db.prepare(`
    SELECT room_id FROM allocations WHERE user_id = ? AND status = 'active' LIMIT 1
  `).get(req.user.id);

  const result = db.prepare(`
    INSERT INTO complaints (complaint_no, user_id, room_id, category, priority, subject, description, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextComplaintNo(),
    req.user.id,
    allocation?.room_id || null,
    category, priority || 'Medium',
    subject, description,
    image_url || null
  );

  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'Complaint submitted successfully.', complaint });
});

// ── PUT /api/complaints/:id/assign ────────────────────────────────────────
// Admin assigns complaint to maintenance staff
router.put('/:id/assign', auth, requireRole('admin'), (req, res) => {
  const { staff_id } = req.body;
  if (!staff_id) return res.status(400).json({ error: 'staff_id is required.' });

  const staff = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'maintenance'").get(staff_id);
  if (!staff) return res.status(404).json({ error: 'Maintenance staff not found.' });

  db.prepare(`
    UPDATE complaints
    SET assigned_to = ?, assigned_at = datetime('now'), status = 'In Progress', progress = 33
    WHERE id = ?
  `).run(staff_id, req.params.id);

  // Add timeline update
  db.prepare(`
    INSERT INTO complaint_updates (complaint_id, updated_by, message)
    VALUES (?, ?, ?)
  `).run(req.params.id, req.user.id, `Assigned to ${staff.name}`);

  res.json({ message: `Complaint assigned to ${staff.name}.` });
});

// ── PUT /api/complaints/:id/status ────────────────────────────────────────
// Maintenance staff updates status / progress
router.put('/:id/status', auth, requireRole('maintenance', 'admin'), (req, res) => {
  const { status, progress, message } = req.body;
  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

  // Maintenance can only update assigned complaints
  if (req.user.role === 'maintenance' && complaint.assigned_to !== req.user.id)
    return res.status(403).json({ error: 'This complaint is not assigned to you.' });

  const resolved_at = status === 'Resolved' ? "datetime('now')" : 'NULL';
  db.prepare(`
    UPDATE complaints
    SET status = ?, progress = ?,
        resolved_at = ${status === 'Resolved' ? "datetime('now')" : 'resolved_at'}
    WHERE id = ?
  `).run(status || complaint.status, progress ?? complaint.progress, req.params.id);

  if (message) {
    db.prepare(`
      INSERT INTO complaint_updates (complaint_id, updated_by, message) VALUES (?, ?, ?)
    `).run(req.params.id, req.user.id, message);
  }

  res.json({ message: 'Complaint updated successfully.' });
});

// ── DELETE /api/complaints/:id ────────────────────────────────────────────
router.delete('/:id', auth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM complaint_updates WHERE complaint_id = ?').run(req.params.id);
  db.prepare('DELETE FROM complaints WHERE id = ?').run(req.params.id);
  res.json({ message: 'Complaint deleted.' });
});

module.exports = router;
