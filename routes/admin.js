// routes/admin.js — Admin dashboard stats & staff management
const express = require('express');
const pool    = require('../db/init');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/admin/dashboard ──────────────────────────────────────────────────
router.get('/dashboard', auth, requireRole('admin'), async (req, res) => {
  try {
    const [[roomStats]] = await pool.query(`
      SELECT
        COUNT(*) as total_rooms,
        SUM(status = 'available')   as available,
        SUM(status = 'occupied')    as occupied,
        SUM(status = 'maintenance') as under_maintenance
      FROM rooms
    `);

    const [[complaintStats]] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(status = 'Pending')     as pending,
        SUM(status = 'In Progress') as in_progress,
        SUM(status = 'Resolved')    as resolved
      FROM complaints
    `);

    const [[applicationStats]] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(status = 'pending')  as pending,
        SUM(status = 'approved') as approved,
        SUM(status = 'rejected') as rejected
      FROM applications
    `);

    const [[studentCount]] = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'student'"
    );

    const occupancyRate = roomStats.total_rooms > 0
      ? ((roomStats.occupied / roomStats.total_rooms) * 100).toFixed(1)
      : 0;

    const [categoryBreakdown] = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM complaints
      GROUP BY category
      ORDER BY count DESC
    `);

    const [recentComplaints] = await pool.query(`
      SELECT c.complaint_no, c.subject, c.category, c.status, c.priority,
             u.name as student_name, r.room_number
      FROM complaints c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN rooms r ON r.id = c.room_id
      ORDER BY c.created_at DESC LIMIT 5
    `);

    const [recentApplications] = await pool.query(`
      SELECT a.id, a.status, a.created_at, u.name as student_name, a.room_type, a.block_pref
      FROM applications a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT 5
    `);

    res.json({
      stats: {
        rooms:        { ...roomStats, occupancy_rate: occupancyRate },
        complaints:   complaintStats,
        applications: applicationStats,
        students:     studentCount.count
      },
      categoryBreakdown,
      recentComplaints,
      recentApplications
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/students ───────────────────────────────────────────────────
router.get('/students', auth, requireRole('admin'), async (req, res) => {
  try {
    const [students] = await pool.query(`
      SELECT u.id, u.name, u.email, u.student_id, u.department, u.phone, u.created_at,
             r.room_number, r.block
      FROM users u
      LEFT JOIN allocations al ON al.user_id = u.id AND al.status = 'active'
      LEFT JOIN rooms r ON r.id = al.room_id
      WHERE u.role = 'student'
      ORDER BY u.created_at DESC
    `);
    res.json({ students });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/staff ──────────────────────────────────────────────────────
router.get('/staff', auth, requireRole('admin'), async (req, res) => {
  try {
    const [staff] = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone,
        (SELECT COUNT(*) FROM complaints WHERE assigned_to = u.id AND status != 'Resolved') as active_tasks,
        (SELECT COUNT(*) FROM complaints WHERE assigned_to = u.id AND status  = 'Resolved') as resolved_tasks
      FROM users u
      WHERE u.role = 'maintenance'
    `);
    res.json({ staff });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
