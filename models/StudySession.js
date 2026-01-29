const mongoose = require("mongoose");

// Stores study time per user per day
const studySessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    minutes: { type: Number, required: true },
}, { timestamps: true });

module.exports = mongoose.model("StudySession", studySessionSchema);
