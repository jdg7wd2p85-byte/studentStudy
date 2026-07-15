const state = {
  catalog: null,
  parsed: [],
  items: [],
  today: [],
  report: null,
  reviewIndex: 0,
  revealAnswer: false,
  selected: new Set(),
  expandedTexts: new Set()
};

const $ = (id) => document.getElementById(id);

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
  });
});

$("refreshBtn").onclick = loadAll;
$("rulesBtn").onclick = () => $("rulesModal").classList.remove("hidden");
$("rulesCloseBtn").onclick = () => $("rulesModal").classList.add("hidden");
$("rulesModal").onclick = (event) => {
  if (event.target.id === "rulesModal") $("rulesModal").classList.add("hidden");
};
$("historyCloseBtn").onclick = () => $("historyModal").classList.add("hidden");
$("historyModal").onclick = (event) => {
  if (event.target.id === "historyModal") $("historyModal").classList.add("hidden");
};
$("parseBtn").onclick = parseInput;
$("saveParsedBtn").onclick = saveParsed;
$("searchBtn").onclick = loadItems;
$("resetFiltersBtn").onclick = resetFilters;
$("makePaperBtn").onclick = makePaper;
$("makePaperFromListBtn").onclick = makePaper;
$("deleteSelectedBtn").onclick = deleteSelectedItems;
$("historySelectedBtn").onclick = viewSelectedHistory;
$("categorySelect").addEventListener("change", () => {
  syncSubjectWithCategory();
  syncListFilterWithCategory();
  loadItems();
});
$("subjectFilterSelect").addEventListener("change", () => {
  renderCategoryFilter();
  loadItems();
});
$("categoryFilterSelect").addEventListener("change", loadItems);
document.querySelectorAll("#statusFilters input[type=checkbox]").forEach((input) => {
  input.addEventListener("change", loadItems);
});
$("pasteBox").addEventListener("input", syncPasteBoxToRawText);
$("pasteBox").addEventListener("paste", pastePlainText);
$("pasteBox").addEventListener("click", () => $("pasteBox").focus());

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.message || "请求失败");
  return body.data;
}

async function loadAll() {
  state.catalog = await api("/api/catalog");
  renderCatalog();
  await Promise.all([loadItems(), loadToday(), loadReport()]);
}

function renderCatalog() {
  fillSelect("childSelect", state.catalog.children, "name");
  fillSelect("subjectSelect", state.catalog.subjects, "name");
  fillSelect("categorySelect", state.catalog.categories, "name");
  fillSelect("subjectFilterSelect", state.catalog.subjects, "name", "全部科目");
  renderCategoryFilter();
  syncSubjectWithCategory();
}

function fillSelect(id, rows, labelKey, emptyLabel = "") {
  const el = $(id);
  const emptyOption = emptyLabel ? `<option value="">${escapeHtml(emptyLabel)}</option>` : "";
  el.innerHTML = emptyOption + rows.map((row) => `<option value="${row.id}">${escapeHtml(row[labelKey])}</option>`).join("");
}

function renderCategoryFilter() {
  const subjectId = $("subjectFilterSelect")?.value;
  const categories = subjectId
    ? state.catalog.categories.filter((row) => String(row.subject_id || "") === String(subjectId))
    : state.catalog.categories;
  fillSelect("categoryFilterSelect", categories, "name", "全部类别");
}

function syncSubjectWithCategory() {
  const category = selectedCategory();
  if (category?.subject_id) {
    $("subjectSelect").value = String(category.subject_id);
  }
}

function syncListFilterWithCategory() {
  const category = selectedCategory();
  if (!category) return;
  if (category.subject_id) {
    $("subjectFilterSelect").value = String(category.subject_id);
  }
  renderCategoryFilter();
  $("categoryFilterSelect").value = String(category.id);
}

async function parseInput() {
  syncPasteBoxToRawText();
  const category = selectedCategory();
  state.parsed = await api("/api/items/parse", {
    method: "POST",
    body: JSON.stringify({
      childId: Number($("childSelect").value),
      subjectId: Number($("subjectSelect").value),
      categoryId: Number($("categorySelect").value),
      categoryCode: category.code,
      rawText: $("rawText").value,
      source: $("sourceInput").value,
      tags: $("tagsInput").value
    })
  });
  renderParsed();
}

