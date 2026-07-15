const state = {
  catalog: null,
  parsed: [],
  items: [],
  today: [],
  dreams: [],
  report: null,
  reviewIndex: 0,
  revealAnswer: false,
  selected: new Set(),
  expandedTexts: new Set(),
  rocket: {
    running: false,
    stage: 1,
    separatedStages: [],
    recoveredStages: [],
    recoveryTarget: 1,
    y: 330,
    velocity: 0,
    altitude: 0,
    maxAltitude: 0,
    fuel: 100,
    score: 0,
    animationId: null
  }
};

const $ = (id) => document.getElementById(id);

const studyMenus = [
  { subject: "语文", items: ["背诵", "生词", "课文/古诗"] },
  { subject: "英语", items: ["单词", "语法", "作文"] },
  { subject: "数学", items: ["定理", "公式", "错题"] },
  { subject: "物理", items: ["公式", "实验", "火箭游戏"] },
  { subject: "化学", items: ["方程式", "实验", "概念"] },
  { subject: "生物", items: ["概念", "图示", "背诵"] },
  { subject: "地理", items: ["地图", "概念", "背诵"] }
];

const routeMenus = {
  "#english-words": { subject: "英语", category: "单词" },
  "#words": { subject: "英语", category: "单词" },
  "#chinese-recite": { subject: "语文", category: "背诵" },
  "#rocket": { tab: "rocket" },
  "#dreams": { tab: "dreams" }
};

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
$("addDreamBtn").onclick = addDream;
$("launchRocketBtn").onclick = launchRocket;
$("stageRocketBtn").onclick = separateStage;
$("recoverRocketBtn").onclick = recoverRocket;
$("resetRocketBtn").onclick = resetRocket;
window.addEventListener("hashchange", handleRoute);
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
  await migrateLocalDreams();
  await loadDreams();
  resetRocket();
  handleRoute();
}

function renderCatalog() {
  fillSelect("childSelect", state.catalog.children, "name");
  fillSelect("subjectSelect", state.catalog.subjects, "name");
  fillSelect("categorySelect", state.catalog.categories, "name");
  fillSelect("subjectFilterSelect", state.catalog.subjects, "name", "全部科目");
  renderCategoryFilter();
  syncSubjectWithCategory();
  renderStudyMenu();
}

