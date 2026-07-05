/* ==========================================================================
   AFFILIATE COMMISSION TRACKER - JAVASCRIPT LOGIC
   ========================================================================== */

// --- CONFIG & STATE ---
const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

let salesData = [];
let currentEditingId = null;
let periodPayoutsData = {};
let currentActiveViewTab = 'list';

// --- MOBILE TAB SWITCHER ---
window.switchTab = function(tab) {
  const panelForm = document.getElementById('panel-form');
  const panelTable = document.getElementById('panel-table');
  const btnForm = document.getElementById('tab-btn-form');
  const btnTable = document.getElementById('tab-btn-table');
  if (!panelForm || !panelTable) return;

  if (tab === 'form') {
    panelForm.classList.remove('panel-hidden');
    panelTable.classList.add('panel-hidden');
    if (btnForm) btnForm.classList.add('active');
    if (btnTable) btnTable.classList.remove('active');
  } else {
    panelTable.classList.remove('panel-hidden');
    panelForm.classList.add('panel-hidden');
    if (btnTable) btnTable.classList.add('active');
    if (btnForm) btnForm.classList.remove('active');
  }
};

// Apply initial mobile tab state
function initMobileTabs() {
  if (window.innerWidth <= 1100) {
    // On mobile, start with form visible, table hidden
    const panelTable = document.getElementById('panel-table');
    if (panelTable) panelTable.classList.add('panel-hidden');
  }
}

// Firebase Connection Instance
let db = null;
const firebaseConfig = {
  apiKey: "AIzaSyDFb8s6t383hZeeeFucsJXVTssxxT3YfhM",
  projectId: "affiliatediosg",
  databaseURL: "https://affiliatediosg-default-rtdb.asia-southeast1.firebasedatabase.app",
  appId: "1:108283928930:web:0c37674d4137ce6f364c3b",
  authDomain: "affiliatediosg.firebaseapp.com"
};

// ---- GOOGLE SHEETS WEBHOOK ----
// Paste URL web app Apps Script kamu di sini setelah deploy
// Contoh: 'https://script.google.com/macros/s/AKfycb.../exec'
const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyGPfRk84myluBPoodVGq_e60yf2wIx9qOrCPQ5xmrzIFY7aQbkIXJQCW1lk_tuCx0Q/exec';

// Kirim sinyal ke Apps Script supaya sheet langsung update
function triggerSheetsSync() {
  if (!SHEETS_WEBHOOK_URL) return;
  // fire-and-forget: tidak perlu tunggu response
  fetch(SHEETS_WEBHOOK_URL, { mode: 'no-cors' }).catch(() => {});
}


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  // Set default date input to today
  const today = new Date();
  document.getElementById('sale-date').value = today.toISOString().split('T')[0];

  // Initialize UI components and event listeners immediately
  initEventListeners();
  initMobileTabs();
  
  // Calculate and update metrics with empty/local data first
  updateDashboard();
  
  // Populate period filter options
  populatePeriodFilter();

  // Initial table render
  renderSalesTable();

  // Initialize Firebase and load data in the background
  try {
    const initialized = initializeFirebase(firebaseConfig);
    if (initialized) {
      loadSalesData().then(() => {
        // Refresh calculations and table after data is fetched from cloud
        updateDashboard();
        populatePeriodFilter();
        renderSalesTable();
        renderPayoutsTable();
      }).catch(err => {
        console.error("Gagal memuat data dari Firebase:", err);
      });
    }
  } catch (err) {
    console.error("Firebase startup error:", err);
  }
});

// --- DATABASE HANDLERS (FIREBASE ONLY) ---

function initializeFirebase(config) {
  try {
    if (typeof firebase === 'undefined') {
      console.error("Firebase SDK tidak terdeteksi. Silakan periksa koneksi internet Anda.");
      showToast("Gagal memuat Firebase. Menggunakan mode baca offline.", "error");
      return false;
    }
    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: config.apiKey,
        projectId: config.projectId,
        databaseURL: config.databaseURL,
        appId: config.appId,
        authDomain: config.authDomain
      });
    }
    db = firebase.database();
    return true;
  } catch (e) {
    console.error("Firebase Init Error:", e);
    showToast("Koneksi Firebase gagal. Cek koneksi internet Anda.", "error");
    return false;
  }
}

async function loadSalesData() {
  if (!db) return;
  try {
    const snapshot = await db.ref('sales_transactions').once('value');
    salesData = [];
    const val = snapshot.val();
    if (val) {
      Object.keys(val).forEach(key => {
        const data = val[key];
        const normalPrice = Number(data.normalPrice || data.price || 0);
        const dealPrice = Number(data.dealPrice || data.price || 0);
        salesData.push({
          id: key,
          date: data.date,
          product: data.product,
          normalPrice: normalPrice,
          dealPrice: dealPrice,
          price: normalPrice, // backward compat
          coupon: data.coupon,
          commissionRate: Number(data.commissionRate),
          commissionAmount: Number(data.commissionAmount),
          description: data.description || '',
          period: data.period || getPeriodLabel(data.date)
        });
      });
    }

    // Load period payouts as well
    const payoutSnapshot = await db.ref('period_payouts').once('value');
    periodPayoutsData = payoutSnapshot.val() || {};
  } catch (e) {
    console.error("Realtime DB Fetch Error:", e);
    showToast("Gagal memuat data dari Cloud Firebase.", "error");
    salesData = [];
    periodPayoutsData = {};
  }
}

async function saveSaleRecord(sale) {
  if (!db) return;
  try {
    await db.ref(`sales_transactions/${sale.id}`).set(sale);
    triggerSheetsSync(); // update Google Sheet
  } catch (e) {
    console.error("Realtime DB Save Error:", e);
    showToast("Gagal menyimpan ke Cloud Firebase.", "error");
  }
}

async function deleteSaleRecord(id) {
  if (!db) return;
  try {
    await db.ref(`sales_transactions/${id}`).remove();
    triggerSheetsSync(); // update Google Sheet
  } catch (e) {
    console.error("Realtime DB Delete Error:", e);
    showToast("Gagal menghapus dari Cloud Firebase.", "error");
  }
}

