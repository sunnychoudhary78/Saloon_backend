// middlewares/AppError.js
class AppError extends Error {
    constructor(message, statusCode = 500, extra = {}) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${String(statusCode).startsWith('4') ? 'fail' : 'error'}`;
        this.isOperational = true;
        this.extra = extra;
        Error.captureStackTrace(this, this.constructor);
    }
}


module.exports = AppError;