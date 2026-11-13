const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");
const requestId = require("./middlewares/requestId");
const errorMiddleware = require("./middlewares/errorMiddleware");
const AppError = require("./middlewares/AppError");
const asyncHandler = require("./middlewares/asyncHandler");
const razorpayWebhookController = require("./controllers/razorpayWebhookController");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");

const app = express();

app.set("trust proxy", true);
app.use(requestId);

//test
// Razorpay webhooks must verify HMAC against the raw request body.
app.post(
  "/api/app/payments/razorpay/webhook",
  express.raw({ type: "application/json" }),
  asyncHandler(razorpayWebhookController.handleWebhook),
);

app.use(express.json());

const corsOptions = {
  origin: (origin, callback) => callback(null, true),
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-client-type",
    "x-request-id",
  ],
};
app.use(cors(corsOptions));
app.use(morgan("dev"));

app.use(
  "/api/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "365d",
    immutable: true,
    setHeaders(res) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);

// Fallback for missing salon/staff seed images so the client never hits a broken 404 image
app.get("/api/uploads/salons/:file", (req, res, next) => {
  const fallback = path.join(__dirname, "uploads", "salons", "seed-1.jpg");
  if (fs.existsSync(fallback)) {
    return res.sendFile(fallback);
  }
  next();
});

app.get("/api/uploads/staff/:file", (req, res, next) => {
  const fallback = path.join(__dirname, "uploads", "staff", "seed-1.jpg");
  if (fs.existsSync(fallback)) {
    return res.sendFile(fallback);
  }
  next();
});

// Auth & access control
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/role-permissions", require("./routes/rolePermissionRoutes"));

// Salon marketplace admin APIs
app.use("/api/stats", require("./routes/statsRoutes"));
app.use("/api/salon-owners", require("./routes/salonOwnerRoutes"));
app.use("/api/salon-applications", require("./routes/salonApplicationRoutes"));
app.use("/api/salons", require("./routes/salonRoutes"));
app.use("/api/services", require("./routes/serviceRoutes"));
app.use("/api/customers", require("./routes/customerRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/coupons", require("./routes/couponRoutes"));
app.use("/api/rewards", require("./routes/rewardRoutes"));
app.use(
  "/api/promotional-banners",
  require("./routes/promotionalBannerRoutes"),
);
app.use("/api/platform-settings", require("./routes/platformSettingRoutes"));
app.use("/api/otp-usage", require("./routes/otpUsageRoutes"));
app.use("/api/finance-settings", require("./routes/financeSettingsRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/settlements", require("./routes/settlementRoutes"));
app.use(
  "/api/salon-payout-accounts",
  require("./routes/salonPayoutAccountRoutes"),
);
app.use("/api/audit-logs", require("./routes/auditLogRoutes"));
app.use("/api/gallery", require("./routes/galleryRoutes"));

// Infrastructure
app.use("/api/table-configs", require("./routes/tableConfigRoutes"));
app.use("/api/drafts", require("./routes/draftRoutes"));

// Mobile-ready APIs
app.use("/api/app", require("./routes/appRoutes"));

app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

app.use(errorMiddleware);

module.exports = app;
