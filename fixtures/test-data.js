const path = require('path');
const fs = require('fs');

const TEST_DATA_DIR = path.resolve(__dirname, '../UBI-136');
const RESULT_DIR = path.resolve(__dirname, '../results/originator');

// Ensure result subdirectories exist
const DIRS = [
  '01-dashboard',
  '02-deal-creation',
  '03-lan-validation',
  '04-deal-settings',
  '05-duplicate-handling',
  '06-security-exploits',
  '07-payout-monitoring',
  '08-e2e-complete'
];

DIRS.forEach(sub => {
  fs.mkdirSync(path.join(RESULT_DIR, sub), { recursive: true });
});

module.exports = {
  BASE_URL: process.env.BASE_URL || 'http://localhost:5173',
  CREDENTIALS: {
    originator: {
      email: process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com',
      password: process.env.ORIGINATOR_PASSWORD || 'test@ori1'
    },
    investor: {
      email: process.env.INVESTOR_EMAIL || 'test_invest@gmail.com',
      password: process.env.INVESTOR_PASSWORD || 'test@invest'
    }
  },
  PATHS: {
    RESULT_DIR,
    TEST_DATA_DIR,
    LAN_FILE: path.join(TEST_DATA_DIR, 'LAN_INFO UBI 136.xlsx'),
    PAYOUT_FILES: [
      path.join(TEST_DATA_DIR, 'Aug-25.xlsx'),
      path.join(TEST_DATA_DIR, 'Dec-25.xlsx'),
      path.join(TEST_DATA_DIR, 'Feb-26.xlsx'),
      path.join(TEST_DATA_DIR, 'IIFL_136_UBI-Apr-25.xlsx'),
    ],
    ALL_PAYOUT_FILES: [
      path.join(TEST_DATA_DIR, 'May-25.xlsx'),
      path.join(TEST_DATA_DIR, 'Jun-25.xlsx'),
      path.join(TEST_DATA_DIR, 'Jul-25.xlsx'),
      path.join(TEST_DATA_DIR, 'Aug-25.xlsx'),
      path.join(TEST_DATA_DIR, 'Sep-25.xlsx'),
      path.join(TEST_DATA_DIR, 'Oct-25.xlsx'),
      path.join(TEST_DATA_DIR, 'Nov-25.xlsx'),
      path.join(TEST_DATA_DIR, 'Dec-25.xlsx'),
      path.join(TEST_DATA_DIR, 'Jan-26.xlsx'),
      path.join(TEST_DATA_DIR, 'Feb-26.xlsx'),
      path.join(TEST_DATA_DIR, 'Mar-26.xlsx'),
      path.join(TEST_DATA_DIR, 'IIFL_136_UBI-Apr-25.xlsx'),
    ]
  },
  DEAL_DEFAULTS: {
    baseDealName: 'UBI-136',
    generateUniqueDealName: (prefix = 'UBI-136') => `${prefix}_${Date.now()}`,
    poolValue: '20000000',
    investorSearch: 'test_invest',
    investorOptionText: 'test_invest first',
    dateOfDisbursement: '2025-03-15',
    payoutDay: '10',
    assignorShare: '70',
    assigneeShare: '30',
    benchmarkType: 'RBLR',
  }
};