// --- EVENT LISTENERS ---
function initEventListeners() {
  const form = document.getElementById('sale-form');
  const priceInput = document.getElementById('sale-price');
  const couponRadios = document.getElementsByName('sale-coupon');
  const customRateGroup = document.getElementById('custom-commission-group');
  const customRateInput = document.getElementById('custom-commission-rate');
  const resetFormBtn = document.getElementById('btn-reset-form');
  const searchInput = document.getElementById('search-input');
  const periodFilter = document.getElementById('period-filter');
  
  // Toolbar Buttons
  const exportCsvBtn = document.getElementById('btn-export-csv');
  const backupMenuBtn = document.getElementById('btn-backup-menu');
  const backupDropdown = document.getElementById('backup-dropdown');
  const backupExportBtn = document.getElementById('btn-backup-export');
  const backupImportBtn = document.getElementById('btn-backup-import');
  const fileImportInput = document.getElementById('file-import');
  const resetDataBtn = document.getElementById('btn-reset-data');

  // Price formatting input handler
  priceInput.addEventListener('input', (e) => {
    // Save cursor position
    let cursorPosition = e.target.selectionStart;
    let originalLen = e.target.value.length;
    
    let numericVal = getRawNumber(e.target.value);
    
    if (isNaN(numericVal)) {
      e.target.value = '';
      updatePreview();
      return;
    }
    
    e.target.value = formatNumberRupiah(numericVal);
    
    // Adjust cursor position
    let newLen = e.target.value.length;
    cursorPosition = cursorPosition + (newLen - originalLen);
    e.target.setSelectionRange(cursorPosition, cursorPosition);
    
    updatePreview();
  });

  // Coupon radio change handler
  couponRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        customRateGroup.classList.remove('hidden');
      } else {
        customRateGroup.classList.add('hidden');
        customRateInput.removeAttribute('required');
        customRateInput.value = '';
        // Clear custom discount too
        document.getElementById('custom-discount-rate').value = '';
      }
      updatePreview();
    });
  });

  // Custom rate input change handler
  customRateInput.addEventListener('input', updatePreview);

  // Custom discount input change handler
  const customDiscountInput = document.getElementById('custom-discount-rate');
  customDiscountInput.addEventListener('input', updatePreview);

  // Form Submission
  form.addEventListener('submit', handleFormSubmit);

  // Reset form / Cancel Edit
  resetFormBtn.addEventListener('click', cancelFormEdit);

  // Search input handler (live search)
  searchInput.addEventListener('input', () => {
    renderSalesTable();
    renderPayoutsTable();
  });

  // Period filter change handler
  periodFilter.addEventListener('change', () => {
    renderSalesTable();
    renderPayoutsTable();
  });

  // Product filter change handler
  const productFilter = document.getElementById('product-filter');
  productFilter.addEventListener('change', () => {
    renderSalesTable();
    renderPayoutsTable();
  });

  // Export to CSV
  exportCsvBtn.addEventListener('click', exportToCSV);

  // Backup Menu Dropdown Toggle
  backupMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    backupDropdown.classList.toggle('show');
  });

  // Close dropdown menu when clicking outside
  document.addEventListener('click', () => {
    backupDropdown.classList.remove('show');
  });

  // Export backup JSON
  backupExportBtn.addEventListener('click', exportBackupJSON);

  // Trigger import file click
  backupImportBtn.addEventListener('click', () => {
    fileImportInput.click();
  });

  // Handle JSON file import
  fileImportInput.addEventListener('change', handleJSONImport);

  // Reset current period data button
  resetDataBtn.addEventListener('click', triggerResetPeriodData);

  // Product select change handler to lock coupon if needed
  const productSelect = document.getElementById('sale-product');
  productSelect.addEventListener('change', () => {
    handleProductSelection();
    updatePreview();
  });

  // Payout manual inputs
  const inputDiosg = document.getElementById('payout-input-diosg');
  const inputAldi = document.getElementById('payout-input-aldi');
  const inputJoko = document.getElementById('payout-input-joko');

  const handlePayoutInput = (el, person) => {
    if (!el) return;
    el.addEventListener('input', (e) => {
      let rawVal = getRawNumber(e.target.value);
      e.target.value = rawVal > 0 ? formatNumberRupiah(rawVal) : '';
      
      const periodFilter = document.getElementById('period-filter').value;
      const activePeriod = getActivePeriodLabel();
      const targetPeriod = periodFilter === 'current' ? activePeriod : periodFilter;

      if (targetPeriod === 'all') return;

      if (!periodPayoutsData[targetPeriod]) {
        periodPayoutsData[targetPeriod] = { diosgPaid: 0, aldiPaid: 0, jokoPaid: 0 };
      }
      
      if (person === 'diosg') periodPayoutsData[targetPeriod].diosgPaid = rawVal;
      else if (person === 'aldi') periodPayoutsData[targetPeriod].aldiPaid = rawVal;
      else if (person === 'joko') periodPayoutsData[targetPeriod].jokoPaid = rawVal;

      renderPayoutsTable();
    });

    el.addEventListener('change', async (e) => {
      const periodFilter = document.getElementById('period-filter').value;
      const activePeriod = getActivePeriodLabel();
      const targetPeriod = periodFilter === 'current' ? activePeriod : periodFilter;
      
      if (targetPeriod === 'all') return;
      
      const info = periodPayoutsData[targetPeriod] || { diosgPaid: 0, aldiPaid: 0, jokoPaid: 0 };
      await savePayoutRecord(targetPeriod, Number(info.diosgPaid), Number(info.aldiPaid), Number(info.jokoPaid));
    });
  };

  handlePayoutInput(inputDiosg, 'diosg');
  handlePayoutInput(inputAldi, 'aldi');
  handlePayoutInput(inputJoko, 'joko');
}

// --- UTILITY FUNCTIONS ---

// Extract raw numbers from a Rupiah formatted string (e.g. "1.500.000" -> 1500000)
function getRawNumber(formattedStr) {
  if (!formattedStr) return 0;
  return parseInt(formattedStr.replace(/[^0-9]/g, ''), 10);
}

