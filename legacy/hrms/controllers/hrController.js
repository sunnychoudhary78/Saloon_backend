'use strict';

const { Op, where: sequelizeWhere, col, Sequelize } = require('sequelize');
const { EmployeeDetail, User, CompanySetting, Role, sequelize } = require('../models');
const { registryByKey, columnRegistry } = require('../config/columnRegistry');


/**
 * Helper: add days to date-only string (inclusive)
 * Example: addDaysToDateString('2025-01-01', 90) -> '2025-03-31'
 */
function addDaysToDateString(dateStr, days) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00.000Z');
    d.setUTCDate(d.getUTCDate() + (Number(days) || 0) - 1);
    return d.toISOString().slice(0, 10);
}

/**
 * GET /api/hr/probation/pending-confirmation
 * Returns employees who are still on probation (is_on_probation = true) but whose probation period is over.
 *
 * Query params:
 *  - page (default 1)
 *  - limit (default 25, max 200)
 *  - search (optional): searches user.name, user.email, employee.payroll_code, department_name
 */
exports.getProbationEndingEmployees = async (req, res) => {
    try {
        // pagination
        const rawPage = parseInt(req.query.page || '1', 10);
        const rawLimit = parseInt(req.query.limit || '25', 10);
        const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 25;
        const offset = (page - 1) * limit;

        const search = req.query.search ? String(req.query.search).trim() : null;
        const today = new Date().toISOString().slice(0, 10);

        // 1) Base DB filter: employees still on probation AND (probation_end_date <= today OR probation_end_date IS NULL AND doj IS NOT NULL)
        // We'll fetch two sets: (A) those with probation_end_date <= today (filtered in DB)
        // (B) those with probation_end_date IS NULL and doj IS NOT NULL (we compute in JS)
        const whereDb = {
            is_on_probation: true,
            [Op.or]: [
                { probation_end_date: { [Op.lte]: today } },
                { probation_end_date: null, doj: { [Op.ne]: null } }
            ]
        };

        // add search conditions using include / $user.name$ style for Postgres (Sequelize)
        if (search) {
            whereDb[Op.and] = [
                {
                    [Op.or]: [
                        { '$user.name$': { [Op.iLike]: `%${search}%` } },
                        { '$user.email$': { [Op.iLike]: `%${search}%` } },
                        { payroll_code: { [Op.iLike]: `%${search}%` } },
                        { department_name: { [Op.iLike]: `%${search}%` } },
                        { designation: { [Op.iLike]: `%${search}%` } }
                    ]
                }
            ];
        }

        // 2) Fetch candidate rows (paged)
        const { count: rawCount, rows } = await EmployeeDetail.findAndCountAll({
            where: whereDb,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'name', 'email']
                }
            ],
            order: [['probation_end_date', 'ASC'], ['doj', 'ASC']],
            limit,
            offset,
            distinct: true // ensure correct count when includes exist
        });

        // 3) If no rows just return
        if (!rows || rows.length === 0) {
            return res.json({
                page,
                limit,
                totalRecords: rawCount || 0,
                totalPages: Math.ceil((rawCount || 0) / limit),
                data: []
            });
        }

        // 4) Load company default probation days to compute probation_end for rows with null probation_end_date
        let defaultProbationDays = 180;
        try {
            const settings = await CompanySetting.findOne();
            if (settings && Number.isFinite(Number(settings.default_probation_days))) {
                defaultProbationDays = parseInt(settings.default_probation_days, 10);
            }
        } catch (err) {
            console.warn('Could not read CompanySetting.default_probation_days, using fallback 90 days', err && err.message);
        }

        // 5) Filter rows in JS: include only those whose computed end <= today
        const results = [];
        for (const e of rows) {
            // normalize plain object
            const emp = e.get ? e.get({ plain: true }) : e;

            // If probation_end_date exists, it's already <= today by our DB query; accept it.
            if (emp.probation_end_date) {
                results.push(emp);
                continue;
            }

            // Otherwise probation_end_date is null but doj exists: compute
            if (emp.doj) {
                const computed = addDaysToDateString(emp.doj, defaultProbationDays);
                if (computed && computed <= today) {
                    // attach computed probation_end_date so UI can show it
                    emp.probation_end_date_computed = computed;
                    results.push(emp);
                }
            }
        }

        // Note: rawCount includes rows matched by the DB filter; after JS filtering it may be smaller.
        const finalTotal = results.length;
        // If you want pagination across only final results you should do filtering first (less efficient).
        // For simplicity we return the paged DB results after JS-filtering.

        // 6) Map to response shape
        const data = results.map(emp => {
            const user = emp.user || {};
            const name = user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || null;
            return {
                id: emp.id,
                user_id: emp.user_id,
                name,
                email: user.email || null,
                payroll_code: emp.payroll_code || null,
                department: emp.department_name || null,
                designation: emp.designation || null,
                doj: emp.doj,
                probation_end_date: emp.probation_end_date || emp.probation_end_date_computed || null,
                is_on_probation: !!emp.is_on_probation,
                contact: emp.contact_primary || emp.contact_secondary || null,
                manager_id: emp.manager_id || null
            };
        });

        return res.json({
            page,
            limit,
            // returns how many rows matched after JS filtering (useful), and totalPages computed from DB count
            totalRecords: finalTotal,
            dbCount: rawCount,
            totalPages: Math.ceil((rawCount || 0) / limit),
            data
        });
    } catch (err) {
        console.error('getProbationEndingEmployees error:', err && err.message ? err.message : err);
        return res.status(500).json({ message: 'Error fetching probation ending employees', error: err && err.message ? err.message : err });
    }
};

