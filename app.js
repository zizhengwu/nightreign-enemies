const data = window.MONSTER_RESISTANCE_DATA;
const HIDDEN_HEADERS = new Set(["出现地点（暂未更新）", "抗性中位数"]);
const DAMAGE_RESISTANCE_HEADERS = new Set(["普", "打", "斩", "刺", "魔", "火", "雷", "圣"]);
const STATUS_RESISTANCE_HEADERS = new Set(["血", "毒", "腐败", "冰"]);
const RESISTANCE_CATEGORY_CLASS_BY_LABEL = {
  大抵抗: "resistance-tier-great-resist",
  抵抗: "resistance-tier-resist",
  正常: "resistance-tier-normal",
  弱点: "resistance-tier-weak",
  大弱点: "resistance-tier-great-weak",
};
const STATUS_RESISTANCE_LABEL_BY_VALUE = {
  63: "大弱点",
  84: "大弱点",
  112: "弱点",
  154: "正常",
  252: "抵抗",
  542: "大抵抗",
  999: "大抵抗",
};
const MEDIAN_HEADER = "抗性中位数";

const elements = {
  searchInput: document.querySelector("#search-input"),
  clearSearchButton: document.querySelector("#clear-search-button"),
  tableHead: document.querySelector("#table-head"),
  tableBody: document.querySelector("#table-body"),
};

const medianColumnIndex = data?.headers?.indexOf(MEDIAN_HEADER) ?? -1;

function getVisibleColumnIndexes(headers) {
  return headers.reduce((indexes, header, index) => {
    if (!HIDDEN_HEADERS.has(header)) {
      indexes.push(index);
    }

    return indexes;
  }, []);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toNumericValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getResistanceCategoryClass(label) {
  return RESISTANCE_CATEGORY_CLASS_BY_LABEL[label] || "";
}

function getDamageResistanceCategoryLabel(value, row) {
  const numericValue = toNumericValue(value);
  const medianValue = medianColumnIndex >= 0 ? toNumericValue(row.values[medianColumnIndex]) : null;

  if (numericValue === null || medianValue === null) {
    return null;
  }

  if (numericValue < medianValue * 0.7) return "大抵抗";
  if (numericValue < medianValue * 0.9) return "抵抗";
  if (numericValue > medianValue * 1.25) return "大弱点";
  if (numericValue > medianValue * 1.1) return "弱点";

  return "正常";
}

function getStatusResistanceCategoryLabel(value) {
  return STATUS_RESISTANCE_LABEL_BY_VALUE[String(value)] || null;
}

function getResistanceCategoryLabel(header, value, row) {
  if (RESISTANCE_CATEGORY_CLASS_BY_LABEL[value]) {
    return value;
  }

  if (DAMAGE_RESISTANCE_HEADERS.has(header)) {
    return getDamageResistanceCategoryLabel(value, row);
  }

  if (STATUS_RESISTANCE_HEADERS.has(header)) {
    return getStatusResistanceCategoryLabel(value);
  }

  return null;
}

function renderCell(header, value, row) {
  const categoryLabel = getResistanceCategoryLabel(header, value, row);
  const categoryClass = getResistanceCategoryClass(categoryLabel);
  const classAttribute = categoryClass ? ` class="${categoryClass}"` : "";
  const displayValue = value === "免疫" ? "X" : value;

  return `<td${classAttribute}>${escapeHtml(displayValue)}</td>`;
}

function renderHeader(headers) {
  const visibleHeaders = headers.filter((header) => !HIDDEN_HEADERS.has(header));

  elements.tableHead.innerHTML = `<tr>${visibleHeaders
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr>`;
}

function renderRows(rows) {
  const visibleColumnIndexes = getVisibleColumnIndexes(data.headers);

  if (!rows.length) {
    elements.tableBody.innerHTML = `<tr><td class="empty-state" colspan="${visibleColumnIndexes.length}">没有匹配结果</td></tr>`;
    return;
  }

  elements.tableBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          ${visibleColumnIndexes.map((index) => renderCell(data.headers[index], row.values[index], row)).join("")}
        </tr>
      `
    )
    .join("");
}

function scoreRow(row, query) {
  if (!query) {
    return 0;
  }

  const search = row.search;
  let score = 0;

  if (search.nameNormalized === query) score = Math.max(score, 1200);
  if (row.name.includes(query)) score = Math.max(score, 1100 - row.name.indexOf(query));
  if (search.nameNormalized.startsWith(query)) score = Math.max(score, 1000);
  if (search.nameNormalized.includes(query)) score = Math.max(score, 920);
  if (search.namePinyin.startsWith(query)) score = Math.max(score, 860);
  if (search.namePinyin.includes(query)) score = Math.max(score, 800);
  if (search.nameInitials.startsWith(query)) score = Math.max(score, 760);
  if (search.nameInitials.includes(query)) score = Math.max(score, 720);
  if (search.namePinyinSuffixes.some((item) => item.startsWith(query))) score = Math.max(score, 700);
  if (search.namePinyinSuffixes.some((item) => item.includes(query))) score = Math.max(score, 680);
  if (search.rowNormalized.includes(query)) score = Math.max(score, 280);

  return score;
}

function filterRows(query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return [...data.rows].sort((a, b) => a.order - b.order);
  }

  return data.rows
    .map((row) => ({ row, score: scoreRow(row, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.row.order - right.row.order)
    .map((item) => item.row);
}

function updateTable() {
  const rows = filterRows(elements.searchInput.value);
  renderRows(rows);
  elements.clearSearchButton.disabled = !elements.searchInput.value;
}

function clearSearch() {
  elements.searchInput.value = "";
  updateTable();
  elements.searchInput.focus();
  elements.searchInput.setSelectionRange(0, 0);
}

function bootstrap() {
  if (!data) {
    elements.tableBody.innerHTML = `<tr><td class="empty-state" colspan="1">数据加载失败</td></tr>`;
    return;
  }

  document.title = data.title || "怪物抗性表";

  renderHeader(data.headers);
  updateTable();

  elements.searchInput.addEventListener("input", updateTable);
  elements.clearSearchButton.addEventListener("click", clearSearch);
}

bootstrap();
