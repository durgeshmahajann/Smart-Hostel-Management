// routes/auth.js — Register / Login (No OTP) / Profile
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/init');
const { auth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, student_id, department, phone } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required.' });

    const allowed = ['student', 'admin', 'maintenance'];
    if (role && !allowed.includes(role))
      return res.status(400).json({ error: 'Invalid role.' });

    const [[exists]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists)
      return res.status(409).json({ error: 'An account with this email already exists.' });

    const hashed = bcrypt.hashSync(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password, role, student_id, department, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hashed, role || 'student', student_id || null, department || null, phone || null]
    );

    const [[user]] = await pool.query(
      'SELECT id, name, email, role, student_id, department, phone FROM users WHERE id = ?',
      [result.insertId]
    );

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Account created successfully!', token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Incorrect email or password.' });

    if (role && user.role !== role)
      return res.status(403).json({ error: `This account is not registered as ${role}.` });

    const [[safeUser]] = await pool.query(
      'SELECT id, name, email, role, student_id, department, phone FROM users WHERE id = ?',
      [user.id]
    );

    const token = jwt.sign({ id: safeUser.id, role: safeUser.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful!', token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const [[user]] = await pool.query(
      'SELECT id, name, email, role, student_id, department, phone, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT /api/auth/profile ─────────────────────────────────────────────────────
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone, department } = req.body;

    await pool.query(
      'UPDATE users SET name = ?, phone = ?, department = ? WHERE id = ?',
      [name, phone, department, req.user.id]
    );

    const [[updated]] = await pool.query(
      'SELECT id, name, email, role, student_id, department, phone FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ message: 'Profile updated.', user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;