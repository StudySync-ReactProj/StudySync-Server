// fields: password, email, username, createdAt

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    contacts: [{
        name: String,
        email: String,
        avatar: String, // First letter of the name or URL to an image
    }],
    // OAuth tokens for Google integration
    googleAccessToken: String,
    googleRefreshToken: String,
    googleTokenExpiry: Number,
}, { timestamps: true });

const User = mongoose.model('User', schema);
module.exports = User;