// Format numbers with thousand separators (e.g. 1500000 -> "1.500.000")
function formatNumberRupiah(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Full rupiah display (e.g. 1500000 -> "Rp 1.500.000")
function formatFullRupiah(num) {
  return 'Rp ' + formatNumberRupiah(num);
}

// Get the commission rate percentage based on coupon
function getSelectedCommissionRate() {
  const productSelect = document.getElementById('sale-product');
  if (productSelect) {
    const product = productSelect.value;
    if (product === 'FAST TRACK AKADEMI CREATOR' || product === 'FAST TRACK AKADEMI MARKETER') {
      return 10;
    }
  }

  const couponRadios = document.getElementsByName('sale-coupon');
  let selectedValue = '0';
  
  for (let radio of couponRadios) {
    if (radio.checked) {
      selectedValue = radio.value;
      break;
    }
  }

  if (selectedValue === 'custom') {
    const customInput = document.getElementById('custom-commission-rate');
    const customVal = parseFloat(customInput.value);
    // If blank, fallback to 20%
    return isNaN(customVal) ? 20 : customVal;
  }

  // Business Rules:
  // Kupon 0% (Tanpa Kupon) -> Komisi 20%
  // Kupon 5% -> Komisi 20%
  // Kupon 10% -> Komisi 15%
  // Kupon 15%, 20%, 25% -> Komisi 10%
  const ruleMap = {
    '0': 20,
    '5': 20,
    '10': 15,
    '15': 10,
    '20': 10,
    '25': 10
  };

  return ruleMap[selectedValue] || 10;
}

// Handle product selection to disable/enable coupon radios
function handleProductSelection() {
  const product = document.getElementById('sale-product').value;
  const couponRadios = document.getElementsByName('sale-coupon');
  const customRateGroup = document.getElementById('custom-commission-group');
  
  const isFastTrack = product === 'FAST TRACK AKADEMI CREATOR' || product === 'FAST TRACK AKADEMI MARKETER';
  
  if (isFastTrack) {
    // Force coupon to '0' (Tanpa Kupon)
    couponRadios.forEach(radio => {
      if (radio.value === '0') {
        radio.checked = true;
      }
      // Disable other choices
      radio.disabled = radio.value !== '0';
    });
    // Hide and clear custom group
    customRateGroup.classList.add('hidden');
    document.getElementById('custom-commission-rate').value = '';
    document.getElementById('custom-discount-rate').value = '';
  } else {
    // Enable all coupon choices
    couponRadios.forEach(radio => {
      radio.disabled = false;
    });
  }
}

// Get Coupon Display Text
function getCouponText(couponVal) {
  if (couponVal === 'custom') {
    return 'Kustom';
  }
  return `Kupon ${couponVal}%`;
}

// Update the commission previews dynamically on the form
function updatePreview() {
  const priceInput = document.getElementById('sale-price');
  const dealPriceInput = document.getElementById('sale-deal-price');
  const previewNormalPrice = document.getElementById('preview-normal-price');
  const previewDealPrice = document.getElementById('preview-deal-price');
  const previewRate = document.getElementById('preview-rate');
  const previewAmount = document.getElementById('preview-amount');

  const normalPrice = getRawNumber(priceInput.value);

  // Get selected coupon %
  const couponRadios = document.getElementsByName('sale-coupon');
  let couponVal = '0';
  for (let radio of couponRadios) {
    if (radio.checked) { couponVal = radio.value; break; }
  }

  // Harga Deal = Harga Normal × (1 - diskon%)
  let couponDiscount = 0;
  if (couponVal === 'custom') {
    // Read custom discount field (optional)
    const customDiscountVal = parseFloat(document.getElementById('custom-discount-rate').value);
    couponDiscount = isNaN(customDiscountVal) ? 0 : customDiscountVal;
  } else if (couponVal !== 'custom') {
    couponDiscount = parseFloat(couponVal) || 0;
  }
  const dealPrice = Math.round(normalPrice * (1 - couponDiscount / 100));

  // Commission rate based on coupon
  const ratePct = getSelectedCommissionRate();

  // Komisi = Harga Deal × rate komisi%
  const commission = Math.round(dealPrice * (ratePct / 100));

  // Update form read-only field
  dealPriceInput.value = dealPrice > 0 ? formatNumberRupiah(dealPrice) : '';

  // Update preview card
  previewNormalPrice.textContent = formatFullRupiah(normalPrice);
  previewDealPrice.textContent = formatFullRupiah(dealPrice);
  previewRate.textContent = `${ratePct}%`;
  previewAmount.textContent = formatFullRupiah(commission);
}

// Calculate the monthly period label based on 25th cut-off logic
// Period cycle: 26th of month X-1 to 25th of month X.
function getPeriodLabel(dateStr) {
  if (!dateStr) return '';
  
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  let startYear, startMonth, endYear, endMonth;

  if (day <= 25) {
    // Belonging to previous-month-26th to current-month-25th
    endYear = year;
    endMonth = month;

    // Calculate start month
    if (month === 0) {
      startMonth = 11;
      startYear = year - 1;
    } else {
      startMonth = month - 1;
      startYear = year;
    }
  } else {
    // Belonging to current-month-26th to next-month-25th
    startYear = year;
    startMonth = month;

    // Calculate end month
    if (month === 11) {
      endMonth = 0;
      endYear = year + 1;
    } else {
      endMonth = month + 1;
      endYear = year;
    }
  }

  const startMonthName = MONTH_NAMES_ID[startMonth].substring(0, 3);
  const endMonthName = MONTH_NAMES_ID[endMonth].substring(0, 3);

  return `26 ${startMonthName} ${startYear} - 25 ${endMonthName} ${endYear}`;
}

// Returns the Active Period (today's active monthly cycle)
function getActivePeriodLabel() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-12
  const day = today.getDate();
  
  const paddedMonth = month < 10 ? '0' + month : month;
  const paddedDay = day < 10 ? '0' + day : day;
  
  return getPeriodLabel(`${year}-${paddedMonth}-${paddedDay}`);
}

// Helper to format table dates (e.g. "2026-06-24" -> "24 Jun 2026")
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parts[0];
  const monthName = MONTH_NAMES_ID[month] ? MONTH_NAMES_ID[month].substring(0, 3) : '';
  return `${day} ${monthName} ${year}`;
}

// Calculate days remaining until the next 25th of the month
function updateCountdown() {
  const countdownEl = document.getElementById('stat-countdown');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let targetYear = today.getFullYear();
  let targetMonth = today.getMonth(); // 0-11
  let targetDay = 25;
  
  // If today is past the 25th, the target is next month's 25th
  if (today.getDate() > 25) {
    if (targetMonth === 11) {
      targetMonth = 0;
      targetYear += 1;
    } else {
      targetMonth += 1;
    }
  }
  
  const targetDate = new Date(targetYear, targetMonth, targetDay);
  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    countdownEl.textContent = "Hari ini Cut-Off!";
    countdownEl.className = "metric-value text-amber pulse-indicator-text";
  } else {
    countdownEl.textContent = `${diffDays} Hari`;
    countdownEl.className = "metric-value text-amber";
  }
}

