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
let payoutTransactionsData = [];
let currentActiveViewTab = 'dashboard';
let selectedProductFilters = [];

// --- CHART INSTANCES ---
let chartTrendsInstance = null;
let chartSharesInstance = null;
let chartProductsInstance = null;

// --- THEME SWITCHER LOGIC (DARK / LIGHT MODE) ---
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');
  const textLabel = document.getElementById('theme-text-label');

  if (theme === 'light') {
    if (sunIcon) sunIcon.classList.add('hidden');
    if (moonIcon) moonIcon.classList.remove('hidden');
    if (textLabel) textLabel.textContent = 'Dark Mode';
  } else {
    if (sunIcon) sunIcon.classList.remove('hidden');
    if (moonIcon) moonIcon.classList.add('hidden');
    if (textLabel) textLabel.textContent = 'Light Mode';
  }

  if (typeof updateCharts === 'function') {
    updateCharts();
  }
}

window.toggleTheme = function() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  showToast(`Mode tampilan diubah ke ${newTheme === 'light' ? 'Terang ☀️' : 'Gelap 🌙'}`);
};

window.toggleMobileSidebar = function() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('show');
  if (overlay) overlay.classList.toggle('show');
};

// --- MAIN TAB NAVIGATION SWITCHER ---
window.switchMainTab = function(tabName) {
  currentActiveViewTab = tabName;
  const tabs = ['dashboard', 'sales', 'commission', 'input'];
  const titles = {
    'dashboard':  'Dashboard & Analitik',
    'sales':      'Daftar Penjualan',
    'commission': 'Pembagian Komisi',
    'input':      'Tambah Transaksi Penjualan',
  };

  const headingEl = document.getElementById('page-title-heading');
  if (headingEl && titles[tabName]) headingEl.textContent = titles[tabName];

  tabs.forEach(t => {
    const btn = document.getElementById(`nav-btn-${t}`);
    const sectionId = t === 'input' ? 'tab-input-sale' : `tab-${t}`;
    const section = document.getElementById(sectionId);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (section) section.classList.toggle('active', t === tabName);
  });

  // Close mobile sidebar if open
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('show');
  if (overlay) overlay.classList.remove('show');

  if (tabName === 'dashboard') {
    updateDashboard();
    updateCharts();
  } else if (tabName === 'sales') {
    renderSalesTable();
  } else if (tabName === 'commission') {
    renderCommissionTab();
  } else if (tabName === 'payout') {
    renderPayoutsTable();
  }
};

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
  const dateEl = document.getElementById('sale-date');
  if (dateEl) dateEl.value = today.toISOString().split('T')[0];

  // Initialize UI components, theme, event listeners and Chart.js immediately
  initTheme();
  initEventListeners();
  initCharts();
  initProductMultiSelect();
  
  // Calculate and update metrics with empty/local data first
  updateDashboard();
  
  // Populate period filter options
  populatePeriodFilter();

  // Initial table render & charts update
  renderSalesTable();
  updateCharts();

  // Initialize Firebase and load data in the background
  try {
    const initialized = initializeFirebase(firebaseConfig);
    if (initialized) {
      loadSalesData().then(() => {
        // Refresh calculations, table & charts after data is fetched from cloud
        updateDashboard();
        populatePeriodFilter();
        renderSalesTable();
        renderPayoutsTable();
        updateCharts();
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
          period: data.period || getPeriodLabel(data.date),
          leadsSource: data.leadsSource || ''
        });
      });
    }

    // Load payout ledger transactions as well
    const payoutSnapshot = await db.ref('payout_transactions').once('value');
    payoutTransactionsData = [];
    const pVal = payoutSnapshot.val();
    if (pVal) {
      Object.keys(pVal).forEach(key => {
        const data = pVal[key];
        payoutTransactionsData.push({
          id: key,
          date: data.date,
          recipient: data.recipient,
          amount: Number(data.amount || 0),
          description: data.description || '',
          period: data.period || getPeriodLabel(data.date)
        });
      });
    }
  } catch (e) {
    console.error("Realtime DB Fetch Error:", e);
    showToast("Gagal memuat data dari Cloud Firebase.", "error");
    salesData = [];
    payoutTransactionsData = [];
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
    updateCharts();
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

  // Leads source change handler — show/hide hint and auto-suggest
  const leadsSourceSelect = document.getElementById('sale-leads-source');
  const leadsSourceHint = document.getElementById('leads-source-hint');
  if (leadsSourceSelect && leadsSourceHint) {
    leadsSourceSelect.addEventListener('change', () => {
      leadsSourceHint.style.display = leadsSourceSelect.value === 'fast-track' ? 'block' : 'none';
    });
  }

  // Payout form date default value (today)
  const payoutDateEl = document.getElementById('payout-date');
  if (payoutDateEl) {
    const today = new Date();
    payoutDateEl.value = today.toISOString().split('T')[0];
  }

  // Payout amount formatting input handler
  const payoutAmountInput = document.getElementById('payout-amount');
  if (payoutAmountInput) {
    payoutAmountInput.addEventListener('input', (e) => {
      let cursorPosition = e.target.selectionStart;
      let originalLen = e.target.value.length;
      
      let numericVal = getRawNumber(e.target.value);
      if (isNaN(numericVal) || numericVal <= 0) {
        e.target.value = '';
        return;
      }
      e.target.value = formatNumberRupiah(numericVal);
      
      let newLen = e.target.value.length;
      cursorPosition = cursorPosition + (newLen - originalLen);
      e.target.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  // Payout form submit handler
  const payoutForm = document.getElementById('payout-record-form');
  if (payoutForm) {
    payoutForm.addEventListener('submit', handlePayoutFormSubmit);
  }
}

// --- MULTI-SELECT PRODUCT FILTER COMPONENT ---
function initProductMultiSelect() {
  const btn = document.getElementById('product-multi-select-btn');
  const menu = document.getElementById('product-multi-select-menu');
  const chkAll = document.getElementById('chk-product-all');
  const chkItems = document.querySelectorAll('.chk-product-item');

  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  if (chkAll) {
    chkAll.addEventListener('change', () => {
      const isChecked = chkAll.checked;
      chkItems.forEach(item => { item.checked = isChecked; });
      updateProductFilterState();
    });
  }

  chkItems.forEach(item => {
    item.addEventListener('change', () => {
      const allChecked = Array.from(chkItems).every(i => i.checked);
      if (chkAll) chkAll.checked = allChecked;
      updateProductFilterState();
    });
  });

  updateProductFilterState();
}

function updateProductFilterState() {
  const chkItems = document.querySelectorAll('.chk-product-item');
  const selected = [];
  chkItems.forEach(item => { if (item.checked) selected.push(item.value); });
  selectedProductFilters = selected;

  const label = document.getElementById('product-multi-select-label');
  if (label) {
    if (selected.length === 0) label.textContent = 'Tidak Ada Produk';
    else if (chkItems.length > 0 && selected.length === chkItems.length) label.textContent = 'Semua Produk';
    else if (selected.length === 1) label.textContent = selected[0];
    else label.textContent = selected.length + ' Produk Terpilih';
  }

  renderSalesTable();
  updateCharts();
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

  // Splits for current period — apply per-sale share logic
  const currentDeduction = Math.round(currentPeriodCommission * 0.207);
  const currentNet = currentPeriodCommission - currentDeduction;

  let currentDiosg = 0, currentAldi = 0, currentJoko = 0, currentNdine = 0;
  let hasNdine = false;
  salesData.filter(s => s.period === activePeriod).forEach(s => {
    const sNet = s.commissionAmount - Math.round(s.commissionAmount * 0.207);
    const sh = calcShares(sNet, s.leadsSource);
    currentDiosg += sh.diosg;
    currentAldi  += sh.aldi;
    currentJoko  += sh.joko;
    currentNdine += sh.ndine;
    if (sh.isFastTrack) hasNdine = true;
  });

  document.getElementById('stat-current-deduction').textContent = `-Rp ${formatNumberRupiah(currentDeduction)}`;
  document.getElementById('stat-current-net').textContent = formatFullRupiah(currentNet);
  document.getElementById('stat-current-diosg').textContent = formatFullRupiah(currentDiosg);
  document.getElementById('stat-current-aldi').textContent = formatFullRupiah(currentAldi);
  document.getElementById('stat-current-joko').textContent = formatFullRupiah(currentJoko);
  document.getElementById('stat-current-ndine').textContent = formatFullRupiah(currentNdine);
  // Show/hide Ndine share box in metric card
  const ndineBox = document.getElementById('share-box-ndine');
  if (ndineBox) ndineBox.style.display = hasNdine ? '' : 'none';
  const diosgLabel = document.getElementById('label-current-diosg');
  if (diosgLabel) diosgLabel.textContent = hasNdine ? 'DIOSG (50%~)' : 'DIOSG (60%)';

  // Splits for all-time — apply per-sale share logic
  const allTimeDeduction = Math.round(allTimeCommission * 0.207);
  const allTimeNet = allTimeCommission - allTimeDeduction;

  let allTimeDiosg = 0, allTimeAldi = 0, allTimeJoko = 0;
  salesData.forEach(s => {
    const sNet = s.commissionAmount - Math.round(s.commissionAmount * 0.207);
    const sh = calcShares(sNet, s.leadsSource);
    allTimeDiosg += sh.diosg;
    allTimeAldi  += sh.aldi;
    allTimeJoko  += sh.joko;
  });

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
  
  let filteredSales = salesData;

  // 1. Period Filtering
  if (periodFilter === 'current') {
    filteredSales = filteredSales.filter(sale => sale.period === activePeriod);
  } else if (periodFilter !== 'all') {
    filteredSales = filteredSales.filter(sale => sale.period === periodFilter);
  }

  // 1b. Multi-Select Product Filtering
  const totalChkItems = document.querySelectorAll('.chk-product-item').length;
  if (selectedProductFilters.length > 0 && selectedProductFilters.length < totalChkItems) {
    filteredSales = filteredSales.filter(sale => selectedProductFilters.includes(sale.product));
  } else if (selectedProductFilters.length === 0 && totalChkItems > 0) {
    filteredSales = [];
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

      const isFTLeads = sale.leadsSource === 'fast-track';
      const leadsBadgeHtml = isFTLeads ? `<span style="display:inline-block; font-size:10px; font-weight:700; color:#f59e0b; background:rgba(245,158,11,0.12); padding:2px 6px; border-radius:4px; margin-bottom:3px;">⚡ Fast Track (Ndine 10%)</span><br>` : '';

      const leadsCellHtml = isFTLeads
        ? `<span style="display:inline-block;font-size:10px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,0.12);padding:2px 7px;border-radius:4px;">⚡ FT</span>`
        : `<span style="display:inline-block;font-size:10px;font-weight:600;color:var(--text-muted);background:var(--bg-input);padding:2px 7px;border-radius:4px;">Organik</span>`;

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
        <td style="text-align: center;">${leadsCellHtml}</td>
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
  }

  // Update table subtotals (null-safe for elements moved to commission tab)
  if (subtotalPriceEl) subtotalPriceEl.textContent = formatFullRupiah(subtotalPrice);
  if (subtotalCommEl)  subtotalCommEl.textContent  = formatFullRupiah(subtotalCommission);

  const countEl = document.getElementById('table-summary-count');
  if (countEl) countEl.textContent = filteredSales.length + ' transaksi';

  // Calculate splits — these elements may or may not exist (moved to commission tab)
  const deduction = Math.round(subtotalCommission * 0.207);
  const netCommission = subtotalCommission - deduction;

  let diosgShare = 0, aldiShare = 0, jokoShare = 0, ndineShare = 0;
  let hasNdineInFilter = false;
  filteredSales.forEach(s => {
    const sNet = s.commissionAmount - Math.round(s.commissionAmount * 0.207);
    const sh = calcShares(sNet, s.leadsSource);
    diosgShare += sh.diosg;
    aldiShare  += sh.aldi;
    jokoShare  += sh.joko;
    ndineShare += sh.ndine;
    if (sh.isFastTrack) hasNdineInFilter = true;
  });

  const setIfExists = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setIfExists('table-summary-deduction', `-Rp ${formatNumberRupiah(deduction)}`);
  setIfExists('table-summary-net',       formatFullRupiah(netCommission));
  setIfExists('table-summary-diosg',     formatFullRupiah(diosgShare));
  setIfExists('table-summary-aldi',      formatFullRupiah(aldiShare));
  setIfExists('table-summary-joko',      formatFullRupiah(jokoShare));
  setIfExists('table-summary-ndine',     formatFullRupiah(ndineShare));
  const ndineCard = document.getElementById('summary-share-ndine');
  if (ndineCard) ndineCard.style.display = hasNdineInFilter ? '' : 'none';
  const diosgTableLabel = document.getElementById('label-table-diosg');
  if (diosgTableLabel) diosgTableLabel.textContent = hasNdineInFilter ? 'DIOSG (50%~)' : 'DIOSG (60%)';
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

/**
 * Calculate share splits based on leadsSource.
 * If leadsSource === 'fast-track': DIOSG=50%, ALDI=20%, Joko=20%, Ndine=10%
 * Otherwise: DIOSG=60%, ALDI=20%, Joko=20%, Ndine=0%
 */
function calcShares(netCommission, leadsSource) {
  const isFastTrack = leadsSource === 'fast-track';
  return {
    diosg: Math.round(netCommission * (isFastTrack ? 0.50 : 0.60)),
    aldi : Math.round(netCommission * 0.20),
    joko : Math.round(netCommission * 0.20),
    ndine: isFastTrack ? Math.round(netCommission * 0.10) : 0,
    isFastTrack
  };
}

// --- COMMISSION TAB RENDERER ---
function renderCommissionTab() {
  const periodFilterEl = document.getElementById('period-filter');
  const periodFilter = periodFilterEl ? periodFilterEl.value : 'current';
  const activePeriod = getActivePeriodLabel();

  let filtered = salesData;
  if (periodFilter === 'current') {
    filtered = filtered.filter(s => s.period === activePeriod);
  } else if (periodFilter !== 'all') {
    filtered = filtered.filter(s => s.period === periodFilter);
  }

  const totalChkItems = document.querySelectorAll('.chk-product-item').length;
  if (selectedProductFilters.length > 0 && selectedProductFilters.length < totalChkItems) {
    filtered = filtered.filter(s => selectedProductFilters.includes(s.product));
  } else if (selectedProductFilters.length === 0 && totalChkItems > 0) {
    filtered = [];
  }

  let totalGross = 0, totalDeduction = 0, totalNet = 0;
  let diosgGross = 0, aldiGross = 0, jokoGross = 0, ndineGross = 0;
  let diosgNet = 0, aldiNet = 0, jokoNet = 0, ndineNet = 0;

  const tbody = document.getElementById('commission-detail-tbody');
  if (tbody) tbody.innerHTML = '';

  filtered.forEach(sale => {
    const gross = sale.commissionAmount || 0;
    const deduction = Math.round(gross * 0.207);
    const net = gross - deduction;
    const sh = calcShares(net, sale.leadsSource);

    totalGross += gross;
    totalDeduction += deduction;
    totalNet += net;
    diosgNet += sh.diosg;
    aldiNet  += sh.aldi;
    jokoNet  += sh.joko;
    ndineNet += sh.ndine;

    // Accumulate gross proportionally
    diosgGross += gross * (sh.isFastTrack ? 0.50 : 0.60);
    aldiGross  += gross * 0.20;
    jokoGross  += gross * 0.20;
    ndineGross += sh.isFastTrack ? gross * 0.10 : 0;

    if (tbody) {
      const isFT = sale.leadsSource === 'fast-track';
      const leadsBadge = isFT
        ? `<span style="font-size:10px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,0.12);padding:2px 7px;border-radius:4px;">⚡ Fast Track</span>`
        : `<span style="font-size:10px;font-weight:600;color:var(--text-muted);background:var(--bg-input);padding:2px 7px;border-radius:4px;">Organik</span>`;

      const ndineCell = sh.ndine > 0
        ? `<td style="text-align:right;" class="text-amber">${formatFullRupiah(sh.ndine)}</td>`
        : `<td style="text-align:right;color:var(--text-muted-dark);">—</td>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="table-date">${formatDisplayDate(sale.date)}</td>
        <td><div class="table-product">${escapeHTML(sale.product)}</div></td>
        <td style="text-align:right;">${formatFullRupiah(gross)}</td>
        <td style="text-align:right;" class="text-danger">-${formatFullRupiah(deduction)}</td>
        <td style="text-align:right;" class="text-emerald"><strong>${formatFullRupiah(net)}</strong></td>
        <td style="text-align:center;">${leadsBadge}</td>
        <td style="text-align:right;">${formatFullRupiah(sh.diosg)}</td>
        <td style="text-align:right;">${formatFullRupiah(sh.aldi)}</td>
        <td style="text-align:right;">${formatFullRupiah(sh.joko)}</td>
        ${ndineCell}
      `;
      tbody.appendChild(tr);
    }
  });

  if (tbody && filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-state"><td colspan="10"><div class="empty-state-content"><p>Belum ada data komisi.</p></div></td></tr>`;
  }

  // Update member cards
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('comm-diosg-gross',     formatFullRupiah(Math.round(diosgGross)));
  setEl('comm-diosg-deduction', '-' + formatFullRupiah(Math.round(diosgGross * 0.207)));
  setEl('comm-diosg-net',       formatFullRupiah(diosgNet));
  setEl('comm-aldi-gross',      formatFullRupiah(Math.round(aldiGross)));
  setEl('comm-aldi-deduction',  '-' + formatFullRupiah(Math.round(aldiGross * 0.207)));
  setEl('comm-aldi-net',        formatFullRupiah(aldiNet));
  setEl('comm-joko-gross',      formatFullRupiah(Math.round(jokoGross)));
  setEl('comm-joko-deduction',  '-' + formatFullRupiah(Math.round(jokoGross * 0.207)));
  setEl('comm-joko-net',        formatFullRupiah(jokoNet));
  setEl('comm-ndine-gross',     formatFullRupiah(Math.round(ndineGross)));
  setEl('comm-ndine-deduction', '-' + formatFullRupiah(Math.round(ndineGross * 0.207)));
  setEl('comm-ndine-net',       formatFullRupiah(ndineNet));

  // Update total banner
  setEl('comm-total-gross',     formatFullRupiah(totalGross));
  setEl('comm-total-deduction', '-' + formatFullRupiah(totalDeduction));
  setEl('comm-total-net',       formatFullRupiah(totalNet));
  setEl('comm-total-count',     filtered.length + ' transaksi');

  // Show/hide Ndine card
  const ndineCard = document.getElementById('comm-card-ndine');
  if (ndineCard) ndineCard.style.display = ndineNet > 0 ? '' : '';
}

// --- CHART INTEGRATION FUNCTIONS ---

function initCharts() {
  if (typeof Chart === 'undefined') return;

  // Global Chart Defaults
  Chart.defaults.color = '#9ca3af';
  Chart.defaults.font.family = "'Plus Jakarta Sans', 'Inter', sans-serif";

  // 1. Line/Bar Chart: Tren Omset & Komisi
  const ctxTrends = document.getElementById('chart-trends');
  if (ctxTrends) {
    chartTrendsInstance = new Chart(ctxTrends, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Total Omset (Deal Price)',
            data: [],
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.12)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointBackgroundColor: '#6366f1',
            pointRadius: 4
          },
          {
            label: 'Komisi Bersih',
            data: [],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointBackgroundColor: '#10b981',
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatFullRupiah(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.04)' } },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              callback: (val) => 'Rp ' + (val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : (val / 1000).toFixed(0) + 'K')
            }
          }
        }
      }
    });
  }

  // 2. Doughnut Chart: Distribusi Bagi Hasil
  const ctxShares = document.getElementById('chart-shares');
  if (ctxShares) {
    chartSharesInstance = new Chart(ctxShares, {
      type: 'doughnut',
      data: {
        labels: ['DIOSG', 'ALDI', 'Joko', 'Ndine'],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: ['#6366f1', '#f59e0b', '#10b981', '#ec4899'],
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatFullRupiah(ctx.raw)}`
            }
          }
        },
        cutout: '68%'
      }
    });
  }

  // 3. Bar Chart: Penjualan Per Produk — Kuantitas vs Kualitas
  const ctxProducts = document.getElementById('chart-products');
  if (ctxProducts) {
    chartProductsInstance = new Chart(ctxProducts, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Kuantitas (Transaksi)',
            data: [],
            backgroundColor: 'rgba(99, 102, 241, 0.75)',
            borderColor: '#6366f1',
            borderWidth: 1.5,
            borderRadius: 6,
            yAxisID: 'yCount',
            order: 1
          },
          {
            label: 'Omzet (Harga Deal)',
            data: [],
            backgroundColor: 'rgba(16, 185, 129, 0.65)',
            borderColor: '#10b981',
            borderWidth: 1.5,
            borderRadius: 6,
            yAxisID: 'yRupiah',
            order: 2
          },
          {
            label: 'Komisi Bersih',
            data: [],
            backgroundColor: 'rgba(245, 158, 11, 0.65)',
            borderColor: '#f59e0b',
            borderWidth: 1.5,
            borderRadius: 6,
            yAxisID: 'yRupiah',
            order: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { boxWidth: 12, usePointStyle: true, padding: 16, font: { size: 11, weight: '600' } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) return ` ${ctx.dataset.label}: ${ctx.raw} transaksi`;
                return ` ${ctx.dataset.label}: ${formatFullRupiah(ctx.raw)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          },
          yCount: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              precision: 0,
              font: { size: 11 },
              color: '#6366f1'
            },
            title: {
              display: true,
              text: 'Jumlah Transaksi',
              color: '#6366f1',
              font: { size: 11, weight: '600' }
            }
          },
          yRupiah: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: {
              font: { size: 11 },
              color: '#10b981',
              callback: (val) => {
                if (val >= 1000000000) return 'Rp ' + (val / 1000000000).toFixed(1) + 'M';
                if (val >= 1000000) return 'Rp ' + (val / 1000000).toFixed(0) + 'jt';
                if (val >= 1000) return 'Rp ' + (val / 1000).toFixed(0) + 'K';
                return 'Rp ' + val;
              }
            },
            title: {
              display: true,
              text: 'Nilai (Rupiah)',
              color: '#10b981',
              font: { size: 11, weight: '600' }
            }
          }
        }
      }
    });
  }
}

