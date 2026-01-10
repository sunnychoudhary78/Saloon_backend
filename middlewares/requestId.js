// middlewares/requestId.js
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');


module.exports = (req, res, next) => {
    // attach id and startTime
    const id = req.headers['x-request-id'] || uuidv4();
    req.id = id;
    req.startTime = Date.now();


    // attach a logger child for request-scoped logs
    if (req && req.id) {
        req.log = logger.child({ requestId: req.id });
    } else {
        req.log = logger;
    }


    // expose request id to response headers for easier tracing
    res.setHeader('X-Request-Id', req.id);


    next();
};