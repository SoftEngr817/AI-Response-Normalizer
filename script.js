'use strict';

/* ---------------------------------------------------------------- data ---- */

const SETTINGS_KEY = 'simpleTextToolSettings';
const LINK_MODES = ['keep', 'text', 'url'];
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_FAMILY = 'monospace';

const DEFAULT_RULES = [{ find: '✅', replace: '-', enabled: true }];

const EXAMPLE_RULES = [
  { find: '* ', replace: '- ', enabled: true },
  { find: '🔹', replace: '-', enabled: true },
  { find: '### ', replace: '', enabled: true },
  { find: '## ', replace: '', enabled: true },
  { find: ' — ', replace: ' -- ', enabled: true },
  { find: '—', replace: ' - ', enabled: true },
  { find: '–', replace: '-', enabled: true },
  { find: '> ', replace: '', enabled: true }
];

const SAMPLE_TEXT = [
  '',
  '',
  '## Quick summary',
  '',
  '',
  'Here is **why it matters**: the *dash* problem — and the `--flag` you need.',
  '',
  '',
  '* Read the [official guide](https://example.com/guide/) first',
  '* ✅ Then run `npm install`',
  '',
  '> “Smart quotes” and trailing spaces come along for the ride.   ',
  '',
  ''
].join('\n');

const ALWAYS_ON = {
  id: 'always',
  label: 'Always on',
  desc: 'Two things happen to every response, with no toggle: spaces hanging off the end of a line are removed, and curly quotes become straight ones. Here ␣ stands for a space.',
  example: { before: '“Ready”␣␣␣\nto go\u2019s␣', after: '"Ready"\nto go\'s' }
};