//mark the employe as confirmed from probation by seting the is_on_probation to false
exports.confirmEmployeeProbation = async (req, res) => {
    let t;
    try {
        t = await sequelize.transaction();
        const userId = req.params.userId;
        const reviewedBy = req.user.id;
        const employee = await EmployeeDetail.findOne({ where: { user_id: userId }, transaction: t });
        if (!employee) {
            await t.rollback();
            return res.status(404).json({ message: 'Employee not found' });
        }
        employee.is_on_probation = false;
        employee.probation_reviewed_by = reviewedBy;
        employee.probation_reviewed_at = new Date().toISOString().slice(0, 10);
        await employee.save({ transaction: t });
        await t.commit();
        return res.status(200).json({ message: 'Employee probation confirmed successfully', employee });
    } catch (err) {
        if (t) await t.rollback();
        console.error('confirmEmployeeProbation error:', err && err.message ? err.message : err);
        return res.status(500).json({ message: 'Failed to confirm employee probation', error: err.message });
    }
};


exports.getEmployeesByStatus = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 500);
        const offset = (page - 1) * limit;

        const search = req.query.search ? String(req.query.search).trim() : null;
        const status = req.query.status ? String(req.query.status).trim().toLowerCase() : 'all';

        // Today's date as YYYY-MM-DD (DATEONLY comparisons)
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const where = {};

        // search by associates_name, email or payroll_code
        if (search) {
            where[Op.or] = [
                { associates_name: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } },
                { payroll_code: { [Op.iLike]: `%${search}%` } },
            ];
        }

        // status conditions
        if (status === 'confirmed') {
            // 1) confirmed => is_on_probation = false
            where.is_on_probation = false;
        } else if (status === 'on_probation') {
            // 2) on_probation => is_on_probation = true AND (probation_end_date > today OR probation_end_date IS NULL OR (doj + 6 months) > today)
            where[Op.and] = [
                { is_on_probation: true },
                {
                    [Op.or]: [
                        { probation_end_date: { [Op.gt]: todayStr } },
                        { probation_end_date: null },
                        // (doj + interval '6 months') > today
                        Sequelize.where(Sequelize.literal(`(doj + interval '6 months')`), '>', todayStr)
                    ]
                }
            ];
        } else if (status === 'probation_completed') {
            // 3) probation_completed => is_on_probation = true AND (probation_end_date < today OR (doj + 6 months) < today)
            where[Op.and] = [
                { is_on_probation: true },
                {
                    [Op.or]: [
                        { probation_end_date: { [Op.lt]: todayStr } },
                        // (doj + interval '6 months') < today
                        Sequelize.where(Sequelize.literal(`(doj + interval '6 months')`), '<', todayStr)
                    ]
                }
            ];
        } // else 'all' => no extra filter

        // fetch rows with pagination
        const { rows, count } = await EmployeeDetail.findAndCountAll({
            where,
            order: [['associates_name', 'ASC']],
            limit,
            offset
        });

        // map to plain objects
        const mapped = rows.map(r => (r.get ? r.get({ plain: true }) : r));

        const totalPages = Math.max(1, Math.ceil(count / limit));
        return res.status(200).json({
            meta: { page, limit, total: count, totalPages },
            data: mapped
        });
    } catch (err) {
        console.error('getEmployeesByStatus error:', err);
        return res.status(500).json({ message: 'Failed to fetch employees', error: err.message });
    }
};

