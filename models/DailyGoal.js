const mongoose = require("mongoose");

// Stores user's daily goal minutes for a specific date (YYYY-MM-DD)
const dailyGoalSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    minutes: { type: Number, required: true },
}, { timestamps: true });

// Ensure one goal per user per date
dailyGoalSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailyGoal", dailyGoalSchema);
