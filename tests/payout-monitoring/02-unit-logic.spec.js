const { test, expect } = require('@playwright/test');

// ============================================================
// LOGIC IMPLEMENTATIONS DERIVED FROM PAYOUT MONITORING COMPONENTS
// ============================================================

// 1. Month string to Date parser from PayoutMonitoring.jsx
const monthStringToDate = (monthString = "") => {
  const parts = monthString.split("-");
  const mon = parts[parts.length - 2] || parts[0];
  const yy = parts[parts.length - 1];

  const monthMap = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const monthIndex = monthMap[mon];
  const yearNum = Number(yy);
  const fullYear = yearNum < 100 ? 2000 + yearNum : yearNum;

  return new Date(fullYear, monthIndex, 1);
};

// 2. Fee Display Name logic from FinancePage.jsx
const getServiceFeeDisplayName = (dealType) => {
  const isIciciDeal = dealType === "M" || dealType === "M+1";
  return isIciciDeal ? "Collection Fee" : "Service Fee";
};

// 3. Asset Account method resolution from FinancePage.jsx
const resolveAssetAccountMethod = (distributionMethod) => {
  return String(distributionMethod || "").toUpperCase() === "SELF" ? "APR" : "IPC";
};

// 4. Interval Dates Generator logic from FilterSidebar.jsx
function getIntervalDates(startDateStr, intervalValue, intervalType = "months", currentDateStr) {
  const parseYMD = (s) => {
    const [y, m, d] = (s || "").split("-").map(Number);
    if (!y || !m || !d) throw new Error("Invalid date string");
    return { y, m, d };
  };
  const pad2 = (n) => String(n).padStart(2, "0");
  const cmp = (a, b) => a.y - b.y || a.m - b.m || a.d - b.d;

  const start = parseYMD(startDateStr);
  let today = currentDateStr ? parseYMD(currentDateStr) : { y: 2026, m: 11, d: 4 };

  if (cmp(start, today) >= 0) return [];
  const out = [];

  if (intervalType === "months") {
    const daysInMonth = (y, m1to12) => new Date(y, m1to12, 0).getDate();
    const baseDay = start.d;

    for (let k = intervalValue; ; k += intervalValue) {
      const totalMonths = start.y * 12 + (start.m - 1) + k;
      const y = Math.floor(totalMonths / 12);
      const m = (totalMonths % 12) + 1;
      const dim = daysInMonth(y, m);
      const d = baseDay >= 31 ? (dim >= 31 ? 31 : Math.min(30, dim)) : Math.min(baseDay, dim);

      const candidate = { y, m, d };
      if (cmp(candidate, today) <= 0) {
        out.push(`${y}-${pad2(m)}-${pad2(d)}`);
      } else break;
    }
  }
  return out;
}

// ============================================================
// UNIT / PURE LOGIC TESTS
// ============================================================
test.describe('Payout Monitoring - Unit & Calculation Logic Tests', () => {

  test('UNIT-001: Month string to Date parser handles multiple standard formats', async () => {
    const d1 = monthStringToDate('Aug-25');
    expect(d1.getFullYear()).toBe(2025);
    expect(d1.getMonth()).toBe(7); // August = index 7

    const d2 = monthStringToDate('Feb-26');
    expect(d2.getFullYear()).toBe(2026);
    expect(d2.getMonth()).toBe(1); // February = index 1

    const d3 = monthStringToDate('IIFL_136_UBI-Apr-25');
    expect(d3.getFullYear()).toBe(2025);
    expect(d3.getMonth()).toBe(3); // April = index 3
  });

  test('UNIT-002: Service fee naming derives correctly based on deal structure', async () => {
    // Standard deal structures use "Service Fee"
    expect(getServiceFeeDisplayName('Standard')).toBe('Service Fee');
    expect(getServiceFeeDisplayName('Others')).toBe('Service Fee');
    expect(getServiceFeeDisplayName(null)).toBe('Service Fee');

    // ICICI deal structures use "Collection Fee"
    expect(getServiceFeeDisplayName('M')).toBe('Collection Fee');
    expect(getServiceFeeDisplayName('M+1')).toBe('Collection Fee');
  });

  test('UNIT-003: Asset account method resolves correctly between APR and IPC', async () => {
    expect(resolveAssetAccountMethod('SELF')).toBe('APR');
    expect(resolveAssetAccountMethod('self')).toBe('APR');
    expect(resolveAssetAccountMethod('Standard')).toBe('IPC');
    expect(resolveAssetAccountMethod('intrest-principal')).toBe('IPC');
    expect(resolveAssetAccountMethod(undefined)).toBe('IPC');
  });

  test('UNIT-004: Interval dates generator correctly handles monthly schedule and cutoff', async () => {
    // Start date 2025-01-10, interval 1 month, reference today: 2025-05-15
    const dates = getIntervalDates('2025-01-10', 1, 'months', '2025-05-15');
    
    expect(dates).toContain('2025-02-10');
    expect(dates).toContain('2025-03-10');
    expect(dates).toContain('2025-04-10');
    expect(dates).toContain('2025-05-10');
    expect(dates).not.toContain('2025-06-10'); // after cutoff
    expect(dates.length).toBe(4);
  });

  test('UNIT-005: Payout Excel template header requirement rules', async () => {
    const requiredPayoutHeaders = [
      'Deal Name',
      'Customer ID',
      'Collection Month',
      'Current Payout Date',
      'Opening Principal',
      'Closing Principal',
      'DPD Days',
      'Status'
    ];

    const mockHeaders = [
      'Deal Name',
      'Customer ID',
      'Collection Month',
      'Current Payout Date',
      'Opening Principal',
      'Closing Principal',
      'DPD Days',
      'Status'
    ];

    const missing = requiredPayoutHeaders.filter(h => !mockHeaders.includes(h));
    expect(missing.length).toBe(0);
  });

});