const FILTERS = [
  {
    id: 'trimBlanks',
    label: 'Trim blank edges',
    title: 'Trim blank lines at the start and end',
    desc: 'Removes empty lines sitting before the first line and after the last line. Blank lines in the middle are left alone.',
    pattern: /^(?:\s*[\r\n])+|(?:\s*[\r\n])+$/g,
    replacement: '',
    example: { before: '\n\nHere is the summary.\n\n', after: 'Here is the summary.' }
  },
  {
    id: 'collapseBlanks',
    label: 'Collapse blank lines',
    title: 'Collapse repeated blank lines',
    desc: 'Where two or more blank lines pile up, only one is kept. Useful because AI answers often double-space their paragraphs.',
    pattern: /(?:\r?\n){3,}/g,
    replacement: '\n\n',
    example: { before: 'First point.\n\n\n\nSecond point.', after: 'First point.\n\nSecond point.' }
  },
  {
    id: 'bold',
    label: 'Remove bold',
    title: 'Remove bold marks',
    desc: 'Drops the ** or __ wrapped around bold text and keeps the words themselves.',
    pattern: /(^|[\s\W])(\*\*|__)(?=\S)([\s\S]*?\S)\2(?!\w)/g,
    replacement: '$1$3',
    example: { before: 'This is **important** to note.', after: 'This is important to note.' }
  },
  {
    id: 'italic',
    label: 'Remove italic',
    title: 'Remove italic marks',
    desc: 'Drops the single * or _ wrapped around italic text and keeps the words themselves.',
    pattern: /(^|[\s\W])(\*|_)(?=\S)([^\r]*?\S)\2(?!\w)/g,
    replacement: '$1$3',
    example: { before: 'A *small* aside.', after: 'A small aside.' }
  },
  {
    id: 'code',
    label: 'Remove code marks',
    title: 'Remove inline code marks',
    desc: 'Removes the backticks around inline code, leaving the code text in place. Turn this off when the backticks matter.',
    pattern: /`{1,3}([^`]*)`{1,3}/g,
    replacement: '$1',
    example: { before: 'Run `npm install` first.', after: 'Run npm install first.' }
  }
];

const LINK_STEP = {
  id: 'links',
  label: 'Links',
  title: 'Markdown links',
  desc: 'A Markdown link looks like [text](https://example.com). Choose whether to keep it whole, keep only the words, or keep only the address.',
  modes: {
    keep: {
      label: 'Keep',
      hint: 'Leave links exactly as they are.',
      example: { before: 'See [the docs](https://example.com/guide/).', after: 'See [the docs](https://example.com/guide/).' }
    },
    text: {
      label: 'To text',
      hint: 'Keep the words, drop the address.',
      pattern: /\[([^\]]+)]\([^)]*\)/g,
      replacement: '$1',
      example: { before: 'See [the docs](https://example.com/guide/).', after: 'See the docs.' }
    },
    url: {
      label: 'To URL',
      hint: 'Keep the address, drop the words.',
      pattern: /\[[^\]]+]\((https?:\/\/[^)]+)\)/gi,
      replacement: (match, url) => url.replace(/\/$/, ''),
      example: { before: 'See [the docs](https://example.com/guide/).', after: 'See https://example.com/guide.' }
    }
  }
};

const PRESETS = {
  plain: { filters: ['trimBlanks', 'collapseBlanks', 'bold', 'italic', 'code'], linkMode: 'text' },
  light: { filters: ['trimBlanks', 'collapseBlanks'], linkMode: 'keep' },
  none: { filters: [], linkMode: 'keep' }
};

/* --------------------------------------------------------------- state ---- */

const state = {
  filters: new Set(),
  linkMode: 'keep',
  rules: [],
  savedRules: [],
  rulesOpen: false,
  fontSize: DEFAULT_FONT_SIZE,
  fontFamily: DEFAULT_FONT_FAMILY
};

let uidCounter = 0;
const nextUid = () => `r${++uidCounter}`;

const el = id => document.getElementById(id);
const chipRefs = new Map();
const filterIds = new Set(FILTERS.map(f => f.id));

/* ------------------------------------------------------------- storage ---- */

function readStored() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettings(patch) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readStored(), ...patch }));
  } catch {
    toast('This browser refused to save your preferences.');
  }
}

function coerceRule(value) {
  if (!value || typeof value !== 'object' || typeof value.find !== 'string') return null;
  return {
    find: value.find,
    replace: typeof value.replace === 'string' ? value.replace : '',
    enabled: value.enabled !== false
  };
}

function rulesFromMap(map) {
  return Object.keys(map)
    .filter(key => typeof map[key] === 'string' || typeof map[key] === 'number')
    .map(key => ({ find: key, replace: String(map[key]), enabled: true }));
}

function rulesFromJson(data) {
  if (Array.isArray(data)) return data.map(coerceRule).filter(Boolean);
  if (data && typeof data === 'object') return rulesFromMap(data);
  return null;
}

const withUids = rules => rules.map(rule => ({ ...rule, uid: nextUid() }));
const stripUids = rules => rules.map(({ find, replace, enabled }) => ({ find, replace, enabled }));

/* Older versions stored rules as { customMap: { find: replace } } and folded the two
   link filters into the filter list. Both shapes are read here and left in place. */
function loadState() {
  const stored = readStored();

  const storedRules = Array.isArray(stored.rules) ? stored.rules.map(coerceRule).filter(Boolean) : null;
  const legacyRules = stored.customMap && typeof stored.customMap === 'object' ? rulesFromMap(stored.customMap) : null;
  state.rules = withUids(storedRules || legacyRules || DEFAULT_RULES);
  state.savedRules = stripUids(state.rules);

  if (Array.isArray(stored.activeFilters)) {
    state.filters = new Set(stored.activeFilters.filter(id => filterIds.has(id)));
    state.linkMode = LINK_MODES.includes(stored.linkMode) ? stored.linkMode : 'keep';
  } else if (Array.isArray(stored.filters)) {
    state.filters = new Set(stored.filters.filter(id => filterIds.has(id)));
    state.linkMode = stored.filters.includes('linkText') ? 'text'
      : stored.filters.includes('linkURL') ? 'url'
        : 'keep';
  } else {
    state.filters = new Set(PRESETS.plain.filters);
    state.linkMode = PRESETS.plain.linkMode;
  }

  state.fontSize = Number(stored.fontSize) > 0 ? Number(stored.fontSize) : DEFAULT_FONT_SIZE;
  state.fontFamily = stored.fontFamily || DEFAULT_FONT_FAMILY;
  state.rulesOpen = typeof stored.rulesOpen === 'boolean' ? stored.rulesOpen : window.innerWidth >= 1100;
}

/* ------------------------------------------------------------ pipeline ---- */

const normalizeAlways = raw => raw
  .split(/\r?\n/)
  .map(line => line.replace(/\s+$/g, ''))
  .join('\n')
  .replace(/[‘’‛‹›]/g, "'")
  .replace(/[“”«»„″]/g, '"');

function pipelineSteps() {
  const steps = FILTERS.map(filter => ({
    id: filter.id,
    pattern: filter.pattern,
    replacement: filter.replacement,
    enabled: state.filters.has(filter.id)
  }));

  const variant = state.linkMode === 'keep' ? LINK_STEP.modes.text : LINK_STEP.modes[state.linkMode];
  steps.push({
    id: LINK_STEP.id,
    pattern: variant.pattern,
    replacement: variant.replacement,
    enabled: state.linkMode !== 'keep'
  });

  return steps;
}

function countMatches(text, pattern) {
  if (!pattern || !text) return 0;
  const found = text.match(pattern);
  return found ? found.length : 0;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

/* Counts are taken at each step's own turn in the pipeline, so a filter reports
   what it would do to the text as it actually reaches it. */
function runPipeline(raw, rules) {
  let text = normalizeAlways(raw);
  const filterCounts = {};

  for (const step of pipelineSteps()) {
    filterCounts[step.id] = countMatches(text, step.pattern);
    if (step.enabled && step.pattern) text = text.replace(step.pattern, step.replacement);
  }

  const ruleHits = rules.map(rule => {
    if (!rule.find) return 0;
    const hits = countOccurrences(text, rule.find);
    if (rule.enabled && hits) text = text.split(rule.find).join(rule.replace);
    return hits;
  });

  return { text, filterCounts, ruleHits };
}

/* ---------------------------------------------------------------- misc ---- */

let toastTimer;
function toast(message, duration = 2400) {
  const node = el('toast');
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), duration);
}

function describeText(text) {
  if (!text) return 'empty';
  const lines = text.split('\n').length;
  const words = (text.match(/\S+/g) || []).length;
  return `${lines.toLocaleString()} lines · ${words.toLocaleString()} words · ${text.length.toLocaleString()} chars`;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`);
  svg.appendChild(use);
  return svg;
}

