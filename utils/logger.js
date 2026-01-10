const pino = require("pino");
const path = require("path");

// Create a folder path for logs (ensure the folder exists or create it at startup)
const logDirectory = path.join(__dirname, "../logs");

const logger = pino({
  level: process.env.LOG_LEVEL || "warn",  // default → warn & error
  transport: {
    targets: [
      {
        // Console output (colored logs)
        target: "pino-pretty",
        level: process.env.LOG_LEVEL || "warn",
        options: {
          colorize: true,
          translateTime: true
        },
      },
      {
        // Write ALL logs to file
        target: "pino/file",
        level: "info", // write info, warn, error (you can change to "warn" if you want only warn+error)
        options: {
          destination: `${logDirectory}/app.log`, // <-- main log file
          mkdir: true, // automatically create directory if missing
        },
      },
      {
        // Optional: error-specific file
        target: "pino/file",
        level: "error",
        options: {
          destination: `${logDirectory}/error.log`,
          mkdir: true,
        },
      },
    ],
  },
});

module.exports = { logger };
