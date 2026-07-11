const state = {
  catalog: null,
  parsed: [],
  items: [],
  today: [],
  report: null,
  reviewIndex: 0,
  revealAnswer: false,
  selected: new Set()
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
$("parseBtn").onclick = parseInput;
$("saveParsedBtn").onclick = saveParsed;
$("searchBtn").onclick = loadItems;
$("makePaperBtn").onclick = makePaper;
$("makePaperFromListBtn").onclick = makePaper;
$("deleteSelectedBtn").onclick = deleteSelectedItems;
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
  fillSelect("categoryFilterSelect", state.catalog.categories, "name", "全部类别");
}

function fillSelect(id, rows, labelKey, emptyLabel = "") {
  const el = $(id);
  const emptyOption = emptyLabel ? `<option value="">${escapeHtml(emptyLabel)}</option>` : "";
  el.innerHTML = emptyOption + rows.map((row) => `<option value="${row.id}">${escapeHtml(row[labelKey])}</option>`).join("");
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
  state.items = await api(`/api/items?${params}`);
  renderItems();
  updateSelectionBar();
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
    return `
      <article class="item text-preview">
        <div class="item-head">
          <label><input type="checkbox" data-id="${item.id}" ${state.selected.has(item.id) ? "checked" : ""}> ${escapeHtml(item.title)}</label>
          <span class="badge">读${Number(item.total_review_count || 0)}次</span>
        </div>
        <div class="text-body">${escapeHtml(item.content || "")}</div>
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

function updateSelectionBar() {
  const count = state.selected.size;
  if ($("selectedCount")) {
    $("selectedCount").textContent = `已选 ${count} 项`;
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
  const overview = state.report.overview || {};
  $("reportOverview").innerHTML = `
    <div><strong>${overview.total_items ?? 0}</strong><span>学习项总数</span></div>
    <div><strong>${state.report.dueToday ?? 0}</strong><span>今日待复习</span></div>
    <div><strong>${overview.reviewed_items ?? 0}</strong><span>已背过项目</span></div>
    <div><strong>${overview.total_reviews ?? 0}</strong><span>累计背诵次数</span></div>
    <div><strong>${overview.weak_count ?? 0}</strong><span>薄弱项</span></div>
    <div><strong>${overview.avg_mastery ?? 0}</strong><span>平均掌握分</span></div>
  `;
  $("reportModules").innerHTML = `
    <h3>模块分析</h3>
    ${(state.report.modules || []).map((row) => `
      <article class="report-row">
        <div>
          <strong>${escapeHtml(row.subject_name)} / ${escapeHtml(row.category_name)}</strong>
          <span>${row.item_count} 项 / 背 ${row.review_count} 次 / 薄弱 ${row.weak_count} 项</span>
        </div>
        <span class="badge">均分 ${row.avg_mastery}</span>
      </article>
    `).join("")}
  `;
}

function formatDate(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadAll().catch((err) => alert(err.message));
