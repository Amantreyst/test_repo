module.exports = {
  XSS_PAYLOADS: [
    "<script>alert('XSS-DEAL')</script>",
    "Deal<img src=x onerror=alert('XSS')>",
    "javascript:/*--></title></style></textarea></em></script><svg/onload='+/\"/+/onmouseover=1/+/[*/[]/+alert(1)//'>"
  ],
  SQLI_PAYLOADS: [
    "' OR '1'='1",
    "UBI-136' UNION SELECT null, null, null--",
    "admin'--"
  ],
  BOUNDARY_POOL_VALUES: [
    { value: '-50000', label: 'Negative Pool Value', expectedError: 'Invalid Pool Value' },
    { value: '0', label: 'Zero Pool Value', expectedError: 'Invalid Pool Value' },
    { value: '500000', label: 'Below 10 Lakhs (5L)', expectedError: 'more than ₹10 Lakh' },
    { value: '999999999999999999', label: 'Astronomical / Overflow Pool Value', expectedError: null },
    { value: 'abc!@#$', label: 'Alphanumeric Injection in Pool Value', expectedError: 'required' }
  ],
  INVALID_FILES: [
    { name: 'malicious.exe', content: 'MZThisIsFakeExecutable', mime: 'application/x-msdownload' },
    { name: 'script.js', content: 'console.log("hacked");', mime: 'text/javascript' },
    { name: 'corrupt.xlsx', content: 'NOT_A_VALID_ZIP_OR_EXCEL_STREAM', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  ]
};

