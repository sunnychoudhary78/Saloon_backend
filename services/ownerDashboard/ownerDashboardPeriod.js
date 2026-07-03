const { addDaysToDateString } = require('./dateWindow');

const LIFETIME_CHART_MONTHS = 12;

function resolvePeriod(periodKey, scopeDate) {
  const key = periodKey || '7d';
  const toDate = scopeDate;

  if (key === 'lifetime') {
    const fromDate = addDaysToDateString(toDate, -(LIFETIME_CHART_MONTHS * 30));
    return {
      key: 'lifetime',
      days: null,
      fromDate: null,
      toDate,
      label: 'Lifetime',
      chartGranularity: 'month',
      chartMonths: LIFETIME_CHART_MONTHS,
      chartFromDate: fromDate,
    };
  }

  const days = key === '30d' ? 30 : 7;
  const fromDate = addDaysToDateString(toDate, -(days - 1));

  return {
    key,
    days,
    fromDate,
    toDate,
    label: key === '30d' ? 'Last 30 days' : 'Last 7 days',
    chartGranularity: 'day',
    chartMonths: null,
    chartFromDate: fromDate,
  };
}

function buildPeriodMeta(periodOpts) {
  return {
    key: periodOpts.key,
    from: periodOpts.fromDate,
    to: periodOpts.toDate,
    label: periodOpts.label,
    granularity: periodOpts.chartGranularity,
  };
}

module.exports = {
  LIFETIME_CHART_MONTHS,
  resolvePeriod,
  buildPeriodMeta,
};