function renderParsed() {
  $("parsePreview").innerHTML = state.parsed.map(renderParsedItem).join("");
}

function renderParsedItem(item) {
  if (isLongTextItem(item)) {
    return `
      <article class="item text-preview">
        <div class="item-head">
          <h3>${escapeHtml(item.title || "课文")}</h3>
          <span class="badge">1条课文</span>
        </div>
        <div class="text-body">${escapeHtml(item.content || "")}</div>
        <div class="meta">保存后将作为一条完整课文记录</div>
        ${item.warnings?.length ? `<div class="meta">${escapeHtml(item.warnings.join("；"))}</div>` : ""}
      </article>
    `;
  }
  return `
    <article class="item">
      <div class="item-head">
        <h3>${escapeHtml(item.title)}</h3>
        <span class="badge">${Math.round(item.confidence * 100)}%</span>
      </div>
      <div class="answer">${escapeHtml(item.content || item.answer || "待补充答案")}</div>
      <div class="meta">${escapeHtml(item.rawText)}</div>
      ${item.warnings?.length ? `<div class="meta">${escapeHtml(item.warnings.join("；"))}</div>` : ""}
    </article>
  `;
}

async function saveParsed() {
  if (!state.parsed.length) await parseInput();
  const category = selectedCategory();
  const requests = state.parsed.map((item) => ({
    childId: Number($("childSelect").value),
    subjectId: Number($("subjectSelect").value),
    categoryId: Number($("categorySelect").value),
    itemType: item.categoryCode || category.code,
    displayMode: item.displayMode || category.default_display_mode,
    title: item.title,
    prompt: item.prompt,
    content: item.content,
    answer: item.answer,
    explanation: item.explanation,
    source: $("sourceInput").value,
    tags: item.tags,
    extraFields: item.extraFields || {}
  }));
  await api("/api/items/batch", { method: "POST", body: JSON.stringify(requests) });
  setRawText("");
  state.parsed = [];
  renderParsed();
  await loadAll();
  alert("保存完成，重复项会自动复用已有记录");
}

function pastePlainText(event) {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";
  document.execCommand("insertText", false, text);
  syncPasteBoxToRawText();
}

function syncPasteBoxToRawText() {
  $("rawText").value = $("pasteBox").innerText.replace(/\u00a0/g, " ").trim();
}

function setRawText(value) {
  $("rawText").value = value;
  $("pasteBox").textContent = value;
}

async function loadItems() {
  const params = new URLSearchParams();
  if ($("keywordInput")?.value) params.set("keyword", $("keywordInput").value);
  if ($("subjectFilterSelect")?.value) params.set("subjectId", $("subjectFilterSelect").value);
  if ($("categoryFilterSelect")?.value) params.set("categoryId", $("categoryFilterSelect").value);
  if ($("tagFilterInput")?.value) params.set("tag", $("tagFilterInput").value);
  const statuses = selectedStatuses();
  if (statuses.length) params.set("reviewStatus", statuses.join(","));
  state.items = await api(`/api/items?${params}`);
  renderItems();
  updateSelectionBar();
}

function resetFilters() {
  $("keywordInput").value = "";
  $("subjectFilterSelect").value = "";
  renderCategoryFilter();
  $("categoryFilterSelect").value = "";
  $("tagFilterInput").value = "";
  document.querySelectorAll("#statusFilters input[type=checkbox]").forEach((input) => {
    input.checked = false;
  });
  loadItems();
}

async function loadToday() {
  state.today = await api("/api/reviews/today");
  state.reviewIndex = 0;
  state.revealAnswer = false;
  renderReview();
  updateSummary();
}

async function loadReport() {
  state.report = await api("/api/reports/summary");
  updateSummary();
  renderModuleStats();
  renderReport();
}

function renderItems() {
  $("itemsList").innerHTML = state.items.map(renderItemCard).join("");
  document.querySelectorAll("#itemsList input[type=checkbox]").forEach((input) => {
    input.onchange = () => {
      const id = Number(input.dataset.id);
      input.checked ? state.selected.add(id) : state.selected.delete(id);
      updateSelectionBar();
    };
  });
  updateSelectionBar();
}

