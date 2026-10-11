// POV-style event photo albums. Pages live in /public as plain HTML files.
const express = require('express'), multer = require('multer'), QRCode = require('qrcode');
const archiver = require('archiver'), crypto = require('crypto'), fs = require('fs'), path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD must be set before starting the server.');
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB = path.join(DATA, 'albums.json');
const PUB = path.join(__dirname, 'public');
fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });

const load = () => (fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB)) : []);
const save = (a) => fs.writeFileSync(DB, JSON.stringify(a, null, 2));
const rid = (n) => crypto.randomBytes(n).toString('hex');
const base = (req) => process.env.BASE_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
const dir = (a) => path.join(DATA, 'uploads', a.id);

const app = express();
const adminSessions = new Map();
app.set('trust proxy', true);
app.use(express.json());
app.use(express.static(PUB, { index: false, extensions: [] })); // style.css only; html pages are routed below

const admin = (req, res, next) => {
  const token = req.headers.cookie?.match(/(?:^|;\s*)pov_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  const expiresAt = token && adminSessions.get(token);
  if (expiresAt && expiresAt > Date.now()) return next();
  if (token) adminSessions.delete(token);
  res.status(401).json({ error: 'Please log in to continue.' });
};
const setAdminCookie = (req, res, token) => {
  const secure = req.secure ? '; Secure' : '';
  res.set('Set-Cookie', `pov_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_TTL / 1000}${secure}`);
};
const findAlbum = (req, res, next) => { req.album = load().find((a) => a.id === req.params.id); req.album ? next() : res.status(404).send('Album not found'); };
const byKey = (req, res, next) => { req.album = load().find((a) => a.viewKey === req.params.key); req.album ? next() : res.status(404).send('Not found'); };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => cb(null, dir(req.album)),
    filename: (req, f, cb) => cb(null, Date.now() + '-' + rid(4) + (path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg')),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /^(image|video)\//.test(f.mimetype)),
});

// Admin
app.get('/admin', (req, res) => res.sendFile(path.join(PUB, 'admin.html')));
app.get('/api/admin/session', (req, res) => {
  const token = req.headers.cookie?.match(/(?:^|;\s*)pov_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  const expiresAt = token && adminSessions.get(token);
  res.json({ authenticated: Boolean(expiresAt && expiresAt > Date.now()) });
});
app.post('/api/admin/login', (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const supplied = Buffer.from(password);
  const expected = Buffer.from(ADMIN_PASSWORD);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'That password did not match. Please try again.' });
  }
  const now = Date.now();
  for (const [token, expiresAt] of adminSessions) {
    if (expiresAt <= now) adminSessions.delete(token);
  }
  const token = rid(32);
  adminSessions.set(token, now + ADMIN_SESSION_TTL);
  setAdminCookie(req, res, token);
  res.json({ ok: true });
});
app.post('/api/admin/logout', admin, (req, res) => {
  const token = req.headers.cookie?.match(/(?:^|;\s*)pov_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (token) adminSessions.delete(token);
  res.set('Set-Cookie', 'pov_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin/albums', admin, (req, res) => res.json(load().map((a) => ({ ...a, count: fs.readdirSync(dir(a)).length }))));
app.post('/api/admin/albums', admin, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  if (!name) return res.status(400).end();
  const a = { id: rid(6), viewKey: rid(12), name, createdAt: new Date().toISOString() };
  fs.mkdirSync(dir(a), { recursive: true });
  const all = load(); all.push(a); save(all); res.json(a);
});
app.delete('/api/admin/albums/:id', admin, (req, res) => {
  const all = load(), a = all.find((x) => x.id === req.params.id);
  if (a) { fs.rmSync(dir(a), { recursive: true, force: true }); save(all.filter((x) => x !== a)); }
  res.end();
});
app.get('/admin/qr/:id.png', admin, findAlbum, async (req, res) => {
  const png = await QRCode.toBuffer(`${base(req)}/a/${req.album.id}`, { width: 900, margin: 2 });
  res.type('png');
  if (req.query.download) res.attachment(`qr-${req.album.name.replace(/\W+/g, '-')}.png`);
  res.send(png);
});

// Guests
app.get('/a/:id', findAlbum, (req, res) => res.sendFile(path.join(PUB, 'guest.html')));
app.get('/api/a/:id', findAlbum, (req, res) => res.json({ name: req.album.name }));
app.post('/api/a/:id/photos', findAlbum, upload.array('photos', 30), (req, res) => res.json({ ok: true, n: (req.files || []).length }));

// Couple's private gallery
app.get('/g/:key', byKey, (req, res) => res.sendFile(path.join(PUB, 'gallery.html')));
app.get('/api/g/:key', byKey, (req, res) => res.json({ name: req.album.name, files: fs.readdirSync(dir(req.album)).sort().reverse() }));
app.get('/f/:key/:file', byKey, (req, res) => res.sendFile(path.join(dir(req.album), path.basename(req.params.file))));
app.get('/g/:key/zip', byKey, (req, res) => {
  res.attachment(`${req.album.name.replace(/\W+/g, '-')}.zip`);
  const z = archiver('zip', { store: true }); z.pipe(res); z.directory(dir(req.album), false); z.finalize();
});

app.get('/', (req, res) => res.redirect('/admin'));
app.listen(PORT, () => console.log(`Running on :${PORT} — admin at /admin`));
