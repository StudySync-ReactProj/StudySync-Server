const mongoose = require("mongoose");

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

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true } 
);

module.exports = mongoose.models.Task || mongoose.model("Task", taskSchema);
