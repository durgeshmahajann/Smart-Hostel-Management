// routes/auth.js — Register & Login
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db/init');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { name, email, password, student_id, department, phone } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password are required.' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing)
    return res.status(409).json({ error: 'An account with this email already exists.' });

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (name, email, password, role, student_id, department, phone)
    VALUES (?, ?, ?, 'student', ?, ?, ?)
  `).run(name, email, hashed, student_id || null, department || null, phone || null);

  const user = db.prepare('SELECT id, name, email, role, student_id, department FROM users WHERE id = ?')
    .get(result.lastInsertRowid);

  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({ message: 'Account created successfully.', token, user });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid email or password.' });

  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    message: 'Login successful.',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, student_id: user.student_id, department: user.department }
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const { auth } = require('../middleware/auth');
router.get('/me', auth, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.student_id, u.department, u.phone,
           r.room_number, r.block, r.floor, r.type as room_type
    FROM users u
    LEFT JOIN allocations a ON a.user_id = u.id AND a.status = 'active'
    LEFT JOIN rooms r ON r.id = a.room_id
    WHERE u.id = ?
  `).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user });
});

// ── PUT /api/auth/profile ─────────────────────────────────────────────────────
router.put('/profile', auth, (req, res) => {
  const { name, phone, emergency_contact } = req.body;
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?')
    .run(name || req.user.name, phone || null, req.user.id);
  res.json({ message: 'Profile updated successfully.' });
});

module.exports = router;