function renderItemCard(item) {
  const meta = `${escapeHtml(item.category_name)} / ${escapeHtml(item.subject_name)} / 录入 ${formatDate(item.first_learned_at)} / 掌握分 ${item.mastery_score} / 下次 ${formatDate(item.next_review_at)}`;
  if (isLongTextItem(item)) {
    const expanded = state.expandedTexts.has(Number(item.id));
    const content = item.content || "";
    return `
      <article class="item text-preview">
        <div class="item-head">
          <label><input type="checkbox" data-id="${item.id}" ${state.selected.has(item.id) ? "checked" : ""}> ${escapeHtml(item.title)}</label>
          <span class="badge">读${Number(item.total_review_count || 0)}次</span>
        </div>
        <div class="text-excerpt ${expanded ? "expanded" : ""}">${escapeHtml(expanded ? content : excerpt(content))}</div>
        <div class="inline-actions">
          <button class="small-action" onclick="toggleTextExpand(${item.id})">${expanded ? "收起全文" : "展开全文"}</button>
          <button class="small-action" onclick="viewItemHistory(${item.id})">记录</button>
        </div>
        <div class="meta">${meta}</div>
      </article>
    `;
  }
  return `
    <article class="item">
      <div class="item-head">
        <label><input type="checkbox" data-id="${item.id}" ${state.selected.has(item.id) ? "checked" : ""}> ${escapeHtml(item.title)}</label>
        <span class="badge">背${Number(item.total_review_count || 0)}次</span>
      </div>
      <div class="answer">${escapeHtml(item.answer || item.content || "")}</div>
      <button class="small-action" onclick="viewItemHistory(${item.id})">记录</button>
      <div class="meta">${meta}</div>
    </article>
  `;
}

function renderReview() {
  const card = $("reviewCard");
  const item = state.today[state.reviewIndex];
  if (!item) {
    card.className = "review-card empty";
    card.innerHTML = "暂无待复习内容";
    return;
  }
  card.className = "review-card";
  if (isLongTextItem(item)) {
    card.innerHTML = `
      <div class="meta">${escapeHtml(item.category_name)} / 掌握分 ${item.mastery_score} / 下次 ${formatDate(item.next_review_at)}</div>
      <div class="text-review">
        <div class="card-label">课文</div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class="text-body">${escapeHtml(item.content || item.title || "")}</div>
      </div>
      <div class="rating">
        <button onclick="submitReview(${item.id},0)">没读熟</button>
        <button onclick="submitReview(${item.id},1)">不流畅</button>
        <button onclick="submitReview(${item.id},2)">基本会</button>
        <button onclick="submitReview(${item.id},3)">熟练</button>
      </div>
    `;
    return;
  }
  card.innerHTML = `
    <div class="meta">${escapeHtml(item.category_name)} / 掌握分 ${item.mastery_score} / 下次 ${formatDate(item.next_review_at)}</div>
    <div class="flashcard">
      <div class="card-label">正面</div>
      <div class="card-title">${escapeHtml(item.title)}</div>
      ${item.prompt ? `<div class="card-prompt">${escapeHtml(item.prompt)}</div>` : ""}
    </div>
    <button class="answer-toggle" onclick="toggleAnswer()">${state.revealAnswer ? "隐藏答案" : "显示答案"}</button>
    <div class="answer-panel ${state.revealAnswer ? "" : "hidden"}">
      <div class="card-label">答案</div>
      <div class="answer">${escapeHtml(item.answer || item.content || "无答案")}</div>
      ${item.explanation ? `<div class="answer">${escapeHtml(item.explanation)}</div>` : ""}
    </div>
    <div class="rating">
      <button onclick="submitReview(${item.id},0)">不会</button>
      <button onclick="submitReview(${item.id},1)">模糊</button>
      <button onclick="submitReview(${item.id},2)">基本会</button>
      <button onclick="submitReview(${item.id},3)">熟练</button>
    </div>
  `;
}

function toggleAnswer() {
  state.revealAnswer = !state.revealAnswer;
  renderReview();
}

function isLongTextItem(item) {
  return item.displayMode === "LONG_TEXT" || item.display_mode === "LONG_TEXT";
}

function toggleTextExpand(itemId) {
  const id = Number(itemId);
  state.expandedTexts.has(id) ? state.expandedTexts.delete(id) : state.expandedTexts.add(id);
  renderItems();
}