function updateCharts() {
  if (typeof Chart === 'undefined') return;

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.05)';
  const textColor = isLight ? '#64748b' : '#94a3b8';

  Chart.defaults.color = textColor;

  const periodFilterEl = document.getElementById('period-filter');
  const periodFilter = periodFilterEl ? periodFilterEl.value : 'current';
  const activePeriod = getActivePeriodLabel();

  let targetPeriod = periodFilter === 'current' ? activePeriod : periodFilter;

  let filteredSales = salesData;
  if (targetPeriod !== 'all') {
    filteredSales = filteredSales.filter(sale => sale.period === targetPeriod);
  }

  const totalChkItems = document.querySelectorAll('.chk-product-item').length;
  if (selectedProductFilters.length > 0 && selectedProductFilters.length < totalChkItems) {
    filteredSales = filteredSales.filter(sale => selectedProductFilters.includes(sale.product));
  } else if (selectedProductFilters.length === 0 && totalChkItems > 0) {
    filteredSales = [];
  }

  // 1. Update Shares Doughnut Chart
  let diosgTotal = 0, aldiTotal = 0, jokoTotal = 0, ndineTotal = 0;
  filteredSales.forEach(sale => {
    const net = sale.commissionAmount - Math.round(sale.commissionAmount * 0.207);
    const sh = calcShares(net, sale.leadsSource);
    diosgTotal += sh.diosg;
    aldiTotal += sh.aldi;
    jokoTotal += sh.joko;
    ndineTotal += sh.ndine;
  });

  if (chartSharesInstance) {
    chartSharesInstance.data.datasets[0].data = [diosgTotal, aldiTotal, jokoTotal, ndineTotal];
    chartSharesInstance.update();
  }

  // 2. Update Products Bar Chart — Kuantitas vs Kualitas
  const productStats = {};
  filteredSales.forEach(sale => {
    const pName = sale.product || 'Lainnya';
    if (!productStats[pName]) {
      productStats[pName] = { count: 0, omzet: 0, netComm: 0 };
    }
    productStats[pName].count += 1;
    productStats[pName].omzet += (sale.dealPrice || sale.price || 0);
    const net = sale.commissionAmount - Math.round(sale.commissionAmount * 0.207);
    productStats[pName].netComm += net;
  });

  // Sort by count descending so highest-selling product appears first
  const pLabels = Object.keys(productStats).sort((a, b) => productStats[b].count - productStats[a].count);
  const pCount   = pLabels.map(k => productStats[k].count);
  const pOmzet   = pLabels.map(k => productStats[k].omzet);
  const pNetComm = pLabels.map(k => productStats[k].netComm);

  // Shorten labels
  const pLabelsTrunc = pLabels.map(l => l.length > 20 ? l.substring(0, 18) + '…' : l);

  if (chartProductsInstance) {
    if (chartProductsInstance.options.scales.yCount) chartProductsInstance.options.scales.yCount.grid.color = gridColor;
    chartProductsInstance.data.labels = pLabelsTrunc;
    chartProductsInstance.data.datasets[0].data = pCount;
    chartProductsInstance.data.datasets[1].data = pOmzet;
    chartProductsInstance.data.datasets[2].data = pNetComm;
    chartProductsInstance.update();
  }

  // 3. Update Trends Line Chart
  const periodMap = {};
  salesData.forEach(sale => {
    const p = sale.period || 'Lainnya';
    if (!periodMap[p]) periodMap[p] = { omset: 0, netComm: 0 };
    const dealPrice = sale.dealPrice || sale.price || 0;
    const net = sale.commissionAmount - Math.round(sale.commissionAmount * 0.207);
    periodMap[p].omset += dealPrice;
    periodMap[p].netComm += net;
  });

  const sortedPeriods = Object.keys(periodMap).sort((a, b) => {
    const getKey = (label) => {
      try {
        const m = label.match(/26\s([A-Za-z]+)\s(\d{4})/);
        if (m) {
          const monthIdx = MONTH_NAMES_ID.findIndex(n => n.toLowerCase().startsWith(m[1].toLowerCase()));
          return parseInt(m[2], 10) * 100 + monthIdx;
        }
      } catch (e) {}
      return 0;
    };
    return getKey(a) - getKey(b); // Ascending for trend
  });

  const tLabels = sortedPeriods.map(p => p.split(' - ')[0]);
  const tOmset = sortedPeriods.map(p => periodMap[p].omset);
  const tNet = sortedPeriods.map(p => periodMap[p].netComm);

  if (chartTrendsInstance) {
    if (chartTrendsInstance.options.scales.x) chartTrendsInstance.options.scales.x.grid.color = gridColor;
    if (chartTrendsInstance.options.scales.y) chartTrendsInstance.options.scales.y.grid.color = gridColor;
    chartTrendsInstance.data.labels = tLabels.length > 0 ? tLabels : ['Belum Ada Data'];
    chartTrendsInstance.data.datasets[0].data = tOmset.length > 0 ? tOmset : [0];
    chartTrendsInstance.data.datasets[1].data = tNet.length > 0 ? tNet : [0];
    chartTrendsInstance.update();
  }
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

  const leadsSource = document.getElementById('sale-leads-source').value;

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
      salesData[index].leadsSource = leadsSource;
      
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
      period: period,
      leadsSource: leadsSource
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
  updateCharts();

  // Switch back to Dashboard view after saving
  switchMainTab('dashboard');
}

