const data = window.MONSTER_RESISTANCE_DATA;
const HIDDEN_HEADERS = new Set(["出现地点（暂未更新）"]);

const elements = {
  searchInput: document.querySelector("#search-input"),
  tableHead: document.querySelector("#table-head"),
  tableBody: document.querySelector("#table-body"),
};

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
          ${visibleColumnIndexes.map((index) => `<td>${escapeHtml(row.values[index])}</td>`).join("")}
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
}

bootstrap();
