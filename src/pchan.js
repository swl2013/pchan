const express = require('express');
const sqlite3 = require('sqlite3');
const multer  = require('multer');
const path = require('path');
const crypto = require('crypto');
const sanitizeHtml = require('sanitize-html');
const { createCanvas } = require('canvas');

const app = express();
const db = new sqlite3.Database("data.bin");

const uploadDir = path.join(__dirname, 'uploads');
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.mimetype)) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

const captchaStore = new Map();

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS post (
      pid INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      email TEXT NOT NULL,
      imageFilename TEXT,
      imageOriginalName TEXT,
      imageMime TEXT,
      imageSize INTEGER
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS reply (
      pid INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      parentId INTEGER NOT NULL,
      email TEXT NOT NULL,
      imageFilename TEXT,
      imageOriginalName TEXT,
      imageMime TEXT,
      imageSize INTEGER
    )
  `);
});

function sanitize(input) {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    allowedSchemes: []
  });
}

app.get('/captcha', (req, res) => {
  const captchaId = crypto.randomBytes(16).toString('hex');
  const text = Math.random().toString(36).substring(2, 7);
  captchaStore.set(captchaId, text.toLowerCase());
  setTimeout(() => captchaStore.delete(captchaId), 5 * 60 * 1000);

  const width = 150;
  const height = 50;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `rgba(${Math.floor(Math.random()*256)},${Math.floor(Math.random()*256)},${Math.floor(Math.random()*256)},0.7)`;
    ctx.beginPath();
    ctx.moveTo(Math.random()*width, Math.random()*height);
    ctx.lineTo(Math.random()*width, Math.random()*height);
    ctx.stroke();
  }

  ctx.font = '30px Arial';
  ctx.fillStyle = '#000';
  for (let i = 0; i < text.length; i++) {
    const x = 20 + i * 25;
    const y = 30 + Math.random() * 10;
    const angle = (Math.random() - 0.5) * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }

  res.json({
    captchaId,
    image: canvas.toDataURL(),
    question: "Enter the text shown in the image"
  });
});

function validateCaptcha(req, res, next) {
  const { captchaId, captchaAnswer } = req.body;
  if (!captchaId || !captchaAnswer) {
    return res.status(400).json({ error: 'Captcha required' });
  }
  const correctAnswer = captchaStore.get(captchaId);
  if (!correctAnswer || captchaAnswer.toLowerCase() !== correctAnswer) {
    return res.status(400).json({ error: 'Captcha incorrect' });
  }
  captchaStore.delete(captchaId);
  next();
}

const Post = {};
const Reply = {};

Post.Create = function ({ name, subject, content, email, image }, callback) {
  const stmt = db.prepare(
    `INSERT INTO post (name, subject, content, email, imageFilename, imageOriginalName, imageMime, imageSize)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    sanitize(name),
    sanitize(subject),
    sanitize(content),
    sanitize(email),
    image ? image.filename : null,
    image ? image.originalname : null,
    image ? image.mimetype : null,
    image ? image.size : null,
    function(err) {
      if (callback) callback(err, this ? this.lastID : null);
    }
  );
  stmt.finalize();
};

Reply.Create = function ({ name, subject, content, parentId, email, image }, callback) {
  const stmt = db.prepare(
    `INSERT INTO reply (name, subject, content, parentId, email, imageFilename, imageOriginalName, imageMime, imageSize)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    sanitize(name),
    sanitize(subject),
    sanitize(content),
    parentId,
    sanitize(email),
    image ? image.filename : null,
    image ? image.originalname : null,
    image ? image.mimetype : null,
    image ? image.size : null,
    function(err) {
      if (callback) callback(err, this ? this.lastID : null);
    }
  );
  stmt.finalize();
};

class Board {
  #name;

  constructor(name) {
    this.#name = name;

    app.post(`/${this.#name}/post`, upload.single('image'), validateCaptcha, (req, res) => {
      const { name, subject, content, email } = req.body;
      const image = req.file || null;

      Post.Create({ name, subject, content, email, image }, (err, id) => {
        if (err) {
          return res.status(500).json({ error: "Failed to create post" });
        }
        res.status(201).json({ pid: id });
      });
    });

    app.post(`/${this.#name}/reply`, upload.single('image'), validateCaptcha, (req, res) => {
      const { name, subject, content, parentId, email } = req.body;
      const image = req.file || null;

      Reply.Create({ name, subject, content, parentId, email, image }, (err, id) => {
        if (err) {
          return res.status(500).json({ error: "Failed to create reply" });
        }
        res.status(201).json({ pid: id });
      });
    });
  }
}

const b = new Board("b");

app.get('/:board/posts', (req, res) => {
  const board = req.params.board;

  db.all(`SELECT * FROM post ORDER BY pid DESC`, [], (err, posts) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch posts' });

    const postIds = posts.map(p => p.pid);
    if (postIds.length === 0) return res.json([]);

    db.all(
      `SELECT * FROM reply WHERE parentId IN (${postIds.map(() => '?').join(',')}) ORDER BY pid ASC`,
      postIds,
      (err2, replies) => {
        if (err2) return res.status(500).json({ error: 'Failed to fetch replies' });

        const repliesByPost = {};
        for (const reply of replies) {
          if (!repliesByPost[reply.parentId]) repliesByPost[reply.parentId] = [];
          repliesByPost[reply.parentId].push(reply);
        }

        const combined = posts.map(post => ({
          ...post,
          replies: repliesByPost[post.pid] || []
        }));

        res.json(combined);
      }
    );
  });
});

app.listen(3000, () => console.log("pchan online on localhost:3000."));