// Show Alert Toast Message
function showToast(message, type = "success") {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// --- CORE DASHBOARD LOGIC ---

// Recalculate metrics cards and refresh table list
function updateDashboard() {
  const activePeriod = getActivePeriodLabel();
  
  // Update Header Active Period badge
  document.getElementById('header-period-text').textContent = `Periode Aktif: ${activePeriod}`;
  document.getElementById('stat-period-date-range').textContent = activePeriod;
  
  // Update Reset Countdown
  updateCountdown();

  // Compute Metrics
  let currentPeriodCommission = 0;
  let currentPeriodSalesCount = 0;
  let allTimeCommission = 0;
  let allTimeSalesCount = salesData.length;

  salesData.forEach(sale => {
    allTimeCommission += sale.commissionAmount;
    
    // Check if within current active period
    if (sale.period === activePeriod) {
      currentPeriodCommission += sale.commissionAmount;
      currentPeriodSalesCount++;
    }
  });

  // Write values to DOM
  document.getElementById('stat-current-commission').textContent = formatFullRupiah(currentPeriodCommission);
  document.getElementById('stat-sales-count').textContent = currentPeriodSalesCount;
  document.getElementById('stat-all-time-commission').textContent = formatFullRupiah(allTimeCommission);
  document.getElementById('stat-all-time-count').textContent = `Dari ${allTimeSalesCount} total penjualan`;

  // Splits for current period
  const currentDeduction = Math.round(currentPeriodCommission * 0.207);
  const currentNet = currentPeriodCommission - currentDeduction;
  const currentDiosg = Math.round(currentNet * 0.60);
  const currentAldi = Math.round(currentNet * 0.20);
  const currentJoko = Math.round(currentNet * 0.20);

  document.getElementById('stat-current-deduction').textContent = `-Rp ${formatNumberRupiah(currentDeduction)}`;
  document.getElementById('stat-current-net').textContent = formatFullRupiah(currentNet);
  document.getElementById('stat-current-diosg').textContent = formatFullRupiah(currentDiosg);
  document.getElementById('stat-current-aldi').textContent = formatFullRupiah(currentAldi);
  document.getElementById('stat-current-joko').textContent = formatFullRupiah(currentJoko);

  // Splits for all-time
  const allTimeDeduction = Math.round(allTimeCommission * 0.207);
  const allTimeNet = allTimeCommission - allTimeDeduction;
  const allTimeDiosg = Math.round(allTimeNet * 0.60);
  const allTimeAldi = Math.round(allTimeNet * 0.20);
  const allTimeJoko = Math.round(allTimeNet * 0.20);

  document.getElementById('stat-alltime-deduction').textContent = `-Rp ${formatNumberRupiah(allTimeDeduction)}`;
  document.getElementById('stat-alltime-net').textContent = formatFullRupiah(allTimeNet);
  document.getElementById('stat-alltime-diosg').textContent = formatFullRupiah(allTimeDiosg);
  document.getElementById('stat-alltime-aldi').textContent = formatFullRupiah(allTimeAldi);
  document.getElementById('stat-alltime-joko').textContent = formatFullRupiah(allTimeJoko);
}

// Populate period options in the filtering dropdown
function populatePeriodFilter() {
  const filterDropdown = document.getElementById('period-filter');
  const activePeriod = getActivePeriodLabel();
  
  // Get all unique periods in data
  const uniquePeriods = new Set();
  salesData.forEach(sale => {
    if (sale.period) uniquePeriods.add(sale.period);
  });
  
  // Always ensure the active period is in the set
  uniquePeriods.add(activePeriod);
  
  // Sort periods (newest first based on dates in label)
  const sortedPeriods = Array.from(uniquePeriods).sort((a, b) => {
    // Quick comparison: extract the start year and start month
    const getSortKey = (label) => {
      try {
        const matches = label.match(/26\s([A-Za-z]+)\s(\d{4})/);
        if (matches && matches.length === 3) {
          const monthStr = matches[1];
          const year = parseInt(matches[2], 10);
          const monthIndex = MONTH_NAMES_ID.findIndex(m => m.toLowerCase().startsWith(monthStr.toLowerCase()));
          return year * 100 + monthIndex;
        }
      } catch (e) {}
      return 0;
    };
    return getSortKey(b) - getSortKey(a); // Descending
  });

  // Preserve current value if possible
  const prevSelectedValue = filterDropdown.value || 'current';

  // Clear existing options except default ones
  filterDropdown.innerHTML = '';
  
  // Option 1: Current Period
  const activeOpt = document.createElement('option');
  activeOpt.value = 'current';
  activeOpt.textContent = `Periode Aktif Ini (${activePeriod.split(' - ')[0]}...)`;
  filterDropdown.appendChild(activeOpt);
  
  // Populate dynamically sorted list of periods
  sortedPeriods.forEach(period => {
    const opt = document.createElement('option');
    opt.value = period;
    opt.textContent = period === activePeriod ? `${period} (Aktif)` : period;
    filterDropdown.appendChild(opt);
  });

  // Option All Periods
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'Semua Periode';
  filterDropdown.appendChild(allOpt);

  // Restore selection
  filterDropdown.value = prevSelectedValue;
}

// Render the transactional sales table based on filters
function renderSalesTable() {
  const tbody = document.getElementById('sales-tbody');
  const searchInput = document.getElementById('search-input').value.toLowerCase();
  const periodFilter = document.getElementById('period-filter').value;
  const activePeriod = getActivePeriodLabel();

  // Summary fields
  const subtotalPriceEl = document.getElementById('table-summary-total-price');
  const subtotalCommEl = document.getElementById('table-summary-total-commission');
  
  const productFilter = document.getElementById('product-filter').value;

  let filteredSales = salesData;

  // 1. Period Filtering
  if (periodFilter === 'current') {
    filteredSales = filteredSales.filter(sale => sale.period === activePeriod);
  } else if (periodFilter !== 'all') {
    filteredSales = filteredSales.filter(sale => sale.period === periodFilter);
  }

  // 1b. Product Filtering
  if (productFilter !== 'all') {
    filteredSales = filteredSales.filter(sale => sale.product === productFilter);
  }

  // 2. Search Text Filtering
  if (searchInput) {
    filteredSales = filteredSales.filter(sale => {
      const formattedPrice = formatNumberRupiah(sale.price);
      const formattedComm = formatNumberRupiah(sale.commissionAmount);
      const displayDate = formatDisplayDate(sale.date);
      
      return (
        sale.product.toLowerCase().includes(searchInput) ||
        sale.description.toLowerCase().includes(searchInput) ||
        getCouponText(sale.coupon).toLowerCase().includes(searchInput) ||
        formattedPrice.includes(searchInput) ||
        formattedComm.includes(searchInput) ||
        displayDate.toLowerCase().includes(searchInput)
      );
    });
  }

  // Clear rows
  tbody.innerHTML = '';

  // Calculate subtotals
  let subtotalPrice = 0;
  let subtotalCommission = 0;

  if (filteredSales.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="7">
          <div class="empty-state-content">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <p>Tidak ada transaksi yang cocok dengan pencarian.</p>
            <small>Coba gunakan kata kunci lain atau ubah filter periode.</small>
          </div>
        </td>
      </tr>
    `;
  } else {
    // Sort transactions by date descending, then ID descending
    filteredSales.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return b.id.localeCompare(a.id);
    });

    filteredSales.forEach(sale => {
      subtotalPrice += (sale.normalPrice || sale.price);
      subtotalCommission += sale.commissionAmount;

      const row = document.createElement('tr');
      row.id = `row-${sale.id}`;

      let couponBadgeClass = 'table-coupon-badge';
      if (sale.coupon === '5') couponBadgeClass += ' pct-5';
      else if (sale.coupon === '10') couponBadgeClass += ' pct-10';

      const normalPrice = sale.normalPrice || sale.price;
      const dealPrice = sale.dealPrice || sale.price;

      row.innerHTML = `
        <td class="table-date">${formatDisplayDate(sale.date)}</td>
        <td>
          <div class="table-product">${escapeHTML(sale.product)}</div>
        </td>
        <td style="text-align: right;" class="table-price">${formatNumberRupiah(normalPrice)}</td>
        <td style="text-align: right; color: var(--amber);">${formatNumberRupiah(dealPrice)}</td>
        <td style="text-align: center;">
          <div class="${couponBadgeClass}">${escapeHTML(getCouponText(sale.coupon))}</div>
          <div style="font-size: 10px; color: var(--text-muted-dark); font-weight:600; margin-top:2px;">Rate: ${sale.commissionRate}%</div>
        </td>
        <td style="text-align: right;" class="table-commission">${formatNumberRupiah(sale.commissionAmount)}</td>
        <td>
          <div class="table-description" title="${escapeHTML(sale.description)}">${escapeHTML(sale.description)}</div>
        </td>
        <td>
          <div class="action-buttons">
            <button class="btn-action edit" onclick="editSale('${sale.id}')" title="Edit Transaksi">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button class="btn-action delete" onclick="deleteSale('${sale.id}')" title="Hapus Transaksi">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(row);
    });
  }

  // Update table subtotals
  subtotalPriceEl.textContent = formatFullRupiah(subtotalPrice);
  subtotalCommEl.textContent = formatFullRupiah(subtotalCommission);

  // Calculate splits for the selected period
  const deduction = Math.round(subtotalCommission * 0.207);
  const netCommission = subtotalCommission - deduction;
  const diosgShare = Math.round(netCommission * 0.60);
  const aldiShare = Math.round(netCommission * 0.20);
  const jokoShare = Math.round(netCommission * 0.20);

  document.getElementById('table-summary-deduction').textContent = `-Rp ${formatNumberRupiah(deduction)}`;
  document.getElementById('table-summary-net').textContent = formatFullRupiah(netCommission);
  document.getElementById('table-summary-diosg').textContent = formatFullRupiah(diosgShare);
  document.getElementById('table-summary-aldi').textContent = formatFullRupiah(aldiShare);
  document.getElementById('table-summary-joko').textContent = formatFullRupiah(jokoShare);
}

