const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Buat folder database jika belum ada
const DATABASE_DIR = path.join(__dirname, 'database');
if (!fs.existsSync(DATABASE_DIR)) {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

// Path file database
const USERS_FILE = path.join(DATABASE_DIR, 'users.json');
const ADMIN_FILE = path.join(DATABASE_DIR, 'admin.json');
const CHAT_FILE = path.join(DATABASE_DIR, 'chat.json');
const TOPIC_FILE = path.join(DATABASE_DIR, 'topics.json');
const MAINTENANCE_FILE = path.join(DATABASE_DIR, 'maintenance.json');

// Session
const sessionMiddleware = session({
  secret: 'rebona_secret_key',
  resave: false,
  saveUninitialized: true,
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

app.use(express.json());

// Middleware proteksi maintenance (kecuali admin)
app.use((req, res, next) => {
  const username = req.session.username;
  const isAdmin = users[username]?.role === 'admin' || username === admin.username;
  try {
    const { enabled } = JSON.parse(fs.readFileSync(MAINTENANCE_FILE));
    if (enabled && !isAdmin) {
  return res.sendFile(path.join(__dirname, 'public', 'maintenance.html'));
}
  } catch (err) {}
  next();
});

// Proteksi akses ke admin.html
app.get('/admin.html', (req, res, next) => {
  const username = req.session.username;
  const isAdmin = users[username]?.role === 'admin' || username === admin.username;
  if (!isAdmin) return res.redirect('/login.html');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Load data awal
let users = {};
let admin = {};
let messages = [];
let topics = [];

try {
  if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE));
  if (fs.existsSync(ADMIN_FILE)) admin = JSON.parse(fs.readFileSync(ADMIN_FILE));
  if (fs.existsSync(CHAT_FILE)) messages = JSON.parse(fs.readFileSync(CHAT_FILE));
  if (fs.existsSync(TOPIC_FILE)) topics = JSON.parse(fs.readFileSync(TOPIC_FILE));
  if (!fs.existsSync(MAINTENANCE_FILE)) fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify({ enabled: false }));
} catch (err) {
  console.error('Gagal memuat file JSON:', err);
}

// Fungsi penyimpanan
function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function saveAdmin() { fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2)); }
function saveMessages() { fs.writeFileSync(CHAT_FILE, JSON.stringify(messages, null, 2)); }
function saveTopics() { fs.writeFileSync(TOPIC_FILE, JSON.stringify(topics, null, 2)); }
function generateId() {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(100 + Math.random() * 900);
  return `${year}${month}${random}`;
}

// Endpoint register
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send('Lengkapi semua data.');
  if (users[username]) return res.status(409).send('Username sudah digunakan.');
  const hash = await bcrypt.hash(password, 10);
  const id = generateId();
  users[username] = { id, password: hash, role: 'user', banned: false };
  saveUsers();
  res.send('Register berhasil');
});

// Endpoint login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users[username];

  if (user) {
    if (user.banned) return res.status(403).send('Akun Anda telah diblokir.');
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.username = username;
      return res.json({ message: 'Login berhasil', id: user.id, role: user.role });
    }
  }

  if (admin?.username === username && await bcrypt.compare(password, admin.password || '')) {
    req.session.username = username;
    return res.json({ message: 'Login admin berhasil', id: 'admin', role: 'admin' });
  }

  return res.status(401).send('Username atau password salah.');
});

// Cek sesi login
app.get('/session', (req, res) => {
  if (req.session.username) {
    const user = users[req.session.username];
    const role = user?.role || 'admin';
    const id = user?.id || 'admin';
    res.json({ username: req.session.username, id, role });
  } else {
    res.status(401).send('Belum login');
  }
});

// Middleware cek admin
function isAdmin(req, res, next) {
  const user = users[req.session.username];
  if ((user && user.role === 'admin') || req.session.username === admin.username) {
    return next();
  }
  res.status(403).send('Akses ditolak');
}

// API Admin - User
app.get('/admin/users', isAdmin, (req, res) => {
  const allUsers = Object.entries(users).map(([username, data]) => ({
    username,
    role: data.role || 'user',
    banned: data.banned || false,
  }));
  res.json(allUsers);
});

app.post('/admin/users', isAdmin, async (req, res) => {
  const { username, password, role = 'user' } = req.body;
  if (!username || !password) return res.status(400).send('Lengkapi data');
  if (users[username]) return res.status(409).send('Username sudah ada');
  const hash = await bcrypt.hash(password, 10);
  users[username] = { id: generateId(), password: hash, role, banned: false };
  saveUsers();
  res.send('Pengguna ditambahkan');
});

app.delete('/admin/users/:username', isAdmin, (req, res) => {
  const { username } = req.params;
  if (!users[username]) return res.status(404).send('User tidak ditemukan');
  delete users[username];
  saveUsers();
  res.send('User dihapus');
});

app.put('/admin/users/:username/ban', isAdmin, (req, res) => {
  const { username } = req.params;
  if (!users[username]) return res.status(404).send('User tidak ditemukan');
  users[username].banned = true;
  saveUsers();
  res.send('User diblokir');
});

// API Admin - Topik
app.get('/admin/topics', isAdmin, (req, res) => {
  res.json(topics);
});

app.post('/admin/topics', isAdmin, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).send('Lengkapi data');
  topics.push({ id: generateId(), title, content });
  saveTopics();
  res.send('Topik ditambahkan');
});

app.delete('/admin/topics/:index', isAdmin, (req, res) => {
  const i = parseInt(req.params.index);
  if (isNaN(i) || i < 0 || i >= topics.length) return res.status(400).send('Index tidak valid');
  topics.splice(i, 1);
  saveTopics();
  res.send('Topik dihapus');
});

// Endpoint logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.send('Logout berhasil'));
});

// Endpoint topik publik
app.get('/topics', (req, res) => {
  res.json(topics);
});

// Endpoint maintenance (GET status & POST toggle)
app.get('/status/maintenance', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(MAINTENANCE_FILE));
    res.json({ enabled: data.enabled });
  } catch {
    res.status(500).json({ enabled: false });
  }
});

app.post('/admin/maintenance', isAdmin, (req, res) => {
  const { enabled } = req.body;
  fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify({ enabled }));
  res.send(`Maintenance ${enabled ? 'diaktifkan' : 'dimatikan'}`);
});

// Socket.IO untuk chat
io.on('connection', (socket) => {
  const session = socket.request.session;
  const username = session?.username;
  if (!username) return socket.disconnect();

  socket.emit('chatHistory', messages);

  socket.on('join', () => {
    console.log(`${username} joined the chat`);
  });

  socket.on('message', (msg) => {
    const message = {
      content: msg,
      sender: username,
      timestamp: new Date(),
    };
    messages.push(message);
    if (messages.length > 1000) messages.shift();
    saveMessages();
    io.emit('message', message);
  });
});

// Jalankan server
const PORT = process.env.PORT || 3200;
server.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));