function exampleNode(example) {
  const pair = document.createElement('div');
  pair.className = 'example-pair';

  const column = (label, text) => {
    const wrap = document.createElement('div');
    wrap.className = 'example-col';
    const tag = document.createElement('span');
    tag.className = 'example-label';
    tag.textContent = label;
    const pre = document.createElement('pre');
    pre.textContent = text;
    wrap.append(tag, pre);
    return wrap;
  };

  const arrow = document.createElement('span');
  arrow.className = 'example-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';

  pair.append(column('Before', example.before), arrow, column('After', example.after));
  return pair;
}

/* ---------------------------------------------------------- filter bar ---- */

function infoButton(label, describe) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip-info';
  button.setAttribute('aria-label', `About ${label}`);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'popover');
  button.appendChild(icon('i-info'));
  button.addEventListener('click', event => {
    event.stopPropagation();
    togglePopover(button, describe());
  });
  return button;
}

function buildFilterBar() {
  const bar = el('filter-bar');
  bar.textContent = '';
  chipRefs.clear();

  const alwaysWrap = document.createElement('div');
  alwaysWrap.className = 'chip-wrap';
  const alwaysChip = document.createElement('span');
  alwaysChip.className = 'chip chip-static';
  alwaysChip.textContent = ALWAYS_ON.label;
  alwaysWrap.append(alwaysChip, infoButton(ALWAYS_ON.label, () => ({
    title: ALWAYS_ON.label,
    desc: ALWAYS_ON.desc,
    example: ALWAYS_ON.example,
    helpTarget: `help-filter-${ALWAYS_ON.id}`
  })));
  bar.appendChild(alwaysWrap);

  FILTERS.forEach(filter => {
    const wrap = document.createElement('div');
    wrap.className = 'chip-wrap';

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.filter = filter.id;
    chip.setAttribute('aria-pressed', 'false');

    const label = document.createElement('span');
    label.textContent = filter.label;
    const count = document.createElement('span');
    count.className = 'chip-count';
    count.setAttribute('aria-hidden', 'true');
    count.textContent = '–';
    chip.append(label, count);

    chip.addEventListener('click', () => {
      if (state.filters.has(filter.id)) state.filters.delete(filter.id);
      else state.filters.add(filter.id);
      persistFilters();
      syncFilterBar();
      render();
    });

    wrap.append(chip, infoButton(filter.label, () => ({
      title: filter.title || filter.label,
      desc: filter.desc,
      example: filter.example,
      helpTarget: `help-filter-${filter.id}`
    })));
    bar.appendChild(wrap);
    chipRefs.set(filter.id, { chip, count });
  });

  const segmented = document.createElement('div');
  segmented.className = 'chip-wrap';

  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', LINK_STEP.title);

  const groupLabel = document.createElement('span');
  groupLabel.className = 'segmented-label';
  groupLabel.textContent = LINK_STEP.label;

  const counter = document.createElement('span');
  counter.className = 'chip-count';
  counter.setAttribute('aria-hidden', 'true');
  counter.textContent = '–';
  group.append(groupLabel, counter);
  chipRefs.set(LINK_STEP.id, { chip: null, count: counter });

  LINK_MODES.forEach(mode => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'seg';
    button.dataset.linkMode = mode;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.title = LINK_STEP.modes[mode].hint;
    button.textContent = LINK_STEP.modes[mode].label;
    button.addEventListener('click', () => setLinkMode(mode));
    button.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
          : 0;
      if (!step) return;
      event.preventDefault();
      const index = LINK_MODES.indexOf(state.linkMode);
      const next = LINK_MODES[(index + step + LINK_MODES.length) % LINK_MODES.length];
      setLinkMode(next);
      group.querySelector(`[data-link-mode="${next}"]`).focus();
    });
    group.appendChild(button);
  });

  segmented.append(group, infoButton(LINK_STEP.title, () => ({
    title: LINK_STEP.title,
    desc: LINK_STEP.desc,
    example: LINK_STEP.modes[state.linkMode === 'keep' ? 'text' : state.linkMode].example,
    helpTarget: 'help-filter-links'
  })));
  bar.appendChild(segmented);
}

