
/* ========= Settings ========= */
const SETTINGS_KEY = 'simpleTextToolSettings';

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  if (saved.fontSize) document.documentElement.style.setProperty('--font-size', saved.fontSize + 'px');
  if (saved.fontFamily) document.documentElement.style.setProperty('--font-family', saved.fontFamily);
  return saved;
}

function saveSettings(fontSize, fontFamily) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fontSize, fontFamily }));
  loadSettings();
}

/* ========= Core Functionalities ========= */
function function_1(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()); // trim both ends
  const cleaned = [];
  let lastBlank = false;
  for (const line of lines) {
    const isBlank = line === '';
    if (isBlank && lastBlank) continue;
    cleaned.push(line);
    lastBlank = isBlank;
  }
  return cleaned.join('\n');
}

function function_2(raw) { return raw.toUpperCase(); }
function function_3(raw) { return raw; }

const FUNC_MAP = {
  function_1,
  function_2,
  function_3
};

/* ========= Toast helper ========= */
function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

/* ========= Runner ========= */
function process() {
  const inputVal = document.getElementById('input').value;
  const selectedFunc = document.querySelector('input[name="func"]:checked').value;
  const output = document.getElementById('output');
  output.textContent = FUNC_MAP[selectedFunc](inputVal);
}

/* ========= UI Handlers ========= */
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('input');
  const copyBtn = document.getElementById('copy-btn');
  const settingsBtn = document.getElementById('open-settings');
  const settingsModal = document.getElementById('settings-modal');
  const fontSizeInput = document.getElementById('font-size');
  const fontFamilyInput = document.getElementById('font-family');
  const saveSettingsBtn = document.getElementById('save-settings');
  const radioGroup = document.getElementById('func-group');

  // Load existing settings
  const current = loadSettings();
  if (current.fontSize) fontSizeInput.value = current.fontSize;
  if (current.fontFamily) fontFamilyInput.value = current.fontFamily;

  // listeners
  input.addEventListener('input', process);
  radioGroup.addEventListener('change', process);

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('output').textContent)
      .then(() => showToast('Copied to clipboard!'))
      .catch(err => showToast('Copy failed: ' + err, 3000));
  });

  settingsBtn.addEventListener('click', () => settingsModal.showModal());

  saveSettingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const size = parseInt(fontSizeInput.value, 10);
    const family = fontFamilyInput.value.trim();
    saveSettings(size, family);
    settingsModal.close();
  });

  // initial
  process();
});
