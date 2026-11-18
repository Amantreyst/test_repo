const path = require('path');
const fs = require('fs');

const TEST_DATA_DIR = path.resolve(__dirname, '../test-data');

const POOL_FILE = path.join(TEST_DATA_DIR, 'pool-sample.xlsx');
const POOL_SMALL_AMOUNT_FILE = path.join(TEST_DATA_DIR, 'pool-small-amount.xlsx');
const POOL_MISSING_FIELDS_FILE = path.join(TEST_DATA_DIR, 'pool-missing-fields.xlsx');

const POOL_MONTHLY_FILES = [
  path.join(TEST_DATA_DIR, 'pool-jan-25.xlsx'),
  path.join(TEST_DATA_DIR, 'pool-feb-25.xlsx'),
  path.join(TEST_DATA_DIR, 'pool-mar-25.xlsx'),
];

async function verifyTestFiles() {
  const files = [POOL_FILE, ...POOL_MONTHLY_FILES];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.warn(`Test file not found: ${file}`);
    }
  }
}

module.exports = {
  POOL_FILE,
  POOL_SMALL_AMOUNT_FILE,
  POOL_MISSING_FIELDS_FILE,
  POOL_MONTHLY_FILES,
  TEST_DATA_DIR,
  verifyTestFiles
};