function persistFilters() {
  writeSettings({ activeFilters: [...state.filters], linkMode: state.linkMode });
}

function setLinkMode(mode) {
  state.linkMode = mode;
  persistFilters();
  syncFilterBar();
  render();
}

function syncFilterBar() {
  FILTERS.forEach(filter => {
    const ref = chipRefs.get(filter.id);
    if (ref) ref.chip.setAttribute('aria-pressed', String(state.filters.has(filter.id)));
  });
  document.querySelectorAll('[data-link-mode]').forEach(button => {
    const active = button.dataset.linkMode === state.linkMode;
    button.setAttribute('aria-checked', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  syncPreset();
}

function syncPreset() {
  const current = [...state.filters].sort().join(',');
  const match = Object.keys(PRESETS).find(key => {
    const preset = PRESETS[key];
    return preset.filters.slice().sort().join(',') === current && preset.linkMode === state.linkMode;
  });
  el('preset-select').value = match || 'custom';
}

function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  state.filters = new Set(preset.filters);
  state.linkMode = preset.linkMode;
  persistFilters();
  syncFilterBar();
  render();
}

function updateFilterCounts(counts) {
  const describe = (ref, count, label) => {
    if (!ref) return;
    ref.count.textContent = count > 0 ? String(count) : '–';
    ref.count.dataset.hits = count > 0 ? 'yes' : 'no';
    const summary = count > 0
      ? `${count} ${count === 1 ? 'match' : 'matches'} in the current text`
      : 'nothing to change in the current text';
    if (ref.chip) ref.chip.setAttribute('aria-label', `${label}: ${summary}`);
    ref.count.title = summary;
  };

  FILTERS.forEach(filter => describe(chipRefs.get(filter.id), counts[filter.id] || 0, filter.label));
  describe(chipRefs.get(LINK_STEP.id), counts[LINK_STEP.id] || 0, LINK_STEP.label);
}

/* ------------------------------------------------------------ popover ---- */

let popoverAnchor = null;

function closePopover() {
  const popover = el('popover');
  if (popover.hidden) return;
  popover.hidden = true;
  if (popoverAnchor) {
    popoverAnchor.setAttribute('aria-expanded', 'false');
    if (popover.contains(document.activeElement)) popoverAnchor.focus();
  }
  popoverAnchor = null;
}

function togglePopover(anchor, content) {
  if (popoverAnchor === anchor) {
    closePopover();
    return;
  }
  closePopover();

  const popover = el('popover');
  el('popover-title').textContent = content.title;
  el('popover-desc').textContent = content.desc;

  const holder = el('popover-example');
  holder.textContent = '';
  if (content.example) holder.appendChild(exampleNode(content.example));

  const learn = el('popover-learn');
  learn.hidden = !content.helpTarget;
  learn.dataset.target = content.helpTarget || '';

  popover.hidden = false;
  popoverAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');

  const box = popover.getBoundingClientRect();
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.left - 8), window.innerWidth - box.width - 8);
  const below = rect.bottom + 8;
  const top = below + box.height > window.innerHeight - 8
    ? Math.max(8, rect.top - box.height - 8)
    : below;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.focus();
}

/* --------------------------------------------------------------- rules ---- */

const ruleByUid = uid => state.rules.find(rule => rule.uid === uid);
const meaningfulRules = rules => rules.filter(rule => rule.find !== '');
const serializeRules = rules => JSON.stringify(meaningfulRules(rules).map(r => [r.find, r.replace, r.enabled !== false]));
const rulesDirty = () => serializeRules(state.rules) !== serializeRules(state.savedRules);

function updateWsFlag(input) {
  const flag = input.parentElement.querySelector('.ws-flag');
  if (flag) flag.hidden = !/^\s|\s$/.test(input.value);
}

