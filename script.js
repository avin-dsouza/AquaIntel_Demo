/* =============================================
   AquaIntel — app.js
   ============================================= */

const STORAGE_KEY = 'aquaintel_records_v2';

/* --- Lookup table for source labels --- */
const SOURCE_LABELS = {
  municipal_tap: 'Municipal Tap',
  borewell:      'Borewell',
  open_well:     'Open Well',
  river:         'River',
  lake:          'Lake/Pond',
  rainwater:     'Rainwater',
  tanker:        'Tanker',
  spring:        'Spring',
};

/* =============================================
   LOCAL STORAGE HELPERS
   ============================================= */

function getRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/* =============================================
   RANGE SLIDER DISPLAY
   ============================================= */

/**
 * Updates the display value next to a range slider.
 * @param {string} inputId   - ID of the <input type="range">
 * @param {string} outputId  - ID of the <span> showing the value
 * @param {number} [decimals] - decimal places to show (default 0)
 */
function updateRange(inputId, outputId, decimals) {
  const value = parseFloat(document.getElementById(inputId).value);
  document.getElementById(outputId).textContent =
    decimals ? value.toFixed(decimals) : value;
}

/* =============================================
   TOAST NOTIFICATION
   ============================================= */

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

/* =============================================
   SHOP — ADD TO CART
   ============================================= */

function addToCart(name, price) {
  showToast(`✓ ${name} (${price}) added to cart!`);
}

/* =============================================
   WATER QUALITY LOGIC
   ============================================= */

/**
 * Determines drinking water safety status.
 * Uses WHO / BIS drinking water guidelines.
 */
function getStatus(tds, ph, hardness, doVal) {
  const issues   = [];
  const warnings = [];

  if      (tds > 1000)              issues.push('TDS too high');
  else if (tds > 500)               warnings.push('TDS elevated');

  if      (ph < 6.0 || ph > 9.0)   issues.push('pH unsafe');
  else if (ph < 6.5 || ph > 8.5)   warnings.push('pH borderline');

  if      (hardness > 300)          issues.push('Very hard water');
  else if (hardness > 200)          warnings.push('Water is hard');

  if      (doVal < 2)               issues.push('DO critically low');
  else if (doVal < 5)               warnings.push('DO low');

  if (issues.length > 0)   return 'unsafe';
  if (warnings.length > 0) return 'caution';
  return 'safe';
}

/**
 * Determines agricultural water safety status.
 * Agriculture tolerates higher TDS and wider pH range.
 */
function getAgriStatus(tds, ph) {
  if (tds > 3000 || ph < 5.5 || ph > 9.5) return 'unsafe';
  if (tds > 1500 || ph < 6.0 || ph > 8.5) return 'caution';
  return 'safe';
}

/* =============================================
   STATUS BADGE COLOR HELPERS
   ============================================= */

function getBadgeBorderColor(status) {
  if (status === 'safe')    return '#639922';
  if (status === 'caution') return '#EF9F27';
  return '#E24B4A';
}

/* =============================================
   MAIN ANALYZE FUNCTION
   ============================================= */