// Simple HTML escaping helper
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// --- FORM HANDLING ACTIONS ---

// Submit handler to save new sale or update existing
async function handleFormSubmit(e) {
  e.preventDefault();

  const editIdEl = document.getElementById('edit-id');
  const dateInput = document.getElementById('sale-date').value;
  const productSelect = document.getElementById('sale-product').value;
  const priceInput = document.getElementById('sale-price').value;
  const descInput = document.getElementById('sale-description').value;

  const normalPrice = getRawNumber(priceInput);
  if (normalPrice <= 0) {
    showToast("Harga normal produk harus lebih dari Rp 0", "error");
    return;
  }

  // Read selected coupon value
  const couponRadios = document.getElementsByName('sale-coupon');
  let couponVal = '0';
  for (let radio of couponRadios) {
    if (radio.checked) {
      couponVal = radio.value;
      break;
    }
  }

  // Harga Deal = Harga Normal × (1 - diskon%)
  let couponDiscount = 0;
  if (couponVal === 'custom') {
    const customDiscountVal = parseFloat(document.getElementById('custom-discount-rate').value);
    couponDiscount = isNaN(customDiscountVal) ? 0 : customDiscountVal;
  } else {
    couponDiscount = parseFloat(couponVal) || 0;
  }
  const dealPrice = Math.round(normalPrice * (1 - couponDiscount / 100));

  const rate = getSelectedCommissionRate();
  // Komisi = Harga Deal × rate komisi%
  const commission = Math.round(dealPrice * (rate / 100));
  const period = getPeriodLabel(dateInput);

  const isEdit = editIdEl.value !== '';

  if (isEdit) {
    const index = salesData.findIndex(item => item.id === editIdEl.value);
    if (index !== -1) {
      salesData[index].date = dateInput;
      salesData[index].product = productSelect;
      salesData[index].normalPrice = normalPrice;
      salesData[index].dealPrice = dealPrice;
      salesData[index].price = normalPrice;
      salesData[index].coupon = couponVal;
      salesData[index].commissionRate = rate;
      salesData[index].commissionAmount = commission;
      salesData[index].description = descInput;
      salesData[index].period = period;
      
      await saveSaleRecord(salesData[index]);
      showToast("Data penjualan berhasil diperbarui!");
    } else {
      showToast("Gagal memperbarui data. ID tidak ditemukan.", "error");
    }
  } else {
    const newSale = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      date: dateInput,
      product: productSelect,
      normalPrice: normalPrice,
      dealPrice: dealPrice,
      price: normalPrice,
      coupon: couponVal,
      commissionRate: rate,
      commissionAmount: commission,
      description: descInput,
      period: period
    };
    
    salesData.push(newSale);
    await saveSaleRecord(newSale);
    showToast("Data penjualan baru berhasil disimpan!");
  }

  cancelFormEdit();
  updateDashboard();
  populatePeriodFilter();
  renderSalesTable();
  renderPayoutsTable();
  // On mobile: switch to table tab after saving
  if (window.innerWidth <= 1100) {
    switchTab('table');
  }
}

