const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  locationType: {
    type: String,
    enum: ['online', 'offline'],
    default: 'online'
  },
  location: {
    type: String, // Zoom link or physical address
  },
  // Duration as displayed in ParticipantsStep
  duration: {
    hours: { type: Number, default: 1 },
    minutes: { type: Number, default: 0 }
  },
  timeRange: {
    type: String,
    enum: ['this-week', 'next-week', 'this-month', 'next-month'],
  },
  // List of participants with invitation status
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User' // Reference to existing user in the system (optional)
    },
    name: String,
    email: String,
    avatar: String,
    status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Declined'],
      default: 'Pending'
    }
  }],
  // Options proposed in the Poll
  availableSlots: [{
    date: String, // e.g.: "Tue, Dec 9"
    time: String, // e.g.: "2:00 PM–4:00 PM"
    votes: { type: Number, default: 0 }
  }],
  // The slot that was finally selected after coordination
  selectedSlot: {
    date: String,
    time: String
  },
  status: {
    type: String,
    enum: ['Draft', 'Scheduled', 'Cancelled', 'Completed'],
    default: 'Draft'
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);