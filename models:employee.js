const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        enum: ['Ayyappan', 'Aditya', 'Purushoth', 'Karthik', 'Sanjay', 'Haripriya', 'Mahalakshmi']
    },
    date: {
        type: String,
        required: true
    },
    workStart: String,
    workEnd: String,
    tasksCompleted: {
        type: Number,
        default: 0
    },
    dailyEarnings: {
        type: Number,
        default: 0
    },
    incentives: {
        type: Number,
        default: 0
    },
    advances: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

employeeSchema.index({ name: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Employee', employeeSchema);