// Probation table – query with advanced filters and column search (same as employees table style)
exports.probationQuery = async (req, res) => {
    try {
        const payload = req.body || {};
        const page = Math.max(parseInt(payload.page, 10) || 1, 1);
        const limit = Math.min(parseInt(payload.limit, 10) || 25, 500);
        const offset = (page - 1) * limit;

        const userId = req.user && req.user.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const defaultColumns = [
            { key: 'user_id', visible: true },
            { key: 'associates_name', visible: true },
            { key: 'email', visible: true },
            { key: 'payroll_code', visible: true },
            { key: 'doj', visible: true },
            { key: 'is_on_probation', visible: true },
            { key: 'probation_end_date', visible: true },
        ];

        let activeColumns = Array.isArray(payload.columns) && payload.columns.length
            ? payload.columns.filter(c => c && registryByKey[c.key]).map((c, idx) => ({ key: c.key, visible: !!c.visible, order: c.order || (idx + 1) }))
            : defaultColumns.map((c, idx) => ({ ...c, order: idx + 1 }));

        const columnsMeta = activeColumns
            .filter(ac => ac.visible)
            .map(ac => ({ key: ac.key, label: registryByKey[ac.key].label, type: registryByKey[ac.key].type }));
        const activeKeys = activeColumns.filter(ac => ac.visible).map(ac => ac.key);

        function normalizeOpKey(opRaw = '') { return String(opRaw || 'eq').trim(); }

        function buildFilterFromSingle({ colKey, filter }) {
            if (!filter || !registryByKey[colKey]) return null;
            const { value } = filter;
            const opKeyRaw = normalizeOpKey(filter.op || filter.operator || 'eq');
            const specialNoValue = opKeyRaw === 'isEmpty' || opKeyRaw === 'isNotEmpty' || opKeyRaw === 'isAnything' || opKeyRaw === 'isEmptyString';
            if (!specialNoValue) {
                if (value === null || typeof value === 'undefined') return null;
                if (typeof value === 'string' && value.trim() === '') return null;
            }

            const reg = registryByKey[colKey];
            const t = reg.type || 'string';
            const allowedByType = {
                string: new Set(['startsWith','endsWith','contains','notContains','eq','ne','in','isEmpty','isNotEmpty','isAnything','isEmptyString','same','different']),
                number: new Set(['eq','ne','lt','lte','gt','gte','between','in','isEmpty','isNotEmpty','isAnything','same','different']),
                date: new Set(['eq','ne','lt','lte','gt','gte','between','isEmpty','isNotEmpty','isAnything','same','different']),
                boolean: new Set(['eq','ne','isAnything']),
                uuid: new Set(['eq','ne','in','isEmpty','isNotEmpty','isAnything','same','different']),
                count: new Set(['eq','ne','lt','lte','gt','gte','between','isEmpty','isNotEmpty','isAnything','same','different']),
            };
            if (!allowedByType[t].has(opKeyRaw)) return null;

            const opKey = (opKeyRaw === 'same') ? 'eq' : (opKeyRaw === 'different') ? 'ne' : opKeyRaw;
            const OpMap = {
                eq: Op.eq,
                ne: Op.ne,
                iLike: Op.iLike,
                notILike: Op.notILike,
                contains: Op.iLike,
                notContains: Op.notILike,
                startsWith: Op.iLike,
                endsWith: Op.iLike,
                in: Op.in,
                notIn: Op.notIn,
                gt: Op.gt,
                gte: Op.gte,
                lt: Op.lt,
                lte: Op.lte,
                between: Op.between,
            };
            const sequelizeOp = OpMap[opKey];
            if (!sequelizeOp) return null;

            const path = reg.path || '';
            const segments = path.split('.').filter(Boolean);

            if (opKey === 'isAnything') return null;

            if (opKey === 'isEmpty') {
                const attr = segments[segments.length - 1] || colKey;
                const payloadCond = (t === 'string')
                    ? { [Op.or]: [{ [attr]: { [Op.is]: null } }, { [attr]: '' }] }
                    : { [attr]: { [Op.is]: null } };
                return segments.length > 1
                    ? { type: 'include', payload: { pathSegments: segments, condition: payloadCond } }
                    : { type: 'top', payload: payloadCond };
            }

            if (opKey === 'isNotEmpty') {
                const attr = segments[segments.length - 1] || colKey;
                const payloadCond = (t === 'string')
                    ? { [Op.and]: [{ [attr]: { [Op.not]: null } }, { [attr]: { [Op.ne]: '' } }] }
                    : { [attr]: { [Op.not]: null } };
                return segments.length > 1
                    ? { type: 'include', payload: { pathSegments: segments, condition: payloadCond } }
                    : { type: 'top', payload: payloadCond };
            }

            if (opKey === 'isEmptyString') {
                const attr = segments[segments.length - 1] || colKey;
                const payloadCond = { [attr]: '' };
                return segments.length > 1
                    ? { type: 'include', payload: { pathSegments: segments, condition: payloadCond } }
                    : { type: 'top', payload: payloadCond };
            }

            let conditionValue = value;
            if (sequelizeOp === Op.iLike || sequelizeOp === Op.notILike) {
                const v = String(value || '');
                if (opKey === 'contains' || opKey === 'notContains') conditionValue = `%${v}%`;
                else if (opKey === 'startsWith') conditionValue = `${v}%`;
                else if (opKey === 'endsWith') conditionValue = `%${v}`;
                else conditionValue = v;
            } else if (sequelizeOp === Op.in) {
                conditionValue = Array.isArray(value) ? value : [value];
            } else if (sequelizeOp === Op.between) {
                conditionValue = Array.isArray(value) ? value : String(value).split(',');
            }

            if (segments.length > 1) {
                const leafAttr = segments[segments.length - 1];
                return { type: 'include', payload: { pathSegments: segments, condition: { [leafAttr]: { [sequelizeOp]: conditionValue } } } };
            } else {
                const attr = segments[0] || colKey;
                return { type: 'top', payload: { [attr]: { [sequelizeOp]: conditionValue } } };
            }
        }

        function transformFilters(payloadObj) {
            const topWhereClauses = [];
            const includeFilters = [];
            const columnFilters = payloadObj.columnFilters || {};
            for (const [colKey, filter] of Object.entries(columnFilters || {})) {
                const built = buildFilterFromSingle({ colKey, filter });
                if (!built) continue;
                if (built.type === 'top') topWhereClauses.push(built.payload);
                else includeFilters.push(built.payload);
            }
            const adv = Array.isArray(payloadObj.advancedFilters) ? payloadObj.advancedFilters : [];
            for (const f of adv) {
                if (!f || !f.field) continue;
                const colKey = f.field;
                const filter = { op: f.op || f.operator, value: f.value };
                const built = buildFilterFromSingle({ colKey, filter });
                if (!built) continue;
                if (built.type === 'top') topWhereClauses.push(built.payload);
                else includeFilters.push(built.payload);
            }
            const where = topWhereClauses.length === 0 ? {} : { [Op.and]: topWhereClauses };
            return { where, includeFilters };
        }

        const transformed = transformFilters(payload || {});
        let where = transformed.where || {};
        let includeFilters = transformed.includeFilters || [];

        // status filter support (same semantics as getEmployeesByStatus)
        const status = payload.status ? String(payload.status).trim().toLowerCase() : 'all';
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        if (status === 'confirmed') {
            where = { [Op.and]: [where, { is_on_probation: false }] };
        } else if (status === 'on_probation') {
            const probationCond = {
                [Op.and]: [
                    { is_on_probation: true },
                    {
                        [Op.or]: [
                            { probation_end_date: { [Op.gt]: todayStr } },
                            { probation_end_date: null },
                            Sequelize.where(Sequelize.literal(`(doj + interval '6 months')`), '>', todayStr)
                        ]
                    }
                ]
            };
            where = { [Op.and]: [where, probationCond] };
        } else if (status === 'probation_completed') {
            const probationDoneCond = {
                [Op.and]: [
                    { is_on_probation: true },
                    {
                        [Op.or]: [
                            { probation_end_date: { [Op.lt]: todayStr } },
                            Sequelize.where(Sequelize.literal(`(doj + interval '6 months')`), '<', todayStr)
                        ]
                    }
                ]
            };
            where = { [Op.and]: [where, probationDoneCond] };
        }

        const userInclude = {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email'],
        };

        const includes = [userInclude];

        // apply includeFilters
        function applyIncludeFilters(includeFiltersArr, includesArr) {
            if (!Array.isArray(includeFiltersArr) || includeFiltersArr.length === 0) return;
            for (const inc of includeFiltersArr) {
                const segs = inc.pathSegments || [];
                if (segs.length === 0) continue;
                const topAlias = segs[0];
                const top = includesArr.find(i => i.as === topAlias);
                if (!top) continue;
                if (segs.length === 1) {
                    top.where = top.where ? { [Op.and]: [top.where, inc.condition] } : inc.condition;
                    top.required = true;
                    continue;
                }
                let current = top;
                let applied = false;
                for (let i = 1; i < segs.length; i++) {
                    const segment = segs[i];
                    if (i === segs.length - 1) {
                        current.where = current.where ? { [Op.and]: [current.where, inc.condition] } : inc.condition;
                        current.required = true;
                        applied = true;
                        break;
                    }
                    if (!current.include || !Array.isArray(current.include)) { applied = false; break; }
                    const next = current.include.find(ci => ci.as === segment);
                    if (!next) { applied = false; break; }
                    current = next;
                }
            }
        }

        applyIncludeFilters(includeFilters, includes);

        const employeeAttrs = new Set(['id','user_id','associates_name','email','payroll_code','doj','is_on_probation','probation_end_date']);
        const employeeAttributesArray = Array.from(employeeAttrs);

        // server-side sorting
        const sortSpec = payload && payload.sort ? payload.sort : {};
        const sortKeyRaw = typeof sortSpec.key === 'string' ? sortSpec.key : '';
        const sortDirRaw = typeof sortSpec.dir === 'string' ? sortSpec.dir : '';
        const dir = (sortDirRaw || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        let order;
        if (sortKeyRaw && registryByKey[sortKeyRaw]) {
            const reg = registryByKey[sortKeyRaw];
            const path = reg.path || sortKeyRaw;
            if (path.startsWith('user.')) {
                const field = path.replace(/^user\./, '');
                order = [[User, 'user', field, dir]];
            } else {
                order = [[path, dir]];
            }
        } else {
            order = [['probation_end_date', 'ASC'], ['doj', 'ASC']];
        }

        const { rows, count } = await EmployeeDetail.findAndCountAll({
            where,
            attributes: employeeAttributesArray,
            include: includes,
            offset,
            limit,
            distinct: true,
            order,
        });

        const shapedRows = rows.map(r => {
            const plain = r.get({ plain: true });
            const out = {};
            for (const key of activeKeys) {
                const reg = registryByKey[key];
                if (!reg) continue;
                if (reg.path.startsWith('user.')) {
                    const userField = reg.path.replace(/^user\./, '');
                    out[key] = plain.user ? plain.user[userField] : null;
                } else {
                    out[key] = Object.prototype.hasOwnProperty.call(plain, reg.path) ? plain[reg.path] : null;
                }
            }
            // always include user_id for actions even if not visible
            out.user_id = plain.user_id || (plain.user && plain.user.id) || out.user_id;
            return out;
        });

        const totalPages = Math.max(1, Math.ceil(count / limit));
        return res.json({ meta: { total: count, page, limit, totalPages }, columns: columnsMeta, rows: shapedRows });
    } catch (err) {
        console.error('probationQuery error', err);
        return res.status(400).json({ error: err.message || 'Failed building probation query' });
    }
};
