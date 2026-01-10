// middlewares/errorMiddleware.js
const { logger } = require('../utils/logger');
const AppError = require('./AppError');


const isDev = (process.env.NODE_ENV || 'development') === 'development';


module.exports = (err, req, res, next) => {
    // normalize
    err.statusCode = err.statusCode || 500;
    err.status = err.status || (String(err.statusCode).startsWith('4') ? 'fail' : 'error');


    // log the error with context
    const logObj = {
        route: req ? req.originalUrl : undefined,
        method: req ? req.method : undefined,
        requestId: req ? req.id : undefined,
        userId: req && req.user ? req.user.id : undefined,
        extra: err.extra || undefined,
    };


    // For operational AppError or expected errors we can log at warn for 4xx or error for 5xx
    if (err.isOperational) {
        if (err.statusCode && String(err.statusCode).startsWith('4')) {
            logger.warn({ err, ...logObj }, err.message);
        } else {
            logger.error({ err, ...logObj }, err.message);
        }
    } else {
        // unexpected error — log stack (error level)
        logger.error({ err, ...logObj }, 'Unexpected error');
    }


    // send the response (hide stack in production)
    const response = {
        status: err.status,
        message: err.isOperational ? err.message : 'Something went wrong',
        requestId: req ? req.id : undefined,
    };


    if (isDev && !err.isOperational) {
        // attach stack trace in development for debugging
        response.stack = err.stack;
    }


    res.status(err.statusCode).json(response);
};