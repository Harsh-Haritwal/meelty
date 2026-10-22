import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import Meeting from './models/Meeting.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' } });
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());
const rooms = new Map();
const ephemeralMeetings = new Map();
const makeCode = () => Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/meetings', async (req, res) => {
  try {
    let code;
    for (let i = 0; i < 5; i++) {
      code = makeCode();
      const inDatabase = mongoose.connection.readyState === 1 ? await Meeting.exists({ code }) : false;
      if (!rooms.has(code) && !ephemeralMeetings.has(code) && !inDatabase) break;
    }
    const title = req.body.title || 'Quick catch-up';
    const meeting = mongoose.connection.readyState === 1 ? await Meeting.create({ code, title }) : { code, title };
    if (mongoose.connection.readyState !== 1) ephemeralMeetings.set(code, meeting);
    res.status(201).json(meeting);
  } catch (error) { res.status(500).json({ message: 'Could not create meeting', error: error.message }); }
});
app.get('/api/meetings/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const meeting = mongoose.connection.readyState === 1 ? await Meeting.findOne({ code }) : ephemeralMeetings.get(code) || (rooms.has(code) ? { code } : null);
  if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
  res.json(meeting);
});

io.on('connection', socket => {
  socket.on('room:join', ({ code, name }) => {
    code = String(code || '').toUpperCase();
    const members = rooms.get(code) || new Map();
    if (members.size >= 10) return socket.emit('room:error', { message: 'This meeting is full. Meetings can have up to 10 people.' });
    const peers = [...members.entries()].map(([id, peer]) => ({ id, name: peer.name }));
    members.set(socket.id, { name: String(name || 'Guest').slice(0, 32) });
    rooms.set(code, members); socket.join(code); socket.data.room = code;
    socket.emit('room:joined', { peers, count: members.size });
    socket.to(code).emit('peer:joined', { id: socket.id, name: members.get(socket.id).name, count: members.size });
  });
  socket.on('peer:signal', ({ to, signal }) => io.to(to).emit('peer:signal', { from: socket.id, signal }));
  socket.on('disconnect', () => {
    const code = socket.data.room; if (!code || !rooms.has(code)) return;
    const members = rooms.get(code); members.delete(socket.id);
    socket.to(code).emit('peer:left', { id: socket.id, count: members.size });
    if (!members.size) rooms.delete(code);
  });
});

const port = process.env.PORT || 5000;
if (process.env.MONGODB_URI) mongoose.connect(process.env.MONGODB_URI).then(() => console.log('MongoDB connected')).catch(err => console.error('MongoDB unavailable:', err.message));
server.listen(port, () => console.log(`Meetly API listening on ${port}`));
