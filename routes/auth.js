// routes/auth.js — Register / Login / Profile
const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const db        = require('../db/init');
const { auth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/register ───────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { name, email, password, role, student_id, department, phone } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password are required.' });

  const allowed = ['student', 'admin', 'maintenance'];
  if (role && !allowed.includes(role))
    return res.status(400).json({ error: 'Invalid role.' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists)
    return res.status(409).json({ error: 'An account with this email already exists.' });

  const hashed = bcrypt.hashSync(password, 10);

  const result = db.prepare(`
    INSERT INTO users (name, email, password, role, student_id, department, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, email, hashed, role || 'student', student_id || null, department || null, phone || null);

  const user = db.prepare('SELECT id, name, email, role, student_id, department, phone FROM users WHERE id = ?')
    .get(result.lastInsertRowid);

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({ message: 'Account created successfully!', token, user });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Incorrect email or password.' });

  if (role && user.role !== role)
    return res.status(403).json({ error: `This account is not registered as ${role}.` });

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

  const { password: _, ...safeUser } = user;
  res.json({ message: 'Logged in successfully!', token, user: safeUser });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────
router.get('/me', auth, (req, res) => {
  const user = db.prepare(
    'SELECT id, name, email, role, student_id, department, phone, created_at FROM users WHERE id = ?'
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user });
});

// ── PUT /api/auth/profile ─────────────────────────────────────────────────
router.put('/profile', auth, (req, res) => {
  const { name, phone, department } = req.body;

  db.prepare(`
    UPDATE users SET name = ?, phone = ?, department = ? WHERE id = ?
  `).run(name, phone, department, req.user.id);

  const updated = db.prepare(
    'SELECT id, name, email, role, student_id, department, phone FROM users WHERE id = ?'
  ).get(req.user.id);

  res.json({ message: 'Profile updated.', user: updated });
});

module.exports = router;