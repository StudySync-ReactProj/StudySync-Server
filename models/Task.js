// fields: title, taskNotes, priority (High/Medium/Low), status, dueDate,
//         createdAt, updatedAt, userId
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    taskNotes: {
        type: String,
        required: false
    },
    priority: {
        type: String,
        enum: ['Critical', 'High', 'Medium', 'Low'],
        default: 'Low'
    },
    status: {
        type: String,
        enum: ['Not Started', 'In Progress', 'Completed'],
        default: 'Not Started'
    },
    dueDate: {
        type: Date,
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});

const Task = mongoose.model('Task', schema);
module.exports = Task;