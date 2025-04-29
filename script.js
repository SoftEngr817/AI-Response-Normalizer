const SETTINGS_KEY = "simpleTextToolSettings";

function loadSettings() {
  return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
}
function saveSettings(obj) {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ ...loadSettings(), ...obj })
  );
}

/* filters */
const filters = {
  trimBlanks: (t) => t.replace(/^(?:\s*[\r\n])+|(?:\s*[\r\n])+$/g, ""),
  collapseBlanks: (t) => t.replace(/(\r?\n){2,}/g, "\n\n"),
  bold: (t) => t.replace(/\*\*(.*?)\*\*|__(.*?)__/g, "$1$2"),
  italic: (t) => t.replace(/\*(.*?)\*|_(.*?)_/g, "$1$2"),
  code: (t) => t.replace(/`{1,3}([^`]*)`{1,3}/g, "$1"),
  linkText: (t) => t.replace(/\[([^\]]+)]\([^)]*\)/g, "$1"),
  linkURL: (t) =>
    t.replace(
      /\[([^\]]+)]\((https?:\/\/)?(www\.)?([^/)]+)([^)]*?)\)/gi,
      (m, _text, _p, _w, domain, rest) => domain + rest.replace(/\/$/, "")
    ),
  check2dash: (t) => t.replace(/✅/g, "-"),
};

function normalizeAlways(raw) {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/[‘’‛‹›]/g, "'")
    .replace(/[“”«»„″]/g, '"');
}

function function_1(raw) {
  let out = normalizeAlways(raw);
  const active = [
    ...document.querySelectorAll("#filter-group input:checked"),
  ].map((cb) => cb.value);
  active.forEach((k) => (out = filters[k](out)));
  return out;
}

function showToast(msg, ms = 2500) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.opacity = "1";
  setTimeout(() => (t.style.opacity = "0"), ms);
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("input");
  const output = document.getElementById("output");
  const copyBtn = document.getElementById("copy-btn");
  const filterGroup = document.getElementById("filter-group");
  const settingsBtn = document.getElementById("open-settings");
  const settingsModal = document.getElementById("settings-modal");
  const fontSizeIn = document.getElementById("font-size");
  const fontFamilyIn = document.getElementById("font-family");
  const saveBtn = document.getElementById("save-settings");

  /* apply saved prefs */
  const saved = loadSettings();
  if (saved.fontSize)
    document.documentElement.style.setProperty(
      "--font-size",
      saved.fontSize + "px"
    );
  if (saved.fontFamily)
    document.documentElement.style.setProperty(
      "--font-family",
      saved.fontFamily
    );
  if (saved.filters) {
    [...filterGroup.querySelectorAll("input")].forEach((cb) => {
      cb.checked = saved.filters.includes(cb.value);
    });
  }

  const process = () => {
    output.textContent = function_1(input.value);
  };
  input.addEventListener("input", process);
  filterGroup.addEventListener("change", () => {
    saveSettings({
      filters: [...filterGroup.querySelectorAll("input:checked")].map(
        (cb) => cb.value
      ),
    });
    process();
  });
  copyBtn.addEventListener("click", () => {
    navigator.clipboard
      .writeText(output.textContent)
      .then(() => showToast("Copied!"))
      .catch((e) => showToast("Copy failed", 3000));
  });

  settingsBtn.addEventListener("click", () => settingsModal.showModal());
  if (saved.fontSize) fontSizeIn.value = saved.fontSize;
  if (saved.fontFamily) fontFamilyIn.value = saved.fontFamily;
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    saveSettings({
      fontSize: parseInt(fontSizeIn.value, 10) || undefined,
      fontFamily: fontFamilyIn.value.trim() || undefined,
    });
    settingsModal.close();
  });

  process();
});