// Edit a sale entry - Populate form with item details
window.editSale = function(id) {
  const sale = salesData.find(item => item.id === id);
  if (!sale) return;

  // Switch to Input Tab
  switchMainTab('input');

  const formHeaderTitle = document.getElementById('form-header-title');
  if (formHeaderTitle) formHeaderTitle.textContent = 'Edit Data Penjualan';

  document.getElementById('btn-reset-form').classList.remove('hidden');
  document.getElementById('btn-submit').querySelector('span').textContent = 'Perbarui Transaksi';
  
  document.getElementById('edit-id').value = sale.id;
  document.getElementById('sale-date').value = sale.date;
  document.getElementById('sale-product').value = sale.product;
  
  // Call product selection handler to disable/enable coupon radios
  handleProductSelection();

  // Populate leadsSource
  const leadsSourceEl = document.getElementById('sale-leads-source');
  if (leadsSourceEl) {
    leadsSourceEl.value = sale.leadsSource || '';
    const hint = document.getElementById('leads-source-hint');
    if (hint) hint.style.display = sale.leadsSource === 'fast-track' ? 'block' : 'none';
  }

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
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Cancel editing a sale, clear values to defaults
function cancelFormEdit() {
  const form = document.getElementById('sale-form');
  const editIdEl = document.getElementById('edit-id');
  const customRateGroup = document.getElementById('custom-commission-group');
  const resetFormBtn = document.getElementById('btn-reset-form');
  const submitBtnText = document.getElementById('btn-submit').querySelector('span');
  const formHeaderTitle = document.getElementById('form-header-title');

  if (formHeaderTitle) formHeaderTitle.textContent = 'Input Data Penjualan Baru';

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
  const dateEl = document.getElementById('sale-date');
  if (dateEl) dateEl.value = today.toISOString().split('T')[0];

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

// --- PAYOUT MODULE HELPER FUNCTIONS ---

async function handlePayoutFormSubmit(e) {
  e.preventDefault();

  const dateInput = document.getElementById('payout-date').value;
  const recipientInput = document.getElementById('payout-recipient').value;
  const amountInput = document.getElementById('payout-amount').value;
  const descInput = document.getElementById('payout-desc').value;

  const amount = getRawNumber(amountInput);
  if (amount <= 0) {
    showToast("Nominal transfer payout harus lebih dari Rp 0", "error");
    return;
  }

  if (!recipientInput) {
    showToast("Silakan pilih penerima payout", "error");
    return;
  }

  const period = getPeriodLabel(dateInput);

  // Show confirmation dialog before saving
  const confirmed = await showConfirmDialog(
    "Konfirmasi Pencatatan Payout",
    `Apakah Anda yakin ingin mencatat transfer pembayaran payout bagi hasil sebesar ${formatFullRupiah(amount)} kepada "${recipientInput}"?`,
    false
  );

  if (!confirmed) return;

  const newPayout = {
    id: 'payout_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    date: dateInput,
    recipient: recipientInput,
    amount: amount,
    description: descInput,
    period: period
  };

  try {
    payoutTransactionsData.push(newPayout);
    if (db) {
      await db.ref(`payout_transactions/${newPayout.id}`).set(newPayout);
      triggerSheetsSync(); // trigger Sheets sync
    }
    showToast(`Berhasil mencatat payout untuk ${recipientInput}!`);
    
    // Reset form fields (keep date as today)
    document.getElementById('payout-amount').value = '';
    document.getElementById('payout-desc').value = '';
    document.getElementById('payout-recipient').value = '';

    renderPayoutsTable();
  } catch (err) {
    console.error("Failed to save payout:", err);
    showToast("Gagal menyimpan transaksi payout.", "error");
  }
}

window.deletePayoutRecord = async function(id) {
  const payout = payoutTransactionsData.find(item => item.id === id);
  if (!payout) return;

  const confirmed = await showConfirmDialog(
    "Hapus Transaksi Payout",
    `Apakah Anda yakin ingin menghapus catatan payout kepada "${payout.recipient}" sebesar ${formatFullRupiah(payout.amount)}? Tindakan ini tidak dapat dibatalkan.`
  );

  if (!confirmed) return;

  try {
    payoutTransactionsData = payoutTransactionsData.filter(item => item.id !== id);
    if (db) {
      await db.ref(`payout_transactions/${id}`).remove();
      triggerSheetsSync(); // sync sheets
    }
    showToast("Catatan transaksi payout berhasil dihapus.");
    renderPayoutsTable();
  } catch (err) {
    console.error("Failed to delete payout:", err);
    showToast("Gagal menghapus catatan payout.", "error");
  }
};

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

  // 1. Filter sales transactions by period to calculate the total PORTIONS (Porsi)
  let filteredSales = salesData;
  if (targetPeriod !== 'all') {
    filteredSales = filteredSales.filter(sale => sale.period === targetPeriod);
  }

  let totalDiosgPorsi = 0;
  let totalAldiPorsi = 0;
  let totalJokoPorsi = 0;
  let totalNdinePorsi = 0;
  let hasNdineInPayout = false;

  filteredSales.forEach(sale => {
    const net = sale.commissionAmount - Math.round(sale.commissionAmount * 0.207);
    const sh = calcShares(net, sale.leadsSource);
    totalDiosgPorsi += sh.diosg;
    totalAldiPorsi  += sh.aldi;
    totalJokoPorsi  += sh.joko;
    totalNdinePorsi += sh.ndine;
    if (sh.isFastTrack) hasNdineInPayout = true;
  });

  // Display Portions
  document.getElementById('payout-total-diosg').textContent = formatFullRupiah(totalDiosgPorsi);
  document.getElementById('payout-total-aldi').textContent = formatFullRupiah(totalAldiPorsi);
  document.getElementById('payout-total-joko').textContent = formatFullRupiah(totalJokoPorsi);
  document.getElementById('payout-total-ndine').textContent = formatFullRupiah(totalNdinePorsi);

  // Show/Hide Ndine payout balance card
  const payoutCardNdine = document.getElementById('payout-card-ndine');
  if (payoutCardNdine) payoutCardNdine.style.display = hasNdineInPayout ? '' : 'none';
  const payoutLabelDiosg = document.getElementById('payout-label-diosg');
  if (payoutLabelDiosg) payoutLabelDiosg.textContent = hasNdineInPayout ? 'DIOSG (50%~)' : 'DIOSG (60%)';

  // 2. Filter payout transactions by period to calculate the total PAID (Sudah)
  let filteredPayouts = payoutTransactionsData;
  if (targetPeriod !== 'all') {
    filteredPayouts = filteredPayouts.filter(p => p.period === targetPeriod);
  }

  let totalDiosgPaid = 0;
  let totalAldiPaid = 0;
  let totalJokoPaid = 0;
  let totalNdinePaid = 0;

  filteredPayouts.forEach(p => {
    if (p.recipient === 'DIOSG') totalDiosgPaid += p.amount;
    else if (p.recipient === 'ALDI') totalAldiPaid += p.amount;
    else if (p.recipient === 'Joko') totalJokoPaid += p.amount;
    else if (p.recipient === 'Ndine') totalNdinePaid += p.amount;
  });

  // Display Paid
  document.getElementById('payout-paid-diosg').textContent = formatFullRupiah(totalDiosgPaid);
  document.getElementById('payout-paid-aldi').textContent = formatFullRupiah(totalAldiPaid);
  document.getElementById('payout-paid-joko').textContent = formatFullRupiah(totalJokoPaid);
  document.getElementById('payout-paid-ndine').textContent = formatFullRupiah(totalNdinePaid);

  // 3. Calculate and display remaining (Sisa)
  updatePayoutRemainingCalculations(
    totalDiosgPorsi, totalDiosgPaid,
    totalAldiPorsi, totalAldiPaid,
    totalJokoPorsi, totalJokoPaid,
    totalNdinePorsi, totalNdinePaid
  );

  // 4. Render the payout ledger table rows
  tbody.innerHTML = '';

  // Sort payout transactions by date descending
  filteredPayouts.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id);
  });

  if (filteredPayouts.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="5">
          <div class="empty-state-content">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <p>Belum ada riwayat pembayaran payout yang tercatat.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  filteredPayouts.forEach(item => {
    const row = document.createElement('tr');
    
    // Style recipient name badge
    let recipientColor = 'var(--text-main)';
    if (item.recipient === 'DIOSG') recipientColor = 'var(--color-primary)';
    else if (item.recipient === 'ALDI') recipientColor = 'var(--color-amber)';
    else if (item.recipient === 'Joko') recipientColor = 'var(--color-emerald)';
    else if (item.recipient === 'Ndine') recipientColor = '#f59e0b';

    row.innerHTML = `
      <td class="table-date">${formatDisplayDate(item.date)}</td>
      <td style="text-align: center;"><span style="color: ${recipientColor}; font-weight: 700; background: rgba(255,255,255,0.02); padding: 4px 10px; border-radius: 50px; border: 1px solid var(--border-color); font-size: 11px;">${escapeHTML(item.recipient)}</span></td>
      <td style="text-align: right; font-weight: 700; color: #fff;" class="table-price">${formatNumberRupiah(item.amount)}</td>
      <td style="font-weight: 500; font-size: 13px;">${escapeHTML(item.description || 'Tanpa catatan')}</td>
      <td style="text-align: center;">
        <button type="button" class="btn-action btn-delete" onclick="deletePayoutRecord('${item.id}')" title="Hapus catatan payout">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function updatePayoutRemainingCalculations(
  totalDiosg, paidDiosg,
  totalAldi, paidAldi,
  totalJoko, paidJoko,
  totalNdine = 0, paidNdine = 0
) {
  const remDiosgEl = document.getElementById('payout-remaining-diosg');
  const remAldiEl = document.getElementById('payout-remaining-aldi');
  const remJokoEl = document.getElementById('payout-remaining-joko');
  const remNdineEl = document.getElementById('payout-remaining-ndine');

  if (!remDiosgEl || !remAldiEl || !remJokoEl) return;

  const remDiosg = totalDiosg - paidDiosg;
  const remAldi = totalAldi - paidAldi;
  const remJoko = totalJoko - paidJoko;
  const remNdine = totalNdine - paidNdine;

  const displayRemaining = (val, el) => {
    if (!el) return;
    el.textContent = formatFullRupiah(val);
    if (val <= 0) {
      el.className = "sisa-val lunas";
    } else {
      el.className = "sisa-val";
    }
  };

  displayRemaining(remDiosg, remDiosgEl);
  displayRemaining(remAldi, remAldiEl);
  displayRemaining(remJoko, remJokoEl);
  displayRemaining(remNdine, remNdineEl);
}
