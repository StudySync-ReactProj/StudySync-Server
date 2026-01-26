const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please add an event title'], 
    },
    description: {
        type: String,
        required: false,
    },
    location: {
        type: String,
        required: false,
    },
    participants: [{
        type: String,
        required: false,
    }],
    start: {
        type: Date,
        required: [true, 'Please add a start date'],
    },
    end: {
        type: Date, 
        required: [true, 'Please add an end date'],
    },
    duration: {
        type: Number, // duration in minutes    
        required: false,
    },
    // Important fix: Link to User model
    creator: {
        type: mongoose.Schema.Types.ObjectId, 
        required: true,
        ref: 'User', 
    },
    status: {
        type: String,
        enum: ['Scheduled', 'Cancelled', 'Completed'],
        default: 'Scheduled',
    },
}, {
    // Add automatic timestamps (creates createdAt and updatedAt automatically)
    timestamps: true 
});

const Event = mongoose.model('Event', schema);
module.exports = Event;