function renderStudyMenu() {
  $("subjectMenu").innerHTML = studyMenus.map((group) => `
    <article class="subject-card">
      <h3>${escapeHtml(group.subject)}</h3>
      <div class="subject-actions">
        ${group.items.map((item) => `
          <button type="button" onclick="openStudyMenu('${escapeJs(group.subject)}','${escapeJs(item)}')">${escapeHtml(item)}</button>
        `).join("")}
      </div>
    </article>
  `).join("");
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

function openStudyMenu(subjectName, categoryName) {
  const subject = state.catalog.subjects.find((row) => row.name === subjectName);
  if (subject) {
    $("subjectFilterSelect").value = String(subject.id);
  } else {
    $("subjectFilterSelect").value = "";
  }
  renderCategoryFilter();
  const categories = state.catalog.categories.filter((row) => !subject || String(row.subject_id || "") === String(subject.id));
  const category = categories.find((row) => row.name === categoryName || row.name.includes(categoryName) || categoryName.includes(row.name));
  $("categoryFilterSelect").value = category ? String(category.id) : "";
  $("keywordInput").value = "";
  $("tagFilterInput").value = "";
  document.querySelectorAll("#statusFilters input[type=checkbox]").forEach((input) => {
    input.checked = false;
  });
  showTab(categoryName === "火箭游戏" ? "rocket" : "items");
  if (categoryName !== "火箭游戏") loadItems();
}

function handleRoute() {
  const route = routeMenus[window.location.hash];
  if (!route || !state.catalog) return;
  if (route.tab) {
    showTab(route.tab);
    return;
  }
  openStudyMenu(route.subject, route.category);
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

async function addDream() {
  const text = $("dreamInput").value.trim();
  if (!text) return;
  await api("/api/dreams", {
    method: "POST",
    body: JSON.stringify({
      childId: Number($("childSelect").value),
      content: text,
      targetScore: $("dreamScoreInput").value ? Number($("dreamScoreInput").value) : null,
      targetDate: $("dreamDateInput").value || null
    })
  });
  $("dreamInput").value = "";
  $("dreamScoreInput").value = "";
  $("dreamDateInput").value = "";
  await loadDreams();
}

async function loadDreams() {
  const childId = $("childSelect")?.value;
  state.dreams = await api(`/api/dreams${childId ? `?childId=${childId}` : ""}`);
  renderDreams();
}

async function migrateLocalDreams() {
  const key = "student-study-dreams";
  const doneKey = "student-study-dreams-migrated";
  if (localStorage.getItem(doneKey)) return;
  let dreams = [];
  try {
    dreams = JSON.parse(localStorage.getItem(key) || "[]");
  } catch (error) {
    dreams = [];
  }
  for (const dream of dreams.reverse()) {
    const content = dream.text || dream.content;
    if (content) {
      await api("/api/dreams", {
        method: "POST",
        body: JSON.stringify({
          childId: Number($("childSelect").value),
          content,
          targetScore: null,
          targetDate: null
        })
      });
    }
  }
  localStorage.setItem(doneKey, "true");
}

function renderDreams() {
  const dreams = state.dreams || [];
  $("dreamList").innerHTML = dreams.length ? dreams.map((dream) => `
    <article class="dream-item">
      <div class="dream-head">
        <strong>${escapeHtml(formatDate(dream.created_at || dream.createdAt))}</strong>
        <button class="small-action" onclick="deleteDream(${dream.id})">删除</button>
      </div>
      <p>${escapeHtml(dream.content || dream.text)}</p>
      <div class="meta">
        ${dream.target_score ? `目标 ${dream.target_score} 分` : "未设置目标分"}
        ${dream.target_date ? ` / 目标日期 ${escapeHtml(dream.target_date)}` : ""}
      </div>
    </article>
  `).join("") : `<div class="empty-note">还没有记录梦想，可以先写下“270分、大别墅、阳台空调和猫”。</div>`;
}

async function deleteDream(id) {
  if (!confirm("确认删除这条梦想记录吗？")) return;
  await api(`/api/dreams/${id}`, { method: "DELETE" });
  await loadDreams();
}

function launchRocket() {
  if (state.rocket.fuel <= 0) return;
  state.rocket.running = true;
  drawRocket();
}

function separateStage() {
  if (!state.rocket.running) {
    $("rocketStatus").textContent = "先点击发射，再进行分离。";
    return;
  }
  if (state.rocket.stage >= 3) {
    $("rocketStatus").textContent = "两级都已分离，开始规划回收。";
    return;
  }
  const separated = state.rocket.stage;
  if (!state.rocket.separatedStages.includes(separated)) {
    state.rocket.separatedStages.push(separated);
  }
  state.rocket.stage += 1;
  state.rocket.score += separated === 1 ? 80 : 120;
  updateRocketButtons();
  $("rocketStatus").textContent = `${separated}级已分离，剩余火箭变轻，继续观察高度和燃料。`;
  drawRocket();
}

function recoverRocket() {
  const target = state.rocket.recoveryTarget;
  if (!state.rocket.separatedStages.includes(target)) {
    $("rocketStatus").textContent = `还不能回收${target}级，请先完成分离。`;
    return;
  }
  if (state.rocket.recoveredStages.includes(target)) {
    state.rocket.recoveryTarget = Math.min(2, target + 1);
    updateRocketButtons();
    $("rocketStatus").textContent = `${target}级已经回收，准备下一层。`;
    return;
  }
  state.rocket.recoveredStages.push(target);
  state.rocket.score += target === 1 ? 160 : 220;
  state.rocket.recoveryTarget = Math.min(2, target + 1);
  updateRocketButtons();
  $("rocketStatus").textContent = `${target}级回收成功：降落伞打开，软着陆完成。`;
  drawRocket();
}

function resetRocket() {
  if (state.rocket.animationId) cancelAnimationFrame(state.rocket.animationId);
  state.rocket = {
    running: false,
    stage: 1,
    separatedStages: [],
    recoveredStages: [],
    recoveryTarget: 1,
    y: 330,
    velocity: 0,
    altitude: 0,
    maxAltitude: 0,
    fuel: 100,
    score: 0,
    animationId: null
  };
  updateRocketButtons();
  $("rocketStatus").textContent = "任务：发射、分离一级、回收一级，再分离二级并回收。推力大于重力时火箭上升。";
  drawRocketFrame();
}

function drawRocket() {
  if (state.rocket.animationId) cancelAnimationFrame(state.rocket.animationId);
  const step = () => {
    const thrust = Number($("thrustSlider").value);
    const gravity = Number($("gravitySlider").value);
    const massBonus = [1, 1.25, 1.52][Math.min(2, state.rocket.stage - 1)];
    const fuelRatio = Math.max(0.25, state.rocket.fuel / 100);
    const acceleration = ((thrust * massBonus * fuelRatio) - gravity) * 0.018;
    if (state.rocket.running) {
      state.rocket.fuel = Math.max(0, state.rocket.fuel - thrust * 0.018);
      state.rocket.velocity -= acceleration;
      state.rocket.velocity *= 0.985;
      state.rocket.y = Math.max(28, Math.min(340, state.rocket.y + state.rocket.velocity));
      state.rocket.altitude = Math.max(0, Math.round((340 - state.rocket.y) * 18));
      state.rocket.maxAltitude = Math.max(state.rocket.maxAltitude, state.rocket.altitude);
      state.rocket.score = Math.max(state.rocket.score, Math.round(state.rocket.maxAltitude / 8));
      if (state.rocket.fuel <= 0 && state.rocket.velocity > 0) {
        state.rocket.velocity += gravity * 0.01;
      }
      if (state.rocket.y >= 339 && state.rocket.fuel <= 0) {
        state.rocket.running = false;
        state.rocket.velocity = 0;
        $("rocketStatus").textContent = rocketSummary("燃料耗尽，飞行结束");
      } else {
        $("rocketStatus").textContent = rocketSummary(`${state.rocket.stage > 2 ? "载荷入轨段" : `${state.rocket.stage}级飞行`}`);
      }
    }
    drawRocketFrame();
    if (state.rocket.running) {
      state.rocket.animationId = requestAnimationFrame(step);
    }
  };
  state.rocket.animationId = requestAnimationFrame(step);
}

function updateRocketButtons() {
  $("stageRocketBtn").textContent = state.rocket.stage === 1 ? "分离一级" : "分离二级";
  $("stageRocketBtn").disabled = state.rocket.stage >= 3;
  const target = state.rocket.recoveryTarget;
  $("recoverRocketBtn").textContent = `回收${target}级`;
  $("recoverRocketBtn").disabled = !state.rocket.separatedStages.includes(target) || state.rocket.recoveredStages.includes(2);
}

function rocketSummary(prefix) {
  return `${prefix} / 高度 ${state.rocket.altitude} m / 最高 ${state.rocket.maxAltitude} m / 燃料 ${Math.round(state.rocket.fuel)}% / 已回收 ${state.rocket.recoveredStages.length} 层 / 得分 ${state.rocket.score}`;
}

function drawRocketFrame() {
  const canvas = $("rocketCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#e3f7ff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#dff2de";
  ctx.fillRect(0, height - 48, width, 48);
  ctx.strokeStyle = "rgba(47, 113, 76, 0.22)";
  for (let y = 50; y < height - 50; y += 50) {
    ctx.beginPath();
    ctx.moveTo(18, y);
    ctx.lineTo(width - 18, y);
    ctx.stroke();
  }
  const x = width / 2;
  const y = state.rocket.y;
  ctx.fillStyle = state.rocket.stage === 1 ? "#3f8f62" : state.rocket.stage === 2 ? "#3d8aa8" : "#7a6bb4";
  ctx.beginPath();
  ctx.moveTo(x, y - 34);
  ctx.lineTo(x - 16, y - 2);
  ctx.lineTo(x + 16, y - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fffdf4";
  ctx.fillRect(x - 13, y - 2, 26, 58);
  ctx.fillStyle = "#bf4d43";
  ctx.fillRect(x - 18, y + 32, 8, 24);
  ctx.fillRect(x + 10, y + 32, 8, 24);
  if (state.rocket.running && state.rocket.fuel > 0) {
    ctx.fillStyle = "#f2c94c";
    ctx.beginPath();
    ctx.moveTo(x, y + 70);
    ctx.lineTo(x - 12, y + 52);
    ctx.lineTo(x + 12, y + 52);
    ctx.closePath();
    ctx.fill();
  }
  drawRecoveredStages(ctx, width, height);
  ctx.fillStyle = "#28493f";
  ctx.font = "12px sans-serif";
  ctx.fillText(`燃料 ${Math.round(state.rocket.fuel)}%`, 14, 22);
  ctx.fillText(`得分 ${state.rocket.score}`, width - 78, 22);
}

function drawRecoveredStages(ctx, width, height) {
  state.rocket.separatedStages.forEach((stage, index) => {
    const recovered = state.rocket.recoveredStages.includes(stage);
    const x = 48 + index * 62;
    const y = height - 78;
    ctx.fillStyle = recovered ? "#3f8f62" : "#bf4d43";
    ctx.fillRect(x - 10, y, 20, 32);
    ctx.strokeStyle = "#7a6bb4";
    ctx.beginPath();
    ctx.arc(x, y - 4, 18, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = "#28493f";
    ctx.font = "11px sans-serif";
    ctx.fillText(`${stage}级${recovered ? "回收" : "下降"}`, x - 22, y + 48);
  });
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