// Edit a sale entry - Populate form with item details
window.editSale = function(id) {
  const sale = salesData.find(item => item.id === id);
  if (!sale) return;

  document.getElementById('btn-reset-form').classList.remove('hidden');
  document.getElementById('btn-submit').querySelector('span').textContent = 'Perbarui Transaksi';
  
  document.getElementById('edit-id').value = sale.id;
  document.getElementById('sale-date').value = sale.date;
  document.getElementById('sale-product').value = sale.product;
  
  // Call product selection handler to disable/enable coupon radios
  handleProductSelection();

  // Populate with normalPrice (harga asli), dealPrice will auto-recalculate
  document.getElementById('sale-price').value = formatNumberRupiah(sale.normalPrice || sale.price);
  document.getElementById('sale-description').value = sale.description;

  const couponRadios = document.getElementsByName('sale-coupon');
  const customRateGroup = document.getElementById('custom-commission-group');
  const customRateInput = document.getElementById('custom-commission-rate');

  couponRadios.forEach(radio => {
    radio.checked = radio.value === sale.coupon;
  });

  if (sale.coupon === 'custom') {
    customRateGroup.classList.remove('hidden');
    customRateInput.setAttribute('required', 'required');
    customRateInput.value = sale.commissionRate;
  } else {
    customRateGroup.classList.add('hidden');
    customRateInput.removeAttribute('required');
    customRateInput.value = '';
  }

  updatePreview();
  // On mobile: switch to form tab so user can see the edit form
  if (window.innerWidth <= 1100) {
    switchTab('form');
  }
  document.querySelector('.form-container').scrollIntoView({ behavior: 'smooth' });
};

// Cancel editing a sale, clear values to defaults
function cancelFormEdit() {
  const form = document.getElementById('sale-form');
  const editIdEl = document.getElementById('edit-id');
  const customRateGroup = document.getElementById('custom-commission-group');
  const resetFormBtn = document.getElementById('btn-reset-form');
  const submitBtnText = document.getElementById('btn-submit').querySelector('span');

  form.reset();
  
  // Restore coupon radio options to default active states
  handleProductSelection();

  editIdEl.value = '';
  customRateGroup.classList.add('hidden');
  resetFormBtn.classList.add('hidden');
  submitBtnText.textContent = 'Simpan Transaksi';
  document.getElementById('custom-discount-rate').value = '';

  // Set date back to today
  const today = new Date();
  document.getElementById('sale-date').value = today.toISOString().split('T')[0];

  // Recalculate previews
  updatePreview();
}

// --- DELETION & RESET CONFIRMATION DIALOGS ---

let activeConfirmationPromise = null;

// Opens a beautiful modal dialog to request confirmation before critical actions
function showConfirmDialog(title, message, isDanger = true) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-title');
  const messageEl = document.getElementById('confirm-message');
  const btnYes = document.getElementById('confirm-btn-yes');
  const btnCancel = document.getElementById('confirm-btn-cancel');

  titleEl.textContent = title;
  messageEl.textContent = message;
  
  if (isDanger) {
    btnYes.className = "btn btn-danger";
    btnYes.textContent = "Ya, Hapus";
  } else {
    btnYes.className = "btn btn-primary";
    btnYes.textContent = "Ya, Lanjutkan";
  }

  modal.classList.remove('hidden');

  return new Promise((resolve) => {
    const handleYes = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      btnYes.removeEventListener('click', handleYes);
      btnCancel.removeEventListener('click', handleCancel);
      modal.classList.add('hidden');
    };

    btnYes.addEventListener('click', handleYes);
    btnCancel.addEventListener('click', handleCancel);
  });
}

// Delete specific sale transaction by ID
window.deleteSale = async function(id) {
  const sale = salesData.find(item => item.id === id);
  if (!sale) return;

  const confirmed = await showConfirmDialog(
    "Hapus Transaksi Penjualan",
    `Apakah Anda yakin ingin menghapus data penjualan produk "${sale.product}" senilai ${formatFullRupiah(sale.price)}? Tindakan ini tidak dapat dibatalkan.`
  );

  if (confirmed) {
    salesData = salesData.filter(item => item.id !== id);
    await deleteSaleRecord(id);
    updateDashboard();
    populatePeriodFilter();
    renderSalesTable();
    renderPayoutsTable();
    showToast("Transaksi berhasil dihapus.");
  }
};

// Reset/Wipe all transactions for the current period
async function triggerResetPeriodData() {
  const activePeriod = getActivePeriodLabel();
  const currentPeriodCount = salesData.filter(sale => sale.period === activePeriod).length;

  if (currentPeriodCount === 0) {
    showToast("Tidak ada transaksi untuk dihapus di periode ini.", "error");
    return;
  }

  const confirmed = await showConfirmDialog(
    "Reset Periode Aktif",
    `Apakah Anda yakin ingin menghapus SELURUH (${currentPeriodCount}) data penjualan pada periode berjalan saat ini "${activePeriod}"?`
  );

  if (confirmed) {
    const activePeriodSales = salesData.filter(sale => sale.period === activePeriod);
    for (let sale of activePeriodSales) {
      await deleteSaleRecord(sale.id);
    }
    salesData = salesData.filter(sale => sale.period !== activePeriod);
    updateDashboard();
    populatePeriodFilter();
    renderSalesTable();
    renderPayoutsTable();
    showToast("Data periode aktif berhasil di-reset.");
  }
}

