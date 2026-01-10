// File: src/services/employeeFilterBuilder.js

const { Op, fn, col, where: sequelizeWhere, literal } = require('sequelize');
const { registryByKey } = require('../config/columnRegistry');

// Configuration / limits
const MAX_LIMIT = 500;
const MAX_IN_LENGTH = 200;
const MAX_GROUPS = 20;
const MAX_NESTING = 3;

// Allowed operators per type
const OPERATORS_BY_TYPE = {
    string: ['eq', 'ne', 'contains', 'startsWith', 'endsWith', 'in', 'not_in'],
    number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in'],
    date: ['eq', 'ne', 'before', 'after', 'between'],
    boolean: ['is'],
    count: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in'],
};

const allowedOperatorsByType = {
    string: ['eq', 'ne', 'iLike', 'notILike', 'in', 'notIn', 'like', 'notLike'],
    number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'notIn'],
    date: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'],
    boolean: ['eq', 'ne'],
    count: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
    uuid: ['eq', 'ne', 'in', 'notIn'],           // <-- add this
    // if you have other custom types add them here
};

function validateField(key) {
    if (!registryByKey[key]) throw new Error(`Unknown field: ${key}`);
    return registryByKey[key];
}

function validateOperatorForType(type, op) {
    const allowed = OPERATORS_BY_TYPE[type] || [];
    if (!allowed.includes(op)) throw new Error(`Operator ${op} not allowed for type ${type}`);
}

function coerceValue(type, op, value) {
    if (value === null || typeof value === 'undefined') return null;

    if (Array.isArray(value)) return value.map(v => coerceValue(type, op, v));

    switch (type) {
        case 'number':
        case 'count': {
            const n = Number(value);
            if (Number.isNaN(n)) throw new Error('Invalid number value');
            return n;
        }
        case 'date': {
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) throw new Error('Invalid date value, expected ISO string');
            return d.toISOString();
        }
        case 'boolean': {
            if (typeof value === 'boolean') return value;
            const s = String(value).toLowerCase();
            if (['true', '1', 'yes'].includes(s)) return true;
            if (['false', '0', 'no'].includes(s)) return false;
            throw new Error('Invalid boolean value');
        }
        default:
            return String(value);
    }
}

function buildStringCondition(pathCol, op, rawValue) {
    const val = String(rawValue);
    switch (op) {
        case 'eq': return { [Op.eq]: val };
        case 'ne': return { [Op.ne]: val };
        case 'contains': return { [Op.iLike]: `%${escapeLike(val)}%` };
        case 'startsWith': return { [Op.iLike]: `${escapeLike(val)}%` };
        case 'endsWith': return { [Op.iLike]: `%${escapeLike(val)}` };
        case 'in': return { [Op.in]: Array.isArray(rawValue) ? rawValue : [rawValue] };
        case 'not_in': return { [Op.notIn]: Array.isArray(rawValue) ? rawValue : [rawValue] };
        default: throw new Error('Unsupported string operator ' + op);
    }
}

function escapeLike(s) {
    return s.replace(/[\\%_]/g, ch => '\\' + ch);
}

function buildNumberCondition(op, value) {
    switch (op) {
        case 'eq': return { [Op.eq]: value };
        case 'ne': return { [Op.ne]: value };
        case 'gt': return { [Op.gt]: value };
        case 'gte': return { [Op.gte]: value };
        case 'lt': return { [Op.lt]: value };
        case 'lte': return { [Op.lte]: value };
        case 'between': return { [Op.between]: value }; // expects [low,high]
        case 'in': return { [Op.in]: Array.isArray(value) ? value : [value] };
        case 'not_in': return { [Op.notIn]: Array.isArray(value) ? value : [value] };
        default: throw new Error('Unsupported number operator ' + op);
    }
}

function buildDateCondition(op, value) {
    switch (op) {
        case 'eq': return { [Op.eq]: value };
        case 'ne': return { [Op.ne]: value };
        case 'before': return { [Op.lt]: value };
        case 'after': return { [Op.gt]: value };
        case 'between': return { [Op.between]: value }; // expects ISO strings
        default: throw new Error('Unsupported date operator ' + op);
    }
}

function buildBooleanCondition(op, value) {
    if (op !== 'is') throw new Error('Unsupported boolean operator ' + op);
    return { [Op.eq]: value };
}


// buildConditionForField returns { type, pathSegments, condition }
// pathSegments is an array like ['user','Role','name'] or ['manager','name'] or ['doj']
function buildConditionForField(fieldKey, op, rawValue) {
    const reg = validateField(fieldKey);
    const type = reg.type || 'string';

    validateOperatorForType(type, op);

    // coercion
    let coerced;
    if (op === 'between') {
        if (!Array.isArray(rawValue) || rawValue.length !== 2) throw new Error('between operator expects array of two values');
        coerced = rawValue.map(v => coerceValue(type, op, v));
    } else if (op === 'in' || op === 'not_in') {
        if (!Array.isArray(rawValue)) throw new Error('in operator expects array of values');
        if (rawValue.length > MAX_IN_LENGTH) throw new Error('IN list too large');
        coerced = rawValue.map(v => coerceValue(type, op, v));
    } else {
        coerced = coerceValue(type, op, rawValue);
    }

    // split path into segments; if reg.path is 'user.Role.name' -> ['user','Role','name']
    const path = reg.path;
    const segments = String(path).split('.').filter(Boolean);

    let condition;
    if (type === 'string') condition = buildStringCondition(path, op, coerced);
    else if (type === 'number' || type === 'count') condition = buildNumberCondition(op, coerced);
    else if (type === 'date') condition = buildDateCondition(op, coerced);
    else if (type === 'boolean') condition = buildBooleanCondition(op, coerced);
    else condition = buildStringCondition(path, op, coerced);

    return { type, path, pathSegments: segments, condition };
}


