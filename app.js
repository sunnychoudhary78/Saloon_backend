const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cron = require('node-cron');
const path = require('path');
const multer = require('multer');
const requestId = require('./middlewares/requestId');
const errorMiddleware = require('./middlewares/errorMiddleware');


const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const companyRoutes = require('./routes/companyRoutes');

const app = express();

//Midlwares

// honor X-Forwarded-For / X-Real-IP from proxies/load balancers
app.set('trust proxy', true);

app.use(requestId);

app.use(express.json());
const corsOptions = {
  origin: (origin, callback) => {
    callback(null, true); // allow all origins dynamically
  },
  credentials: true, // now credentials are allowed
};

app.use(cors(corsOptions));
app.use(morgan("dev"));








app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/employee-photo', require('./routes/photoRoutes'));
app.use('/api/role-permissions', require('./routes/rolePermissionRoutes'));
app.use('/api/hr', require('./routes/hrRoutes'));
app.use('/api/table-configs', require('./routes/tableConfigRoutes'));
app.use('/api/drafts', require('./routes/draftRoutes'));
app.use('/api/company-settings', require('./routes/companySettingRoutes'));
app.use('/api/variables', require('./routes/variablesRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));

// Global error handler

// 404 handler — prefer this form to avoid path-to-regexp issues
const AppError = require('./middlewares/AppError');
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});


// central error handler — *last* middleware
app.use(errorMiddleware);



// app.use((err, req, res, next) => {
//     // Multer-specific errors
//     if (err instanceof multer.MulterError) {
//         // common multer codes: 'LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'
//         if (err.code === 'LIMIT_FILE_SIZE') {
//             return res.status(400).json({
//                 error: 'File too large',
//                 message: 'Uploaded file exceeds the maximum allowed size of 1 MB'
//             });
//         }
//         // fallback for other multer errors
//         return res.status(400).json({ error: 'Upload error', message: err.message });
//     }

//     // handle other known errors you want to format
//     // if (err) {
//     //     console.error(err);
//     //     return res.status(500).json({ error: 'Internal Server Error', message: err.message });
//     // }

//     next();
// });



module.exports = app;
