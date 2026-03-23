// routes/admin.js — Admin dashboard stats & staff management
const express = require('express');
const db = require('../db/init');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/admin/dashboard ──────────────────────────────────────────────
router.get('/dashboard', auth, requireRole('admin'), (req, res) => {
  const roomStats = db.prepare(`
    SELECT
      COUNT(*) as total_rooms,
      SUM(CASE WHEN status='available'   THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status='occupied'    THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN status='maintenance' THEN 1 ELSE 0 END) as under_maintenance
    FROM rooms
  `).get();

  const complaintStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='Pending'     THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='In Progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status='Resolved'    THEN 1 ELSE 0 END) as resolved
    FROM complaints
  `).get();

  const applicationStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected
    FROM applications
  `).get();

  const studentCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get();

  // Occupancy rate
  const occupancyRate = roomStats.total_rooms > 0
    ? ((roomStats.occupied / roomStats.total_rooms) * 100).toFixed(1)
    : 0;

  // Category breakdown
  const categoryBreakdown = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM complaints
    GROUP BY category
    ORDER BY count DESC
  `).all();

  // Recent complaints
  const recentComplaints = db.prepare(`
    SELECT c.complaint_no, c.subject, c.category, c.status, c.priority,
           u.name as student_name, r.room_number
    FROM complaints c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN rooms r ON r.id = c.room_id
    ORDER BY c.created_at DESC LIMIT 5
  `).all();

  // Recent applications
  const recentApplications = db.prepare(`
    SELECT a.id, a.status, a.created_at, u.name as student_name, a.room_type, a.block_pref
    FROM applications a
    JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC LIMIT 5
  `).all();

  res.json({
    stats: {
      rooms: { ...roomStats, occupancy_rate: occupancyRate },
      complaints: complaintStats,
      applications: applicationStats,
      students: studentCount.count
    },
    categoryBreakdown,
    recentComplaints,
    recentApplications
  });
});

// ── GET /api/admin/students ───────────────────────────────────────────────
router.get('/students', auth, requireRole('admin'), (req, res) => {
  const students = db.prepare(`
    SELECT u.id, u.name, u.email, u.student_id, u.department, u.phone, u.created_at,
           r.room_number, r.block
    FROM users u
    LEFT JOIN allocations al ON al.user_id = u.id AND al.status = 'active'
    LEFT JOIN rooms r ON r.id = al.room_id
    WHERE u.role = 'student'
    ORDER BY u.created_at DESC
  `).all();
  res.json({ students });
});

// ── GET /api/admin/staff ──────────────────────────────────────────────────
router.get('/staff', auth, requireRole('admin'), (req, res) => {
  const staff = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone,
      (SELECT COUNT(*) FROM complaints WHERE assigned_to = u.id AND status != 'Resolved') as active_tasks,
      (SELECT COUNT(*) FROM complaints WHERE assigned_to = u.id AND status = 'Resolved') as resolved_tasks
    FROM users u
    WHERE u.role = 'maintenance'
  `).all();
  res.json({ staff });
});

module.exports = router;
