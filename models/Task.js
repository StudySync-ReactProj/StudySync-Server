const mongoose = require("mongoose");
const { applyIdJsonTransform } = require('./schemaJson');

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    taskNotes: { type: String },

    priority: {
      type: String,
      enum: ["Critical", "High", "Medium", "Low"],
      default: "Low",
    },

    status: {
      type: String,
      enum: ["Not Started", "In Progress", "Completed"],
      default: "Not Started",
    },

    dueDate: { type: Date },

    // --- scheduling & estimation fields ---
    estimatedMinutes: { type: Number, default: 0 },
    scheduledStart: { type: Date },
    scheduledEnd: { type: Date },
    googleEventId: { type: String },
    creditedEstimatedTime: { type: Boolean, default: false },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

applyIdJsonTransform(taskSchema);

module.exports = mongoose.models.Task || mongoose.model("Task", taskSchema);