// --- DATA EXPORT / IMPORT (BACKUP) ---

// Export current view data into CSV format
function exportToCSV() {
  const periodFilter = document.getElementById('period-filter').value;
  const productFilter = document.getElementById('product-filter').value;
  const activePeriod = getActivePeriodLabel();
  
  let exportData = salesData;

  if (periodFilter === 'current') {
    exportData = exportData.filter(sale => sale.period === activePeriod);
  } else if (periodFilter !== 'all') {
    exportData = exportData.filter(sale => sale.period === periodFilter);
  }

  if (productFilter !== 'all') {
    exportData = exportData.filter(sale => sale.product === productFilter);
  }

  if (exportData.length === 0) {
    showToast("Tidak ada data untuk diekspor pada filter terpilih.", "error");
    return;
  }

  // Sorting descending by date
  exportData.sort((a, b) => b.date.localeCompare(a.date));

  // CSV content assembly
  let csvContent = "Tanggal,Nama Produk,Harga Normal (IDR),Harga Deal (IDR),Kupon,Rate Komisi (%),Jumlah Komisi (IDR),Catatan / Deskripsi\n";

  exportData.forEach(sale => {
    const descSanitized = (sale.description || '').replace(/"/g, '""');
    const normalPrice = sale.normalPrice || sale.price;
    const dealPrice = sale.dealPrice || sale.price;
    csvContent += `"${sale.date}","${sale.product}",${normalPrice},${dealPrice},"${getCouponText(sale.coupon)}",${sale.commissionRate},${sale.commissionAmount},"${descSanitized}"\n`;
  });

  // Include Excel UTF-8 BOM representation
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  // Trigger file download
  const link = document.createElement("a");
  link.setAttribute("href", url);
  
  const periodSlug = periodFilter === 'all' ? 'semua-periode' : periodFilter.replace(/\s+/g, '-').toLowerCase();
  link.setAttribute("download", `affiliate-komisi-${periodSlug}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("File CSV berhasil diekspor!");
}

// Download the complete database as JSON backup
function exportBackupJSON() {
  if (salesData.length === 0) {
    showToast("Tidak ada data untuk dibackup.", "error");
    return;
  }

  const jsonString = JSON.stringify(salesData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  
  const todayStr = new Date().toISOString().split('T')[0];
  link.setAttribute("download", `backup-affiliate-pay-${todayStr}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("Backup database JSON berhasil diunduh.");
}

// Import JSON file and merge/override into state
function handleJSONImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(event) {
    try {
      const parsedData = JSON.parse(event.target.result);
      
      // Validation check
      if (!Array.isArray(parsedData)) {
        showToast("Format file backup tidak valid. Harus berupa array data.", "error");
        return;
      }

      // Simple object model validation
      const isValid = parsedData.every(item => 
        item && 
        typeof item.id === 'string' && 
        typeof item.date === 'string' && 
        typeof item.product === 'string' && 
        typeof item.price === 'number' && 
        typeof item.commissionAmount === 'number'
      );

      if (!isValid) {
        showToast("Beberapa entri data dalam file tidak sesuai struktur standard.", "error");
        return;
      }

      const confirmed = await showConfirmDialog(
        "Impor Backup Data",
        `Ditemukan ${parsedData.length} transaksi di dalam file backup. Apakah Anda ingin mengimpor data ini dan menggabungkannya dengan data Anda saat ini?`,
        false
      );

      if (confirmed) {
        // Merge data, checking for duplicate IDs
        let mergedCount = 0;
        for (let importedItem of parsedData) {
          const exists = salesData.some(existing => existing.id === importedItem.id);
          if (!exists) {
            // Re-calculate period just in case period formatting rules changed
            importedItem.period = getPeriodLabel(importedItem.date);
            salesData.push(importedItem);
            await saveSaleRecord(importedItem);
            mergedCount++;
          }
        }

        updateDashboard();
        populatePeriodFilter();
        renderSalesTable();
        renderPayoutsTable();
        showToast(`Impor berhasil! ${mergedCount} transaksi baru diunggah ke Firebase.`);
      }

    } catch (err) {
      console.error("Error membaca file JSON:", err);
      showToast("Gagal mengurai file JSON. File rusak.", "error");
    }
    
    // Clear input value so same file can be selected again
    e.target.value = '';
  };

  reader.readAsText(file);
}

// --- PAYOUT MODULE HELPER FUNCTIONS ---

async function savePayoutRecord(period, diosgVal, aldiVal, jokoVal) {
  if (!db) return;
  try {
    if (!periodPayoutsData[period]) {
      periodPayoutsData[period] = {};
    }
    periodPayoutsData[period].diosgPaid = diosgVal;
    periodPayoutsData[period].aldiPaid = aldiVal;
    periodPayoutsData[period].jokoPaid = jokoVal;

    await db.ref(`period_payouts/${period}`).set(periodPayoutsData[period]);
    triggerSheetsSync(); // trigger sheets sync immediately
  } catch (e) {
    console.error("Failed to save payout record:", e);
    showToast("Gagal menyimpan data pembayaran.", "error");
  }
}

window.switchDataTab = function(tab) {
  currentActiveViewTab = tab;
  
  const btnList = document.getElementById('data-tab-btn-list');
  const btnPayout = document.getElementById('data-tab-btn-payout');
  const viewList = document.getElementById('view-transactions-list');
  const viewPayout = document.getElementById('view-payouts-list');
  
  if (!btnList || !btnPayout || !viewList || !viewPayout) return;

  if (tab === 'list') {
    btnList.classList.add('active');
    btnPayout.classList.remove('active');
    viewList.classList.remove('hidden');
    viewPayout.classList.add('hidden');
    renderSalesTable();
  } else {
    btnPayout.classList.add('active');
    btnList.classList.remove('active');
    viewPayout.classList.remove('hidden');
    viewList.classList.add('hidden');
    renderPayoutsTable();
  }
};

function renderPayoutsTable() {
  const tbody = document.getElementById('payout-tbody');
  if (!tbody) return;

  const periodFilter = document.getElementById('period-filter').value;
  const activePeriod = getActivePeriodLabel();

  let targetPeriod = periodFilter;
  if (periodFilter === 'current') {
    targetPeriod = activePeriod;
  }

  let filteredSales = salesData;
  if (targetPeriod !== 'all') {
    filteredSales = filteredSales.filter(sale => sale.period === targetPeriod);
  }

  filteredSales.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id);
  });

  let totalNet = 0;
  let totalDiosg = 0;
  let totalAldi = 0;
  let totalJoko = 0;

  filteredSales.forEach(sale => {
    const net = sale.commissionAmount - Math.round(sale.commissionAmount * 0.207);
    totalNet += net;
    totalDiosg += Math.round(net * 0.60);
    totalAldi += Math.round(net * 0.20);
    totalJoko += Math.round(net * 0.20);
  });

  document.getElementById('payout-total-diosg').textContent = formatFullRupiah(totalDiosg);
  document.getElementById('payout-total-aldi').textContent = formatFullRupiah(totalAldi);
  document.getElementById('payout-total-joko').textContent = formatFullRupiah(totalJoko);

  const isPeriodAll = targetPeriod === 'all';
  const inputDiosgEl = document.getElementById('payout-input-diosg');
  const inputAldiEl = document.getElementById('payout-input-aldi');
  const inputJokoEl = document.getElementById('payout-input-joko');

  if (isPeriodAll) {
    let paidDiosg = 0;
    let paidAldi = 0;
    let paidJoko = 0;

    Object.keys(periodPayoutsData).forEach(pKey => {
      paidDiosg += Number(periodPayoutsData[pKey].diosgPaid || 0);
      paidAldi += Number(periodPayoutsData[pKey].aldiPaid || 0);
      paidJoko += Number(periodPayoutsData[pKey].jokoPaid || 0);
    });

    inputDiosgEl.value = paidDiosg ? formatNumberRupiah(paidDiosg) : '0';
    inputAldiEl.value = paidAldi ? formatNumberRupiah(paidAldi) : '0';
    inputJokoEl.value = paidJoko ? formatNumberRupiah(paidJoko) : '0';
    
    inputDiosgEl.disabled = true;
    inputAldiEl.disabled = true;
    inputJokoEl.disabled = true;
  } else {
    inputDiosgEl.disabled = false;
    inputAldiEl.disabled = false;
    inputJokoEl.disabled = false;

    const payoutInfo = periodPayoutsData[targetPeriod] || { diosgPaid: 0, aldiPaid: 0, jokoPaid: 0 };
    inputDiosgEl.value = payoutInfo.diosgPaid ? formatNumberRupiah(payoutInfo.diosgPaid) : '';
    inputAldiEl.value = payoutInfo.aldiPaid ? formatNumberRupiah(payoutInfo.aldiPaid) : '';
    inputJokoEl.value = payoutInfo.jokoPaid ? formatNumberRupiah(payoutInfo.jokoPaid) : '';
  }

  updatePayoutRemainingCalculations(totalDiosg, totalAldi, totalJoko, targetPeriod);

  tbody.innerHTML = '';

  if (filteredSales.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="6">
          <div class="empty-state-content">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <p>Belum ada data payout pada periode ini.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  filteredSales.forEach(sale => {
    const net = sale.commissionAmount - Math.round(sale.commissionAmount * 0.207);
    const diosgShare = Math.round(net * 0.60);
    const aldiShare = Math.round(net * 0.20);
    const jokoShare = Math.round(net * 0.20);

    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td class="table-date">${formatDisplayDate(sale.date)}</td>
      <td>
        <div class="table-product" style="font-size:11px; color:var(--text-muted);">${escapeHTML(sale.product)}</div>
        <div style="font-weight:600; font-size:13px; margin-top:2px;">${escapeHTML(sale.description || 'Tanpa catatan')}</div>
      </td>
      <td style="text-align: right;" class="table-price">${formatNumberRupiah(net)}</td>
      <td style="text-align: right; font-weight: 600;" class="table-price">${formatNumberRupiah(diosgShare)}</td>
      <td style="text-align: right; font-weight: 600;" class="table-price">${formatNumberRupiah(aldiShare)}</td>
      <td style="text-align: right; font-weight: 600;" class="table-price">${formatNumberRupiah(jokoShare)}</td>
    `;
    tbody.appendChild(row);
  });
}

function updatePayoutRemainingCalculations(totalDiosg, totalAldi, totalJoko, period) {
  const remDiosgEl = document.getElementById('payout-remaining-diosg');
  const remAldiEl = document.getElementById('payout-remaining-aldi');
  const remJokoEl = document.getElementById('payout-remaining-joko');

  const footerDiosgEl = document.getElementById('payout-footer-rem-diosg');
  const footerAldiEl = document.getElementById('payout-footer-rem-aldi');
  const footerJokoEl = document.getElementById('payout-footer-rem-joko');

  if (!remDiosgEl || !remAldiEl || !remJokoEl || !footerDiosgEl || !footerAldiEl || !footerJokoEl) return;

  let paidDiosg = 0;
  let paidAldi = 0;
  let paidJoko = 0;

  if (period === 'all') {
    Object.keys(periodPayoutsData).forEach(pKey => {
      paidDiosg += Number(periodPayoutsData[pKey].diosgPaid || 0);
      paidAldi += Number(periodPayoutsData[pKey].aldiPaid || 0);
      paidJoko += Number(periodPayoutsData[pKey].jokoPaid || 0);
    });
  } else {
    const payoutInfo = periodPayoutsData[period] || { diosgPaid: 0, aldiPaid: 0, jokoPaid: 0 };
    paidDiosg = Number(payoutInfo.diosgPaid || 0);
    paidAldi = Number(payoutInfo.aldiPaid || 0);
    paidJoko = Number(payoutInfo.jokoPaid || 0);
  }

  const remDiosg = totalDiosg - paidDiosg;
  const remAldi = totalAldi - paidAldi;
  const remJoko = totalJoko - paidJoko;

  const displayRemaining = (val, el, footerEl) => {
    el.textContent = formatFullRupiah(val);
    footerEl.textContent = formatFullRupiah(val);
    if (val <= 0) {
      el.className = "sisa-val lunas";
      footerEl.className = "text-emerald";
    } else {
      el.className = "sisa-val";
      footerEl.className = "text-amber";
    }
  };

  displayRemaining(remDiosg, remDiosgEl, footerDiosgEl);
  displayRemaining(remAldi, remAldiEl, footerAldiEl);
  displayRemaining(remJoko, remJokoEl, footerJokoEl);
}