function ruleRow(rule) {
  const row = el('rule-template').content.firstElementChild.cloneNode(true);
  row.dataset.uid = rule.uid;
  row.classList.toggle('is-off', !rule.enabled);

  const toggle = row.querySelector('.rule-enabled');
  toggle.checked = rule.enabled;
  toggle.setAttribute('aria-label', 'Apply this rule');
  row.querySelector('.switch-text').textContent = rule.enabled ? 'On' : 'Off';

  const find = row.querySelector('.rule-find');
  const replace = row.querySelector('.rule-replace');
  find.value = rule.find;
  replace.value = rule.replace;
  find.setAttribute('aria-label', 'Find this text');
  replace.setAttribute('aria-label', 'Replace it with');
  updateWsFlag(find);
  updateWsFlag(replace);

  return row;
}

function renderRules() {
  const list = el('rules-list');
  list.textContent = '';
  state.rules.forEach(rule => list.appendChild(ruleRow(rule)));
  el('rules-empty').hidden = state.rules.length > 0;
  list.hidden = state.rules.length === 0;
  updateRuleChrome();
}

function updateRuleChrome() {
  const active = state.rules.filter(rule => rule.enabled && rule.find !== '').length;
  el('rules-badge').textContent = String(active);
  el('rail-badge').textContent = String(active);

  const dirty = rulesDirty();
  el('rules-dirty').hidden = !dirty;
  el('save-rules').disabled = !dirty;
  el('revert-rules').disabled = !dirty;
}

function updateRuleHits(hits) {
  const rows = el('rules-list').children;
  for (let i = 0; i < rows.length; i += 1) {
    const badge = rows[i].querySelector('.rule-hits');
    const count = hits[i] || 0;
    badge.textContent = count > 0 ? `${count}×` : '';
    badge.dataset.hits = count > 0 ? 'yes' : 'no';
    badge.title = count > 0 ? `Found ${count} ${count === 1 ? 'time' : 'times'} in the current text` : '';
  }
}

function addRule(find = '', replace = '') {
  const rule = { find, replace, enabled: true, uid: nextUid() };
  state.rules.push(rule);
  renderRules();
  const row = el('rules-list').lastElementChild;
  if (row) row.querySelector('.rule-find').focus();
  render();
}

function moveRule(uid, delta, refocus) {
  const from = state.rules.findIndex(rule => rule.uid === uid);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= state.rules.length) return;
  const [rule] = state.rules.splice(from, 1);
  state.rules.splice(to, 0, rule);
  renderRules();
  render();
  const row = el('rules-list').querySelector(`[data-uid="${uid}"]`);
  if (row) (row.querySelector(refocus) || row.querySelector('.rule-grip')).focus();
}

function saveRules() {
  if (!rulesDirty()) {
    toast('No unsaved changes.');
    return;
  }
  const clean = stripUids(meaningfulRules(state.rules));
  writeSettings({ rules: clean });
  state.savedRules = clean;
  updateRuleChrome();
  toast(`Saved ${clean.length} ${clean.length === 1 ? 'rule' : 'rules'}.`);
}

function revertRules() {
  state.rules = withUids(state.savedRules);
  renderRules();
  render();
  toast('Went back to the saved rules.');
}

function replaceRules(rules, message) {
  state.rules = withUids(rules);
  renderRules();
  render();
  setRulesOpen(true);
  if (message) toast(message);
}

/* ---------------------------------------------------- rules drag & drop ---- */

let dragUid = null;

function clearDropMarks() {
  el('rules-list').querySelectorAll('.drop-before, .drop-after')
    .forEach(row => row.classList.remove('drop-before', 'drop-after'));
}

