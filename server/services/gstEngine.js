// GST Calculation Engine & Indian Currency Formatter

const INDIAN_STATES = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' }
];

function getStateByCode(code) {
  return INDIAN_STATES.find(s => s.code === code) || null;
}

function getStateByName(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  return INDIAN_STATES.find(s => s.name.toLowerCase() === clean) || null;
}

/**
 * Calculate single line item GST breakdown
 */
function calculateItemTaxes({
  rate,
  quantity,
  discountType = 'flat',
  discountValue = 0,
  gstRate = 5.0,
  isTaxInclusive = false,
  isInterState = false
}) {
  const qty = parseFloat(quantity) || 0;
  const unitRate = parseFloat(rate) || 0;
  const rawSubtotal = Math.round(qty * unitRate * 100) / 100;
  const discVal = parseFloat(discountValue) || 0;

  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = Math.round((rawSubtotal * (discVal / 100)) * 100) / 100;
  } else {
    discountAmount = Math.min(rawSubtotal, Math.round(discVal * 100) / 100);
  }

  const netAfterItemDiscount = Math.max(0, Math.round((rawSubtotal - discountAmount) * 100) / 100);

  let taxableAmount = 0;
  let totalTax = 0;
  let finalAmount = 0;

  const taxPercent = parseFloat(gstRate) || 0;

  if (isTaxInclusive) {
    // Tax is already included in the price
    finalAmount = netAfterItemDiscount;
    taxableAmount = Math.round((netAfterItemDiscount / (1 + taxPercent / 100)) * 100) / 100;
    totalTax = Math.round((finalAmount - taxableAmount) * 100) / 100;
  } else {
    // Tax is added on top of taxable amount
    taxableAmount = netAfterItemDiscount;
    totalTax = Math.round((taxableAmount * (taxPercent / 100)) * 100) / 100;
    finalAmount = Math.round((taxableAmount + totalTax) * 100) / 100;
  }

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (isInterState) {
    igstRate = taxPercent;
    igstAmount = totalTax;
  } else {
    cgstRate = Math.round((taxPercent / 2) * 100) / 100;
    sgstRate = cgstRate;
    cgstAmount = Math.round((totalTax / 2) * 100) / 100;
    sgstAmount = Math.round((totalTax - cgstAmount) * 100) / 100;
  }

  return {
    rawSubtotal,
    discountAmount,
    taxableAmount,
    gstRate: taxPercent,
    isInterState,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    totalTax,
    finalAmount
  };
}

/**
 * Calculate complete invoice total with overall bill discount and round off
 */
function calculateInvoiceTotals({
  items = [],
  billDiscountType = 'flat',
  billDiscountValue = 0,
  isInterState = false,
  amountPaid = 0
}) {
  let subtotalRaw = 0;
  let totalProductDiscount = 0;
  let totalTaxableAmount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalTaxAmount = 0;

  const processedItems = items.map(item => {
    const calc = calculateItemTaxes({
      rate: item.rate,
      quantity: item.quantity,
      discountType: item.discount_type || 'flat',
      discountValue: item.discount_value || 0,
      gstRate: item.gst_rate,
      isTaxInclusive: !!item.is_tax_inclusive,
      isInterState
    });

    subtotalRaw += calc.rawSubtotal;
    totalProductDiscount += calc.discountAmount;
    totalTaxableAmount += calc.taxableAmount;
    totalCgst += calc.cgstAmount;
    totalSgst += calc.sgstAmount;
    totalIgst += calc.igstAmount;
    totalTaxAmount += calc.totalTax;

    return {
      ...item,
      ...calc
    };
  });

  subtotalRaw = Math.round(subtotalRaw * 100) / 100;
  totalProductDiscount = Math.round(totalProductDiscount * 100) / 100;
  totalTaxableAmount = Math.round(totalTaxableAmount * 100) / 100;
  totalCgst = Math.round(totalCgst * 100) / 100;
  totalSgst = Math.round(totalSgst * 100) / 100;
  totalIgst = Math.round(totalIgst * 100) / 100;
  totalTaxAmount = Math.round(totalTaxAmount * 100) / 100;

  // Calculate bill-level additional discount
  let totalBillDiscount = 0;
  const billDiscVal = parseFloat(billDiscountValue) || 0;
  if (billDiscountType === 'percent') {
    totalBillDiscount = Math.round((totalTaxableAmount * (billDiscVal / 100)) * 100) / 100;
  } else {
    totalBillDiscount = Math.min(totalTaxableAmount, Math.round(billDiscVal * 100) / 100);
  }

  const unroundedTotal = Math.max(0, totalTaxableAmount + totalTaxAmount - totalBillDiscount);
  const grandTotal = Math.round(unroundedTotal);
  const roundOff = Math.round((grandTotal - unroundedTotal) * 100) / 100;

  const paid = parseFloat(amountPaid) || 0;
  const balanceDue = Math.max(0, Math.round((grandTotal - paid) * 100) / 100);

  let paymentStatus = 'unpaid';
  if (paid >= grandTotal && grandTotal > 0) {
    paymentStatus = 'paid';
  } else if (paid > 0 && paid < grandTotal) {
    paymentStatus = 'partial';
  }

  return {
    processedItems,
    subtotalRaw,
    totalProductDiscount,
    billDiscountType,
    billDiscountValue: billDiscVal,
    totalBillDiscount,
    totalTaxableAmount,
    totalCgst,
    totalSgst,
    totalIgst,
    totalTaxAmount,
    roundOff,
    grandTotal,
    amountPaid: paid,
    balanceDue,
    paymentStatus
  };
}

/**
 * Convert number to Indian Currency words (Rupees & Paise)
 * E.g., 145250.50 -> One Lakh Forty-Five Thousand Two Hundred Fifty Rupees and Fifty Paise Only
 */
function numberToWordsINR(amount) {
  if (isNaN(amount) || amount === null || amount === undefined) return '';

  const num = Math.abs(parseFloat(amount));
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertGroup(n) {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + ones[n % 10] : '') + ' ';
    } else if (n > 0) {
      str += ones[n] + ' ';
    }
    return str.trim();
  }

  if (rupees === 0 && paise === 0) {
    return 'Zero Rupees Only';
  }

  let words = '';

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const remainder = Math.floor(rupees % 1000);

  if (crore > 0) {
    words += convertGroup(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertGroup(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertGroup(thousand) + ' Thousand ';
  }
  if (remainder > 0) {
    words += convertGroup(remainder) + ' ';
  }

  words = words.trim() + ' Rupees';

  if (paise > 0) {
    words += ' and ' + convertGroup(paise) + ' Paise';
  }

  return words + ' Only';
}

module.exports = {
  INDIAN_STATES,
  getStateByCode,
  getStateByName,
  calculateItemTaxes,
  calculateInvoiceTotals,
  numberToWordsINR
};