async function analyzeWater() {
  /* --- Read inputs --- */
  const postcode = document.getElementById('postcode').value.trim();
  const source   = document.getElementById('source').value;

  if (!postcode || !source) {
    showToast('⚠️ Please fill in postcode and source');
    return;
  }

  const tds      = parseFloat(document.getElementById('tds').value);
  const ph       = parseFloat(document.getElementById('ph').value);
  const hardness = parseFloat(document.getElementById('hardness').value);
  const doVal    = parseFloat(document.getElementById('do').value);
  const notes    = document.getElementById('notes').value.trim();

  /* --- Calculate status --- */
  const status     = getStatus(tds, ph, hardness, doVal);
  const agriStatus = getAgriStatus(tds, ph);

  /* --- Show result section --- */
  const resultSection = document.getElementById('result-section');
  resultSection.style.display = 'block';
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  /* --- Update result card --- */
  const card = document.getElementById('result-card');
  card.className = `result-card ${status}`;

  const statusConfig = {
    safe:    { icon: '✅', title: 'Water Appears Safe',   sub: 'Results are within acceptable parameters.' },
    caution: { icon: '⚠️', title: 'Use With Caution',     sub: 'Some parameters are borderline. Further testing recommended.' },
    unsafe:  { icon: '🚫', title: 'Water Unsafe',         sub: 'Critical parameters exceeded. Do not use for drinking.' },
  };

  const cfg = statusConfig[status];
  document.getElementById('result-icon').textContent  = cfg.icon;
  document.getElementById('result-title').textContent = cfg.title;
  document.getElementById('result-sub').textContent   = cfg.sub;

  /* --- Status badges --- */
  const drinkColor = getBadgeBorderColor(status);
  const agriColor  = getBadgeBorderColor(agriStatus);

  document.getElementById('result-badges').innerHTML = `
    <span class="result-badge ${status}"    style="border-color:${drinkColor}">Drinking: ${status.toUpperCase()}</span>
    <span class="result-badge ${agriStatus}" style="border-color:${agriColor}">Agriculture: ${agriStatus.toUpperCase()}</span>
  `;

  /* --- Reading summary --- */
  document.getElementById('result-detail').innerHTML = `
    <strong>Readings:</strong>
    TDS: ${tds} ppm &nbsp;|&nbsp;
    pH: ${ph} &nbsp;|&nbsp;
    Hardness: ${hardness} mg/L &nbsp;|&nbsp;
    DO: ${doVal} mg/L<br/>
    <strong>Source:</strong> ${SOURCE_LABELS[source]} &nbsp;|&nbsp;
    <strong>Location:</strong> ${postcode}
  `;

  /* --- AI loading state --- */
  document.getElementById('ai-text').innerHTML =
    '<span class="loading-dots"><span></span><span></span><span></span></span> Analyzing with AI...';

  /* --- Save to local storage --- */
  const record = {
    id:          Date.now(),
    date:        new Date().toLocaleDateString('en-IN'),
    postcode,
    source,
    tds,
    ph,
    hardness,
    do:          doVal,
    notes,
    status,
    agriStatus,
  };

  const records = getRecords();
  records.push(record);
  saveRecords(records);

  updateStats();
  renderTable();

  /* --- Call Claude API for AI analysis --- */
  try {
    const prompt = `You are a water quality expert. Analyze the following water test results and give a brief, practical report (3-4 sentences max):
- Location: Postcode ${postcode}, ${SOURCE_LABELS[source]}
- TDS: ${tds} ppm
- pH: ${ph}
- Hardness: ${hardness} mg/L CaCO₃
- Dissolved Oxygen: ${doVal} mg/L
- Notes: ${notes || 'None'}
Overall status: ${status} for drinking, ${agriStatus} for agriculture.
Explain what these values mean practically, mention any specific concerns, and give one actionable recommendation. Be concise and clear for a non-expert.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 350,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    const data      = await response.json();
    const aiText    = data.content?.map(b => b.text || '').join('') || 'Analysis unavailable.';
    document.getElementById('ai-text').textContent = aiText;

  } catch (err) {
    console.error('AI analysis error:', err);
    document.getElementById('ai-text').textContent =
      'AI analysis unavailable. Please check your connection.';
  }
}

/* =============================================
   STATS BAR (hero + data section)
   ============================================= */

function updateStats() {
  const records = getRecords();

  const safeCount = records.filter(r => r.status === 'safe').length;
  const agSafe    = records.filter(r => r.agriStatus === 'safe').length;
  const areas     = new Set(records.map(r => r.postcode)).size;
  const avgTds    = records.length
    ? Math.round(records.reduce((sum, r) => sum + r.tds, 0) / records.length)
    : null;
  const safePct   = records.length
    ? Math.round((safeCount / records.length) * 100)
    : null;

  /* Hero stats */
  document.getElementById('stat-tests').textContent = records.length;
  document.getElementById('stat-areas').textContent = areas;
  document.getElementById('stat-safe').textContent  = safePct !== null ? safePct + '%' : '—';

  /* Data section stats */
  document.getElementById('d-total').textContent   = records.length;
  document.getElementById('d-safe').textContent    = safeCount;
  document.getElementById('d-ag').textContent      = agSafe;
  document.getElementById('d-avg-tds').textContent = avgTds !== null ? avgTds : '—';
}

/* =============================================
   DATA TABLE RENDER
   ============================================= */

function renderTable() {
  const pin = document.getElementById('search-pin').value.trim().toLowerCase();
  const src = document.getElementById('filter-source').value;
  const sts = document.getElementById('filter-status').value;

  let records = getRecords().sort((a, b) => b.id - a.id); // newest first

  if (pin) records = records.filter(r => r.postcode.toLowerCase().includes(pin));
  if (src) records = records.filter(r => r.source === src);
  if (sts) records = records.filter(r => r.status === sts);

  const tbody      = document.getElementById('data-tbody');
  const emptyState = document.getElementById('empty-state');

  if (!records.length) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  tbody.innerHTML = records.map(r => `
    <tr>
      <td class="td-date">${r.date}</td>
      <td><strong>${r.postcode}</strong></td>
      <td class="td-source">${SOURCE_LABELS[r.source] || r.source}</td>
      <td>${r.tds}</td>
      <td>${parseFloat(r.ph).toFixed(1)}</td>
      <td>${r.hardness}</td>
      <td>${parseFloat(r.do).toFixed(1)}</td>
      <td><span class="status-pill ${r.status}">${r.status}</span></td>
      <td><span class="status-pill ${r.agriStatus}">${r.agriStatus}</span></td>
    </tr>
  `).join('');
}

/* =============================================
   FILTER CONTROLS
   ============================================= */

function clearFilters() {
  document.getElementById('search-pin').value    = '';
  document.getElementById('filter-source').value = '';
  document.getElementById('filter-status').value = '';
  renderTable();
}

/* =============================================
   INIT — run on page load
   ============================================= */

updateStats();
renderTable();