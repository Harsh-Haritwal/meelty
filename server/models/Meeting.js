import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  title: { type: String, default: 'Quick catch-up' },
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});

export default mongoose.model('Meeting', meetingSchema);