async function submitReview(id, rating) {
  await api(`/api/reviews/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ rating, note: "" })
  });
  state.reviewIndex += 1;
  state.revealAnswer = false;
  await Promise.all([loadItems(), loadToday(), loadReport()]);
}

async function makePaper() {
  const itemIds = [...state.selected];
  if (!itemIds.length) {
    alert("请先在列表里勾选学习项");
    return;
  }
  const paper = await api("/api/practice/papers", {
    method: "POST",
    body: JSON.stringify({
      childId: Number($("childSelect").value),
      title: `练习卷 ${new Date().toLocaleDateString()}`,
      sourceType: "MANUAL",
      includeAnswer: true,
      itemIds
    })
  });
  showTab("paper");
  $("paperPreview").innerHTML = `
    <h3>${escapeHtml(paper.title)}</h3>
    ${paper.items.map((q, i) => `
      <div class="paper-question">
        <strong>${i + 1}. ${escapeHtml(q.question_text)}</strong>
        <details><summary>答案</summary>${escapeHtml(q.answer_text || "")}</details>
      </div>
    `).join("")}
  `;
}

async function deleteSelectedItems() {
  const itemIds = [...state.selected];
  if (!itemIds.length) {
    alert("请先在列表里勾选学习项");
    return;
  }
  if (!confirm(`确认删除已选的 ${itemIds.length} 项吗？`)) {
    return;
  }
  const result = await api("/api/items/delete", {
    method: "POST",
    body: JSON.stringify({ itemIds })
  });
  itemIds.forEach((id) => state.selected.delete(id));
  await Promise.all([loadItems(), loadToday(), loadReport()]);
  alert(`已删除 ${result.deleted ?? 0} 项`);
}

async function viewItemHistory(itemId) {
  const item = state.items.find((row) => Number(row.id) === Number(itemId));
  $("historyTitle").textContent = item ? `${item.title} 的背诵记录` : "背诵记录";
  $("itemHistory").innerHTML = `<div class="empty-note">加载中...</div>`;
  $("historyModal").classList.remove("hidden");
  const rows = await api(`/api/reports/reviews?itemId=${itemId}`);
  $("itemHistory").innerHTML = rows.length ? rows.map((row) => `
    <article class="report-row">
      <div>
        <strong>${ratingLabel(row.rating)}</strong>
        <span>${formatDate(row.reviewed_at)} / 下次 ${formatDate(row.next_review_at)}</span>
      </div>
      <span class="badge">${row.before_mastery_score} -> ${row.after_mastery_score}</span>
    </article>
  `).join("") : `<div class="empty-note">这个学习项还没有背诵记录</div>`;
}

function viewSelectedHistory() {
  const itemIds = [...state.selected];
  if (itemIds.length !== 1) {
    alert("请只勾选一个学习项查看记录");
    return;
  }
  viewItemHistory(itemIds[0]);
}

function showTab(tabId) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === tabId));
}

function selectedCategory() {
  const id = Number($("categorySelect").value);
  return state.catalog.categories.find((c) => Number(c.id) === id) || state.catalog.categories[0];
}

function updateSummary() {
  const overview = state.report?.overview || {};
  $("todayCount").textContent = state.report?.dueToday ?? state.today.length;
  $("itemCount").textContent = overview.total_items ?? 0;
  $("weakCount").textContent = overview.weak_count ?? 0;
  updateSelectionBar();
}

function selectedStatuses() {
  return [...document.querySelectorAll("#statusFilters input[type=checkbox]:checked")]
    .map((input) => input.value);
}

function updateSelectionBar() {
  const count = state.selected.size;
  if ($("selectedCount")) {
    $("selectedCount").textContent = `当前 ${state.items.length} 项 / 已选 ${count} 项`;
  }
  if ($("historySelectedBtn")) {
    $("historySelectedBtn").disabled = count !== 1;
  }
  if ($("makePaperFromListBtn")) {
    $("makePaperFromListBtn").disabled = count === 0;
  }
  if ($("makePaperBtn")) {
    $("makePaperBtn").disabled = count === 0;
  }
  if ($("deleteSelectedBtn")) {
    $("deleteSelectedBtn").disabled = count === 0;
  }
}

function renderModuleStats() {
  const rows = (state.report?.modules || []).slice(0, 8);
  $("moduleStats").innerHTML = rows.map((row) => `
    <div class="module-chip">
      <span>${escapeHtml(row.subject_name)} / ${escapeHtml(row.category_name)}</span>
      <strong>${row.item_count}项</strong>
    </div>
  `).join("");
}

function renderReport() {
  if (!state.report) return;
  const days = buildDailyTrend(state.report.dailyTrend || [], state.report.dailyCategories || []);
  const months = groupDaysByMonth(days);
  const maxReviews = Math.max(1, ...days.map((day) => Number(day.review_count || 0)));
  $("reviewHeatmap").innerHTML = `
    <h3>最近 60 天背诵热力图</h3>
    ${months.map((month) => `
      <section class="heat-month">
        <h4>${escapeHtml(month.label)}</h4>
        <div class="heatmap-grid">
          ${month.days.map((day) => `
            <div class="heat-cell level-${heatLevel(day.review_count, maxReviews)}" title="${escapeHtml(day.date)} 背 ${day.item_count} 个，${day.category_count} 类，掌握 ${day.mastered_count} 个">
              <span>${Number(day.date.slice(-2))}</span>
            </div>
          `).join("")}
        </div>
      </section>
    `).join("")}
    <div class="heatmap-legend">
      <span>少</span><i class="level-0"></i><i class="level-1"></i><i class="level-2"></i><i class="level-3"></i><i class="level-4"></i><span>多</span>
    </div>
  `;
  $("dailyReviewList").innerHTML = `
    <h3>每日背诵记录</h3>
    ${days.filter((day) => Number(day.review_count || 0) > 0).map((day) => `
      <article class="report-row">
        <div>
          <strong>${escapeHtml(day.date)}</strong>
          <span>背诵 ${day.item_count} 个 / ${day.category_count} 类 / 共 ${day.review_count} 次</span>
          <div class="category-counts">
            ${day.categories.map((category, index) => `
              <span class="category-pill color-${index % 6}">
                ${escapeHtml(category.subject_name)} / ${escapeHtml(category.category_name)} ${category.item_count}
              </span>
            `).join("")}
          </div>
        </div>
        <span class="badge">掌握 ${day.mastered_count} 个</span>
      </article>
    `).join("") || `<div class="empty-note">最近 60 天还没有背诵记录</div>`}
  `;
}

function applyStatusFilter(status) {
  document.querySelectorAll("#statusFilters input[type=checkbox]").forEach((input) => {
    input.checked = input.value === status;
  });
  showTab("items");
  loadItems();
}

function buildDailyTrend(rows, categoryRows) {
  const byDate = new Map(rows.map((row) => [String(row.review_date), row]));
  const categoriesByDate = new Map();
  categoryRows.forEach((row) => {
    const key = String(row.review_date);
    const categories = categoriesByDate.get(key) || [];
    categories.push({
      subject_name: row.subject_name,
      category_name: row.category_name,
      item_count: Number(row.item_count || 0),
      review_count: Number(row.review_count || 0)
    });
    categoriesByDate.set(key, categories);
  });
  const days = [];
  const today = new Date();
  for (let i = 59; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = localDateKey(date);
    const row = byDate.get(key) || {};
    const categories = categoriesByDate.get(key) || [];
    days.push({
      date: key,
      review_count: Number(row.review_count || 0),
      item_count: Number(row.item_count || 0),
      mastered_count: Number(row.mastered_count || 0),
      category_count: categories.length,
      categories
    });
  }
  return days;
}

function groupDaysByMonth(days) {
  const groups = [];
  days.forEach((day) => {
    const monthKey = day.date.slice(0, 7);
    let group = groups.find((item) => item.key === monthKey);
    if (!group) {
      group = { key: monthKey, label: `${monthKey.slice(0, 4)}年${Number(monthKey.slice(5, 7))}月`, days: [] };
      groups.push(group);
    }
    group.days.push(day);
  });
  return groups;
}

function heatLevel(value, maxValue) {
  const count = Number(value || 0);
  if (!count) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / maxValue) * 4)));
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ratingLabel(rating) {
  return ["不会", "模糊", "基本会", "熟练"][Number(rating)] || "未知";
}

function formatDate(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function excerpt(value, max = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

loadAll().catch((err) => alert(err.message));
