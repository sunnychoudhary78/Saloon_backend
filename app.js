const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const requestId = require('./middlewares/requestId');
const errorMiddleware = require('./middlewares/errorMiddleware');
const AppError = require('./middlewares/AppError');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');

const app = express();

app.set('trust proxy', true);
app.use(requestId);
app.use(express.json());

const corsOptions = {
  origin: (origin, callback) => callback(null, true),
  credentials: true,
};
app.use(cors(corsOptions));
app.use(morgan('dev'));

app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth & access control
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/role-permissions', require('./routes/rolePermissionRoutes'));

// Salon marketplace admin APIs
app.use('/api/stats', require('./routes/statsRoutes'));
app.use('/api/salon-owners', require('./routes/salonOwnerRoutes'));
app.use('/api/salon-applications', require('./routes/salonApplicationRoutes'));
app.use('/api/salons', require('./routes/salonRoutes'));
app.use('/api/service-categories', require('./routes/serviceCategoryRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/promotional-banners', require('./routes/promotionalBannerRoutes'));
app.use('/api/platform-settings', require('./routes/platformSettingRoutes'));
app.use('/api/audit-logs', require('./routes/auditLogRoutes'));

// Infrastructure
app.use('/api/table-configs', require('./routes/tableConfigRoutes'));
app.use('/api/drafts', require('./routes/draftRoutes'));

// Mobile-ready APIs
app.use('/api/app', require('./routes/appRoutes'));

app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

app.use(errorMiddleware);

module.exports = app;
