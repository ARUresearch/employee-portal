require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aru_research', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Models
const Employee = require('./models/Employee');
const Project = require('./models/Project');
const Admin = require('./models/Admin');

// Authentication Middleware
const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).send({ error: 'Access denied. No token provided.' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        req.user = decoded;
        next();
    } catch (err) {
        res.status(400).send({ error: 'Invalid token.' });
    }
};

// Routes

// Employee Routes
app.post('/api/employees/start-work', async (req, res) => {
    try {
        const { name, confirmName } = req.body;
        
        if (name !== confirmName) {
            return res.status(400).send({ error: 'Employee name does not match.' });
        }

        const today = new Date().toISOString().split('T')[0];
        const existingRecord = await Employee.findOne({ name, date: today });

        if (existingRecord?.workStart) {
            return res.status(400).send({ error: 'Work already started today.' });
        }

        const employee = existingRecord || new Employee({
            name,
            date: today
        });

        employee.workStart = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await employee.save();

        res.send({ message: 'Work started successfully!', employee });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

app.post('/api/employees/end-work', async (req, res) => {
    try {
        const { name, confirmName } = req.body;
        
        if (name !== confirmName) {
            return res.status(400).send({ error: 'Employee name does not match.' });
        }

        const today = new Date().toISOString().split('T')[0];
        const employee = await Employee.findOne({ name, date: today });

        if (!employee) {
            return res.status(400).send({ error: 'No attendance record found for today.' });
        }

        if (employee.workEnd) {
            return res.status(400).send({ error: 'Work already ended today.' });
        }

        employee.workEnd = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await employee.save();

        res.send({ message: 'Work ended successfully!', employee });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

app.post('/api/employees/update-tasks', async (req, res) => {
    try {
        const { name, tasksCompleted } = req.body;
        
        const today = new Date().toISOString().split('T')[0];
        const employee = await Employee.findOne({ name, date: today });

        if (!employee) {
            return res.status(400).send({ error: 'No attendance record found for today.' });
        }

        if (employee.tasksCompleted > 0) {
            return res.status(400).send({ error: 'Tasks already updated today.' });
        }

        // Calculate earnings based on your slab rates
        const slabRates = { A: 100, B: 80, C: 60 };
        const slab = tasksCompleted >= 20 ? 'A' : tasksCompleted >= 15 ? 'B' : 'C';
        const dailyEarnings = tasksCompleted * slabRates[slab];

        employee.tasksCompleted = tasksCompleted;
        employee.dailyEarnings = dailyEarnings;
        await employee.save();

        res.send({ message: 'Tasks updated successfully!', employee });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

app.get('/api/employees/salary-records', async (req, res) => {
    try {
        const { filter } = req.query;
        let query = {};

        if (filter === 'today') {
            const today = new Date().toISOString().split('T')[0];
            query.date = today;
        } else if (filter === 'month') {
            const currentMonth = new Date().getMonth() + 1;
            const currentYear = new Date().getFullYear();
            query.$expr = {
                $and: [
                    { $eq: [{ $month: { $toDate: { $concat: ["$date", "T00:00:00.000Z"] } } }, currentMonth] },
                    { $eq: [{ $year: { $toDate: { $concat: ["$date", "T00:00:00.000Z"] } } }, currentYear] }
                ]
            };
        }

        const records = await Employee.find(query).sort({ date: -1 });
        res.send(records);
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// Project Routes
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await Project.find().sort({ endDate: 1 });
        res.send(projects);
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

app.post('/api/projects', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).send({ error: 'Access denied. Admin only.' });
        }

        const { name, startDate, endDate, sampleSize, sampleAchieved } = req.body;

        if (sampleAchieved > sampleSize) {
            return res.status(400).send({ error: 'Sample achieved cannot be greater than sample size.' });
        }

        const project = new Project({
            name,
            startDate,
            endDate,
            sampleSize,
            sampleAchieved
        });

        await project.save();
        res.status(201).send({ message: 'Project added successfully!', project });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// Admin Routes
app.post('/api/admin/login', async (req, res) => {
    try {
        const { password } = req.body;
        const admin = await Admin.findOne({ username: 'admin' });

        if (!admin) {
            // Create default admin if not exists
            const hashedPassword = await bcrypt.hash('Admin1234', 10);
            const newAdmin = new Admin({
                username: 'admin',
                password: hashedPassword
            });
            await newAdmin.save();
            return res.status(400).send({ error: 'Default admin created. Please try again.' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(400).send({ error: 'Invalid password.' });
        }

        const token = jwt.sign(
            { id: admin._id, role: 'admin' },
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '1h' }
        );

        res.send({ message: 'Login successful!', token });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

app.post('/api/admin/update-employee', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).send({ error: 'Access denied. Admin only.' });
        }

        const { name, incentiveAmount, advanceAmount } = req.body;
        const today = new Date().toISOString().split('T')[0];

        let employee = await Employee.findOne({ name, date: today });

        if (!employee) {
            employee = new Employee({
                name,
                date: today,
                incentives: incentiveAmount || 0,
                advances: advanceAmount || 0
            });
        } else {
            employee.incentives = (employee.incentives || 0) + (incentiveAmount || 0);
            employee.advances = (employee.advances || 0) + (advanceAmount || 0);
        }

        await employee.save();
        res.send({ message: 'Employee record updated successfully!', employee });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));