function bindRulesList() {
  const list = el('rules-list');

  list.addEventListener('input', event => {
    const row = event.target.closest('.rule');
    const rule = row && ruleByUid(row.dataset.uid);
    if (!rule) return;
    if (event.target.classList.contains('rule-find')) rule.find = event.target.value;
    else if (event.target.classList.contains('rule-replace')) rule.replace = event.target.value;
    else return;
    updateWsFlag(event.target);
    updateRuleChrome();
    scheduleRender(120);
  });

  list.addEventListener('change', event => {
    if (!event.target.classList.contains('rule-enabled')) return;
    const row = event.target.closest('.rule');
    const rule = ruleByUid(row.dataset.uid);
    if (!rule) return;
    rule.enabled = event.target.checked;
    row.classList.toggle('is-off', !rule.enabled);
    row.querySelector('.switch-text').textContent = rule.enabled ? 'On' : 'Off';
    updateRuleChrome();
    render();
  });

  list.addEventListener('click', event => {
    const row = event.target.closest('.rule');
    if (!row) return;
    const uid = row.dataset.uid;
    if (event.target.closest('.rule-delete')) {
      const index = state.rules.findIndex(rule => rule.uid === uid);
      state.rules = state.rules.filter(rule => rule.uid !== uid);
      renderRules();
      render();
      const rows = el('rules-list').children;
      const next = rows[Math.min(index, rows.length - 1)];
      if (next) next.querySelector('.rule-delete').focus();
      else el('add-rule').focus();
    } else if (event.target.closest('.rule-move-up')) {
      moveRule(uid, -1, '.rule-move-up');
    } else if (event.target.closest('.rule-move-down')) {
      moveRule(uid, 1, '.rule-move-down');
    }
  });

  list.addEventListener('keydown', event => {
    const row = event.target.closest('.rule');
    if (!row) return;
    const onGrip = event.target.classList.contains('rule-grip');
    const vertical = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (vertical && (event.altKey || onGrip)) {
      event.preventDefault();
      moveRule(row.dataset.uid, vertical, '.rule-grip');
    }
  });

  list.addEventListener('dragstart', event => {
    const row = event.target.closest('.rule');
    if (!row) return;
    dragUid = row.dataset.uid;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragUid);
    if (event.dataTransfer.setDragImage) event.dataTransfer.setDragImage(row, 12, 12);
  });

  list.addEventListener('dragover', event => {
    if (!dragUid) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const row = event.target.closest('.rule');
    clearDropMarks();
    if (!row || row.dataset.uid === dragUid) return;
    const rect = row.getBoundingClientRect();
    row.classList.add(event.clientY > rect.top + rect.height / 2 ? 'drop-after' : 'drop-before');
  });

  list.addEventListener('drop', event => {
    if (!dragUid) return;
    event.preventDefault();
    const row = event.target.closest('.rule');
    const marked = el('rules-list').querySelector('.drop-before, .drop-after');
    const target = row && row.dataset.uid !== dragUid ? row : marked;
    clearDropMarks();
    if (!target) return;

    const after = target.classList.contains('drop-after')
      || event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    const from = state.rules.findIndex(rule => rule.uid === dragUid);
    if (from === -1) return;
    const [moved] = state.rules.splice(from, 1);
    let to = state.rules.findIndex(rule => rule.uid === target.dataset.uid);
    if (to === -1) to = state.rules.length - 1;
    state.rules.splice(after ? to + 1 : to, 0, moved);
    dragUid = null;
    renderRules();
    render();
  });

  list.addEventListener('dragend', () => {
    dragUid = null;
    clearDropMarks();
    el('rules-list').querySelectorAll('.is-dragging').forEach(row => row.classList.remove('is-dragging'));
  });
}

/* --------------------------------------------------------------- panel ---- */

const drawerMode = () => window.matchMedia('(max-width: 1100px)').matches;

function updateScrim() {
  el('scrim').hidden = !(state.rulesOpen && drawerMode());
}

function setRulesOpen(open, persist = true) {
  state.rulesOpen = open;
  document.body.classList.toggle('rules-open', open);
  el('toggle-rules').setAttribute('aria-expanded', String(open));
  el('rail').setAttribute('aria-expanded', String(open));
  updateScrim();
  if (!persist) return;
  writeSettings({ rulesOpen: open });
  /* The drawer covers the panes, so keyboard focus follows it in and back out. */
  if (drawerMode()) (open ? el('collapse-rules') : el('toggle-rules')).focus();
}

/* ---------------------------------------------------------------- help ---- */