// Recursively build group conditions (supports {logic: 'and'|'or', conditions: [...] } or single conditions)
function buildGroup(group, depth = 0) {
    if (depth > MAX_NESTING) throw new Error('Filter nesting too deep');
    if (!group) return { wherePart: null, includeConds: [] };

    // single condition
    if (group.field && group.op) {
        const { pathSegments, condition } = buildConditionForField(group.field, group.op, group.value);

        // If pathSegments length > 1 (references include or nested include), return includeCond
        if (pathSegments.length > 1) {
            // includeCond structure: { pathSegments: ['user','Role','name'], condition: { name: {...} } }
            // but we want condition object keyed by leaf field name:
            const leaf = pathSegments[pathSegments.length - 1];
            const condObj = { [leaf]: condition };
            return { wherePart: null, includeConds: [{ pathSegments, condition: condObj }] };
        }

        // single segment — top-level column on employee or user alias column (like 'email' on user)
        const single = pathSegments[0];
        // treat user.* that ended up as single segment (user.email) — build top-level Sequelize WHERE using Sequelize.col
        // We'll return a top-level wherePart: either { [single]: condition } or sequelizeWhere(col('user.email'), condition)
        if (group.field.startsWith('user.') || group.field.startsWith('user.')) {
            // prefer Sequelize.where(Sequelize.col('user.' + single), condition)
            return { wherePart: sequelizeWhere(col(`user.${single}`), condition), includeConds: [] };
        }
        // otherwise employee field
        return { wherePart: { [single]: condition }, includeConds: [] };
    }

    // compound group (AND/OR)
    const logic = (group.logic || 'and').toLowerCase();
    if (!['and', 'or'].includes(logic)) throw new Error('Invalid group logic');
    if (!Array.isArray(group.conditions)) throw new Error('Compound group must have conditions array');
    if (group.conditions.length > MAX_GROUPS) throw new Error('Too many conditions');

    const whereParts = [];
    const includeConds = [];

    for (const cond of group.conditions) {
        const built = buildGroup(cond, depth + 1);
        if (!built) continue;
        if (built.wherePart) whereParts.push(built.wherePart);
        if (Array.isArray(built.includeConds) && built.includeConds.length) includeConds.push(...built.includeConds);
    }

    const combinedWhere = whereParts.length === 0 ? null : (whereParts.length === 1 ? whereParts[0] : (logic === 'and' ? { [Op.and]: whereParts } : { [Op.or]: whereParts }));

    return { wherePart: combinedWhere, includeConds };
}

function mergeWhereParts(parts) {
    const flat = parts.filter(Boolean);
    if (flat.length === 0) return {};
    if (flat.length === 1) return flat[0];
    return { [Op.and]: flat };
}

// public entry: accepts payload with search, columnFilters, advancedFilters
function buildWhereFromFilters(payload) {
    const whereParts = [];
    const includeConds = [];

    // global search => same as before but ensure you add to whereParts (top-level)
    if (payload && payload.search) {
        const term = String(payload.search).trim();
        if (term.length > 0) {
            const searchCols = ['associates_name', 'payroll_code', 'designation', 'associates_name', 'email'];
            const orParts = searchCols.map(k => {
                const reg = registryByKey[k];
                if (!reg) return null;
                // if reg.path references included model, prefer pushing into includeConds
                const segments = String(reg.path).split('.');
                if (segments.length > 1) {
                    // create include cond
                    const leaf = segments[segments.length - 1];
                    const condObj = { [leaf]: { [Op.iLike]: `%${escapeLike(term)}%` } };
                    includeConds.push({ pathSegments: segments, condition: condObj });
                    return null;
                } else {
                    // top-level employee/user column
                    return sequelizeWhere(col(reg.path), { [Op.iLike]: `%${escapeLike(term)}%` });
                }
            }).filter(Boolean);
            if (orParts.length) whereParts.push({ [Op.or]: orParts });
        }
    }

    // is_active
    if (typeof payload.is_active !== 'undefined' && payload.is_active !== null) {
        whereParts.push({ is_active: payload.is_active });
    }

    // columnFilters
    if (payload.columnFilters && typeof payload.columnFilters === 'object') {
        for (const [field, spec] of Object.entries(payload.columnFilters)) {
            if (!spec || typeof spec !== 'object') continue;
            const built = buildGroup({ field, op: spec.op, value: spec.value }, 0);
            if (built) {
                if (built.wherePart) whereParts.push(built.wherePart);
                if (Array.isArray(built.includeConds) && built.includeConds.length) includeConds.push(...built.includeConds);
            }
        }
    }

    // advancedFilters
    if (Array.isArray(payload.advancedFilters)) {
        for (const grp of payload.advancedFilters) {
            const built = buildGroup(grp, 0);
            if (!built) continue;
            if (built.wherePart) whereParts.push(built.wherePart);
            if (Array.isArray(built.includeConds) && built.includeConds.length) includeConds.push(...built.includeConds);
        }
    }

    const finalWhere = mergeWhereParts(whereParts);
    return { where: finalWhere, includeFilters: includeConds };
}
module.exports = { buildWhereFromFilters, MAX_LIMIT };
