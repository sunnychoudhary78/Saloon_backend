
const { Department, User } = require('./models');
const { getAllDepartments } = require('./controllers/departmentController');

// Mock req, res
const req = {
    query: {},
    log: { error: console.error, info: console.log }
};
const res = {
    json: (data) => {
        console.log(JSON.stringify(data, null, 2));
    },
    status: (code) => {
        console.log("Status:", code);
        return res;
    }
};

(async () => {
    try {
        await getAllDepartments(req, res);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