function buildHelpFilters() {
  const holder = el('help-filter-list');
  holder.textContent = '';

  const entry = (id, title, tag, desc, example, extras) => {
    const section = document.createElement('div');
    section.className = 'help-filter';
    section.id = `help-filter-${id}`;

    const head = document.createElement('div');
    head.className = 'help-filter-head';
    const heading = document.createElement('h4');
    heading.textContent = title;
    const badge = document.createElement('span');
    badge.className = 'help-filter-tag';
    badge.textContent = tag;
    head.append(heading, badge);

    const text = document.createElement('p');
    text.textContent = desc;
    section.append(head, text);

    if (example) {
      const block = document.createElement('div');
      block.className = 'example';
      block.appendChild(exampleNode(example));
      section.appendChild(block);
    }
    if (extras) extras.forEach(node => section.appendChild(node));

    holder.appendChild(section);
  };

  entry(ALWAYS_ON.id, ALWAYS_ON.label, 'No toggle', ALWAYS_ON.desc, ALWAYS_ON.example);
  FILTERS.forEach(filter => entry(filter.id, filter.title || filter.label, 'Toggle', filter.desc, filter.example));

  const modeNodes = LINK_MODES.map(mode => {
    const variant = LINK_STEP.modes[mode];
    const wrap = document.createElement('div');
    const label = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${variant.label} — `;
    label.append(strong, document.createTextNode(variant.hint));
    const block = document.createElement('div');
    block.className = 'example';
    block.appendChild(exampleNode(variant.example));
    wrap.append(label, block);
    return wrap;
  });
  entry('links', LINK_STEP.title, '3 choices', LINK_STEP.desc, null, modeNodes);
}

function jumpTo(scroller, top) {
  const previous = scroller.style.scrollBehavior;
  scroller.style.scrollBehavior = 'auto';
  scroller.scrollTop = top;
  scroller.style.scrollBehavior = previous;
}

function setActiveHelpNav(id) {
  document.querySelectorAll('.help-nav-link').forEach(link => {
    link.classList.toggle('is-active', link.dataset.target === id);
  });
}

function syncHelpNavToScroll() {
  const scroller = el('help-scroll');
  const sections = [...document.querySelectorAll('.help-section')];
  const edge = scroller.scrollTop + 24;
  let current = sections[0];
  sections.forEach(section => {
    if (section.offsetTop <= edge) current = section;
  });
  if (current) setActiveHelpNav(current.id);
}

function openHelp(targetId) {
  const dialog = el('help-modal');
  if (!dialog.open) dialog.showModal();

  const scroller = el('help-scroll');
  const target = targetId ? el(targetId) : null;
  if (!target) {
    syncHelpNavToScroll();
    return;
  }

  jumpTo(scroller, Math.max(0, target.offsetTop - 12));
  syncHelpNavToScroll();
  target.classList.remove('is-flash');
  void target.offsetWidth;
  target.classList.add('is-flash');
  setTimeout(() => target.classList.remove('is-flash'), 1600);
}

function bindHelp() {
  el('open-help').addEventListener('click', () => openHelp());

  document.querySelectorAll('.help-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const target = el(link.dataset.target);
      if (!target) return;
      jumpTo(el('help-scroll'), Math.max(0, target.offsetTop - 12));
      syncHelpNavToScroll();
    });
  });

  el('help-scroll').addEventListener('scroll', syncHelpNavToScroll, { passive: true });

  el('popover-learn').addEventListener('click', () => {
    const target = el('popover-learn').dataset.target;
    closePopover();
    openHelp(target);
  });
}

/* ------------------------------------------------------------- display ---- */

function applyDisplay(size, family) {
  document.documentElement.style.setProperty('--font-size', `${size}px`);
  document.documentElement.style.setProperty('--font-family', family || DEFAULT_FONT_FAMILY);
}

function bindDisplaySettings() {
  const dialog = el('settings-modal');
  const sizeNum = el('font-size');
  const sizeRange = el('font-size-range');
  const familySelect = el('font-family');
  const customRow = el('font-custom-row');
  const customInput = el('font-custom');
  const presetFamilies = [...familySelect.options].map(option => option.value);
  let snapshot = null;
  let committed = false;

  const currentFamily = () => (familySelect.value === '__custom' ? customInput.value.trim() : familySelect.value);
  const currentSize = () => {
    const value = parseInt(sizeNum.value, 10);
    return Number.isFinite(value) ? Math.min(48, Math.max(10, value)) : DEFAULT_FONT_SIZE;
  };

  const fill = (size, family) => {
    sizeNum.value = String(size);
    sizeRange.value = String(Math.min(28, Math.max(11, size)));
    const known = presetFamilies.includes(family) && family !== '__custom';
    familySelect.value = known ? family : '__custom';
    customInput.value = known ? '' : family;
    customRow.hidden = familySelect.value !== '__custom';
  };

  const preview = () => applyDisplay(currentSize(), currentFamily());

  sizeRange.addEventListener('input', () => {
    sizeNum.value = sizeRange.value;
    preview();
  });
  sizeNum.addEventListener('input', () => {
    sizeRange.value = String(Math.min(28, Math.max(11, currentSize())));
    preview();
  });
  familySelect.addEventListener('change', () => {
    customRow.hidden = familySelect.value !== '__custom';
    if (!customRow.hidden) customInput.focus();
    preview();
  });
  customInput.addEventListener('input', preview);

  el('reset-display').addEventListener('click', () => {
    fill(DEFAULT_FONT_SIZE, DEFAULT_FONT_FAMILY);
    preview();
  });

  el('open-settings').addEventListener('click', () => {
    snapshot = { size: state.fontSize, family: state.fontFamily };
    committed = false;
    fill(state.fontSize, state.fontFamily);
    dialog.showModal();
  });

  el('save-settings').addEventListener('click', () => {
    state.fontSize = currentSize();
    state.fontFamily = currentFamily() || DEFAULT_FONT_FAMILY;
    applyDisplay(state.fontSize, state.fontFamily);
    writeSettings({ fontSize: state.fontSize, fontFamily: state.fontFamily });
    committed = true;
    dialog.close();
    toast('Display settings saved.');
  });

  el('cancel-settings').addEventListener('click', () => dialog.close());

  dialog.addEventListener('close', () => {
    if (committed || !snapshot) return;
    applyDisplay(snapshot.size, snapshot.family);
  });
}

/* -------------------------------------------------------------- render ---- */

let renderTimer;

function render() {
  clearTimeout(renderTimer);
  const raw = el('input').value;
  const result = runPipeline(raw, state.rules);
  el('output').textContent = result.text;
  updateFilterCounts(result.filterCounts);
  updateRuleHits(result.ruleHits);
  el('input-stats').textContent = describeText(raw);
  el('output-stats').textContent = describeText(result.text);
  el('load-sample').hidden = raw.length > 0;
}

function scheduleRender(delay = 80) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, delay);
}

/* --------------------------------------------------------------- start ---- */

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  applyDisplay(state.fontSize, state.fontFamily);

  buildFilterBar();
  buildHelpFilters();
  syncFilterBar();
  renderRules();
  bindRulesList();
  bindHelp();
  bindDisplaySettings();
  setRulesOpen(state.rulesOpen, false);

  const input = el('input');
  input.addEventListener('input', () => scheduleRender());

  el('preset-select').addEventListener('change', event => {
    if (event.target.value === 'custom') return;
    applyPreset(event.target.value);
  });

  el('load-sample').addEventListener('click', () => {
    input.value = SAMPLE_TEXT;
    input.focus();
    render();
    toast('Sample loaded — try the filters on it.');
  });

  el('clear-focus').addEventListener('click', () => {
    input.focus();
    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
    } catch {
      /* falls through to the direct clear below */
    }
    if (input.value !== '') input.value = '';
    render();
  });

  const copyBtn = el('copy-btn');
  const copyLabel = copyBtn.querySelector('.copy-label');
  const copyIcon = copyBtn.querySelector('use');
  let copyTimer;
  copyBtn.addEventListener('click', async () => {
    const text = el('output').textContent;
    if (!text) {
      toast('There is nothing to copy yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.classList.add('is-done');
      copyLabel.textContent = 'Copied';
      copyIcon.setAttribute('href', '#i-check');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyBtn.classList.remove('is-done');
        copyLabel.textContent = 'Copy';
        copyIcon.setAttribute('href', '#i-copy');
      }, 1800);
    } catch {
      toast('Copying was blocked. Select the text and press Ctrl+C.');
    }
  });

  el('toggle-rules').addEventListener('click', () => setRulesOpen(!state.rulesOpen));
  el('rail').addEventListener('click', () => setRulesOpen(true));
  el('collapse-rules').addEventListener('click', () => {
    setRulesOpen(false);
    el('toggle-rules').focus();
  });
  el('scrim').addEventListener('click', () => setRulesOpen(false));

  el('add-rule').addEventListener('click', () => addRule());
  el('load-example-rules').addEventListener('click', () => {
    replaceRules(EXAMPLE_RULES, 'Example rules loaded — press Save to keep them.');
  });
  el('save-rules').addEventListener('click', saveRules);
  el('revert-rules').addEventListener('click', revertRules);

  el('export-json').addEventListener('click', () => {
    const rules = meaningfulRules(state.rules);
    if (!rules.length) {
      toast('There are no rules to export yet.');
      return;
    }
    const data = JSON.stringify(stripUids(rules), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'normalizer-rules.json';
    link.click();
    URL.revokeObjectURL(url);
    toast('Rules exported.');
  });

  const fileInput = el('file-import');
  el('import-json').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      let rules;
      try {
        rules = rulesFromJson(JSON.parse(event.target.result));
      } catch {
        rules = null;
      }
      if (!rules || !rules.length) {
        toast('That file did not contain any readable rules.', 3200);
        return;
      }
      replaceRules(rules, `Imported ${rules.length} ${rules.length === 1 ? 'rule' : 'rules'} — press Save to keep them.`);
    };
    reader.readAsText(file);
  });

  document.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => el(button.dataset.close).close());
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveRules();
      return;
    }
    if (event.key !== 'Escape') return;
    if (!el('popover').hidden) {
      event.preventDefault();
      closePopover();
    } else if (state.rulesOpen && drawerMode()) {
      event.preventDefault();
      setRulesOpen(false);
    }
  });

  document.addEventListener('pointerdown', event => {
    const popover = el('popover');
    if (popover.hidden) return;
    if (popover.contains(event.target) || (popoverAnchor && popoverAnchor.contains(event.target))) return;
    closePopover();
  });

  window.addEventListener('resize', () => {
    closePopover();
    updateScrim();
  });

  window.addEventListener('beforeunload', event => {
    if (!rulesDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  render();
});
