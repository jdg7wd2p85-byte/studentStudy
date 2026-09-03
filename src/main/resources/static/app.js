const state = {
  catalog: null,
  parsed: [],
  items: [],
  today: [],
  dreams: [],
  report: null,
  dailyAnalysis: null,
  weeklySchedule: null,
  activeScheduleId: null,
  itemRequestSeq: 0,
  itemPage: 1,
  itemPageSize: 50,
  itemTotal: 0,
  itemTotalPages: 1,
  itemPageLoading: false,
  choiceWrongOnly: false,
  restoringUrl: false,
  speechSeq: 0,
  reviewIndex: 0,
  revealAnswer: false,
  selected: new Set(),
  expandedTexts: new Set(),
  wordBroadcast: {
    running: false,
    paused: false,
    items: [],
    index: 0,
    repeat: 0,
    repeatTotal: 1,
    intervalMs: 800,
    label: "朗读",
    timerId: null
  },
  textReader: {
    running: false,
    paused: false,
    segments: [],
    index: 0,
    repeat: 0,
    repeatTotal: 1,
    intervalMs: 0,
    timerId: null
  },
  rocket: {
    running: false,
    stage: 1,
    separatedStages: [],
    recoveredStages: [],
    recoveryTarget: 1,
    velocity: 0,
    altitude: 0,
    maxAltitude: 0,
    fuel: 100,
    score: 0,
    animationId: null,
    lastFrameTime: null
  }
};

const IMAGE_PARSE_PROMPT = `请从我上传的图片中提取学习内容，整理成可导入学习网站的结构化数据。

要求：
1. 只提取图片中清晰可见的内容，不要编造、补写或扩写。
2. 先判断内容类型，再选择对应结构：
   - 英语单词：subject=英语，category=单词，title=英文单词，answer=中文释义。
   - 英语词组/短语：subject=英语，category=词组，title=英文词组，answer=中文释义。
   - 语文课文/古诗/背诵：subject=语文，category=课文/古诗或背诵，title=文章标题，content=完整课文内容，answer留空。
   - 数学/物理/化学等知识点：subject按图片内容判断，category按内容判断，title=知识点标题，content=完整内容，answer=答案或结论。
3. 语文课文不要拆成多条，不要拆成 title/answer 对照；一篇文章输出一条，content 必须尽量完整保留原文换行。
4. 英语内容保留 sb., sth., ..., /, 括号等形式；中文释义保持原意。
5. 如果同一条内容重复出现，只保留一条；标题和内容或释义完全相同也只保留一条。
6. 输出 JSON 数组，不要输出解释文字。

输出格式示例：
[
  {
    "title": "fall in love with",
    "answer": "爱上",
    "subject": "英语",
    "category": "词组",
    "tags": ["英文词组", "中考词组", "图片导入"]
  },
  {
    "title": "春",
    "content": "完整课文内容放这里，保留必要换行。",
    "answer": "",
    "subject": "语文",
    "category": "课文/古诗",
    "tags": ["语文课文", "图片导入"]
  }
]`;

const $ = (id) => document.getElementById(id);

const studyMenus = [
  { subject: "语文", items: ["背诵", "生词", "课文/古诗"] },
  { subject: "英语", items: ["单词", "词组", "句子/短语", "语法", "作文"] },
  { subject: "数学", items: ["定理", "公式", "错题"] },
  { subject: "物理", items: ["公式", "实验", "火箭游戏"] },
  { subject: "化学", items: ["方程式", "实验", "概念"] },
  { subject: "生物", items: ["概念", "图示", "背诵"] },
  { subject: "地理", items: ["地图", "概念", "背诵"] }
];

const routeMenus = {
  "#english-words": { subject: "英语", category: "单词" },
  "#english-phrases": { subject: "英语", category: "词组" },
  "#words": { subject: "英语", category: "单词" },
  "#chinese-recite": { subject: "语文", category: "背诵" },
  "#rocket": { tab: "rocket" },
  "#dreams": { tab: "dreams" },
  "#reader": { tab: "reader" },
  "#analysis": { tab: "analysis" },
  "#schedule": { tab: "schedule" }
};

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    showTab(btn.dataset.tab);
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
$("scheduleCloseBtn").onclick = closeScheduleModal;
$("scheduleModal").onclick = (event) => {
  if (event.target.id === "scheduleModal") closeScheduleModal();
};
$("parseBtn").onclick = parseInput;
$("saveParsedBtn").onclick = saveParsed;
$("copyImagePromptBtn").onclick = copyImageParsePrompt;
$("searchBtn").onclick = resetItemPageAndLoad;
$("resetFiltersBtn").onclick = resetFilters;
$("copyCurrentUrlBtn").onclick = copyCurrentUrl;
$("previousItemsPageBtn").onclick = () => changeItemPage(-1);
$("nextItemsPageBtn").onclick = () => changeItemPage(1);
$("itemsPageSizeSelect").onchange = () => {
  state.itemPageSize = Number($("itemsPageSizeSelect").value) || 50;
  resetItemPageAndLoad();
};
$("filterWeakWordsBtn").onclick = filterWeakVocabulary;
$("playVisibleWordsBtn").onclick = () => startWordBroadcast({ repeatTotal: 1, intervalMs: 800, label: "列表朗读" });
$("dictateVisibleWordsBtn").onclick = () => startWordBroadcast({ repeatTotal: 3, intervalMs: 3000, label: "听写" });
$("pauseWordBroadcastBtn").onclick = toggleWordBroadcastPause;
$("stopWordBroadcastBtn").onclick = () => stopWordBroadcast(true);
$("readerFromVisibleBtn").onclick = () => fillReaderFromItems(state.items);
$("readerFromSelectedBtn").onclick = () => fillReaderFromItems(state.items.filter((item) => state.selected.has(Number(item.id))));
$("startTextReaderBtn").onclick = startTextReader;
$("pauseTextReaderBtn").onclick = toggleTextReaderPause;
$("stopTextReaderBtn").onclick = () => stopTextReader(true);
$("selectVisibleBtn").onclick = toggleSelectVisible;
$("makePaperBtn").onclick = makePaper;
$("makePaperFromListBtn").onclick = makePaper;
$("makeChoiceQuizBtn").onclick = makeChoiceQuiz;
$("makeChoiceFromListBtn").onclick = makeChoiceQuiz;
$("paperWeakWordsBtn").onclick = filterWeakWordsForPractice;
$("paperSelectVisibleBtn").onclick = selectVisibleVocabularyForPractice;
$("paperPlayWeakWordsBtn").onclick = startChoiceWrongBroadcast;
$("choiceDirectionListSelect").onchange = () => {
  $("choiceDirectionSelect").value = $("choiceDirectionListSelect").value;
};
$("choiceDirectionSelect").onchange = () => {
  $("choiceDirectionListSelect").value = $("choiceDirectionSelect").value;
};
$("deleteSelectedBtn").onclick = deleteSelectedItems;
$("historySelectedBtn").onclick = viewSelectedHistory;
$("analysisLoadBtn").onclick = loadDailyAnalysis;
$("scheduleLoadBtn").onclick = loadWeekSchedule;
$("scheduleAddBtn").onclick = addScheduleItem;
$("scheduleCopyDayBtn").onclick = copyScheduleDay;
$("scheduleSaveOrderBtn").onclick = saveScheduleOrder;
$("scheduleModalCopyBtn").onclick = () => copyScheduleItem(state.activeScheduleId);
$("scheduleModalDoneBtn").onclick = () => {
  const item = activeScheduleItem();
  checkScheduleItem(state.activeScheduleId, item?.checkin_status !== "DONE");
};
$("scheduleModalTemplateSaveBtn").onclick = () => saveScheduleTemplate(state.activeScheduleId);
$("scheduleModalSaveBtn").onclick = () => saveScheduleItem(state.activeScheduleId);
$("scheduleModalDeleteBtn").onclick = () => deleteScheduleItem(state.activeScheduleId);
$("addDreamBtn").onclick = addDream;
$("launchRocketBtn").onclick = launchRocket;
$("stageRocketBtn").onclick = separateStage;
$("recoverRocketBtn").onclick = recoverRocket;
$("resetRocketBtn").onclick = resetRocket;
window.addEventListener("hashchange", handleRoute);
window.addEventListener("popstate", handleRoute);
$("categorySelect").addEventListener("change", () => {
  syncSubjectWithCategory();
  syncListFilterWithCategory();
  resetItemPageAndLoad();
});
$("subjectFilterSelect").addEventListener("change", () => {
  renderCategoryFilter();
  resetItemPageAndLoad();
});
$("categoryFilterSelect").addEventListener("change", resetItemPageAndLoad);
$("scheduleChildSelect").addEventListener("change", () => {
  loadWeekSchedule();
  loadDailyAnalysis();
});
$("scheduleSubjectSelect").addEventListener("change", renderScheduleCategorySelect);
$("scheduleModalSubject").addEventListener("change", renderScheduleModalCategorySelect);
document.querySelectorAll("#statusFilters input[type=checkbox]").forEach((input) => {
  input.addEventListener("change", resetItemPageAndLoad);
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
  initializeDates();
  applyUrlState();
  updateTextReaderControls();
  await Promise.all([loadItems(), loadToday(), loadReport(), loadDailyAnalysis(), loadWeekSchedule()]);
  await migrateLocalDreams();
  await loadDreams();
  resetRocket();
}

function renderCatalog() {
  fillSelect("childSelect", state.catalog.children, "name");
  fillSelect("subjectSelect", state.catalog.subjects, "name");
  fillSelect("categorySelect", state.catalog.categories, "name");
  fillSelect("subjectFilterSelect", state.catalog.subjects, "name", "全部科目");
  fillSelect("scheduleChildSelect", state.catalog.children, "name");
  fillSelect("scheduleSubjectSelect", state.catalog.subjects, "name", "不限定科目");
  $("scheduleWeekDaySelect").innerHTML = renderWeekDayOptions($("scheduleWeekDaySelect").value);
  $("scheduleCopyDaySource").innerHTML = renderWeekDayOptions("1");
  $("scheduleCopyDayTarget").innerHTML = renderWeekDayOptions("2");
  $("scheduleModalWeekDay").innerHTML = renderWeekDayOptions();
  fillSelect("scheduleModalSubject", state.catalog.subjects, "name", "不限定科目");
  renderScheduleCategorySelect();
  renderScheduleModalCategorySelect();
  renderCategoryFilter();
  syncSubjectWithCategory();
  renderStudyMenu();
}

function initializeDates() {
  const today = localDateKey(new Date());
  if (!$("analysisDateInput").value) $("analysisDateInput").value = today;
  if (!$("scheduleWeekStartInput").value) $("scheduleWeekStartInput").value = weekStartKey(new Date());
  if (!$("scheduleWeekDaySelect").value) $("scheduleWeekDaySelect").value = String(new Date().getDay() || 7);
}

function renderStudyMenu() {
  $("subjectMenu").innerHTML = homeMenuGroups().map((group) => `
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

function homeMenuGroups() {
  if (!state.catalog?.subjects?.length || !state.catalog?.categories?.length) {
    return studyMenus;
  }
  return studyMenus.map((fallback) => {
    const subject = state.catalog.subjects.find((row) => row.name === fallback.subject);
    const categoryNames = subject
      ? state.catalog.categories
          .filter((row) => String(row.subject_id || "") === String(subject.id))
          .map((row) => row.name)
      : [];
    const extras = fallback.items.filter((name) =>
      !categoryNames.some((categoryName) => categoryName === name || categoryName.includes(name) || name.includes(categoryName))
    );
    return { subject: fallback.subject, items: [...categoryNames, ...extras] };
  });
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

function renderScheduleCategorySelect() {
  const subjectId = $("scheduleSubjectSelect")?.value;
  const categories = subjectId
    ? state.catalog.categories.filter((row) => String(row.subject_id || "") === String(subjectId))
    : state.catalog.categories;
  fillSelect("scheduleCategorySelect", categories, "name", "不限定类别");
}

function renderScheduleModalCategorySelect() {
  const subjectId = $("scheduleModalSubject")?.value;
  const categories = subjectId
    ? state.catalog.categories.filter((row) => String(row.subject_id || "") === String(subjectId))
    : state.catalog.categories;
  fillSelect("scheduleModalCategory", categories, "name", "不限定类别");
}

function renderWeekDayOptions(selected = "") {
  const options = weekDayLabels().map((label, index) => {
    const value = String(index + 1);
    return `<option value="${value}" ${String(selected) === value ? "selected" : ""}>${label}</option>`;
  });
  return options.join("");
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
  applyStudyMenuFilter(subjectName, categoryName);
  showTab(categoryName === "火箭游戏" ? "rocket" : "items");
  if (categoryName !== "火箭游戏") resetItemPageAndLoad();
}

function applyStudyMenuFilter(subjectName, categoryName) {
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
  state.itemPage = 1;
}

function handleRoute() {
  if (!state.catalog) return;
  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length) {
    applyUrlState();
    loadItems();
    return;
  }
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
      ${renderVocabularyDetails(item)}
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

async function copyImageParsePrompt() {
  try {
    await navigator.clipboard.writeText(IMAGE_PARSE_PROMPT);
    alert("图片解析提示词已复制");
  } catch (error) {
    window.prompt("浏览器不允许自动复制，请长按/全选复制下面内容", IMAGE_PARSE_PROMPT);
  }
}

async function copyCurrentUrl() {
  updateUrlFromState();
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    alert("当前筛选链接已复制");
  } catch (error) {
    window.prompt("浏览器不允许自动复制，请长按/全选复制下面链接", url);
  }
}

async function loadItems() {
  const requestSeq = ++state.itemRequestSeq;
  const params = new URLSearchParams();
  if ($("keywordInput")?.value) params.set("keyword", $("keywordInput").value);
  if ($("subjectFilterSelect")?.value) params.set("subjectId", $("subjectFilterSelect").value);
  if ($("categoryFilterSelect")?.value) params.set("categoryId", $("categoryFilterSelect").value);
  if ($("tagFilterInput")?.value) params.set("tag", $("tagFilterInput").value);
  const statuses = selectedStatuses();
  if (statuses.length) params.set("reviewStatus", statuses.join(","));
  params.set("page", state.itemPage);
  params.set("pageSize", state.itemPageSize);
  const result = await api(`/api/items/page?${params}`);
  if (requestSeq !== state.itemRequestSeq) return;
  state.items = result.items || [];
  state.itemPage = Number(result.page) || 1;
  state.itemPageSize = Number(result.pageSize) || state.itemPageSize;
  state.itemTotal = Number(result.total) || 0;
  state.itemTotalPages = Number(result.totalPages) || 1;
  renderItems();
  renderItemsPagination();
  updateSelectionBar();
  updateUrlFromState();
}

function resetItemPageAndLoad() {
  state.itemPage = 1;
  updateUrlFromState();
  loadItems();
}

async function changeItemPage(offset) {
  if (state.itemPageLoading) return;
  const nextPage = Math.max(1, Math.min(state.itemTotalPages, state.itemPage + offset));
  if (nextPage === state.itemPage) return;
  const previousPage = state.itemPage;
  state.itemPage = nextPage;
  state.itemPageLoading = true;
  renderItemsPagination();
  try {
    await loadItems();
    updateUrlFromState();
  } catch (error) {
    state.itemPage = previousPage;
    alert(`第 ${nextPage} 页加载失败：${error.message || "请稍后重试"}`);
  } finally {
    state.itemPageLoading = false;
    renderItemsPagination();
  }
}

function renderItemsPagination() {
  $("itemsPageInfo").textContent = state.itemPageLoading
    ? `正在加载第 ${state.itemPage} 页…`
    : `第 ${state.itemPage} / ${state.itemTotalPages} 页 · 共 ${state.itemTotal} 条`;
  $("previousItemsPageBtn").disabled = state.itemPageLoading || state.itemPage <= 1;
  $("nextItemsPageBtn").disabled = state.itemPageLoading || state.itemPage >= state.itemTotalPages;
  $("itemsPageSizeSelect").value = String(state.itemPageSize);
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
  resetItemPageAndLoad();
}

function filterWeakVocabulary() {
  setWeakWordFilters();
  resetItemPageAndLoad();
}

function filterWeakWordsForPractice() {
  const questions = [...document.querySelectorAll("#paperPreview .choice-question")];
  if (!questions.length) {
    alert("请先生成选择题，再筛本页错题");
    setPaperFilterStatus("请先生成选择题，再筛本页答错的题");
    return;
  }
  if (state.choiceWrongOnly) {
    questions.forEach((question) => {
      question.hidden = false;
    });
    state.choiceWrongOnly = false;
    $("paperWeakWordsBtn").textContent = "只看本页错题";
    setPaperFilterStatus(`已显示全部 ${questions.length} 道选择题`);
    return;
  }
  const answered = questions.filter((question) => question.dataset.result);
  const wrong = questions.filter((question) => question.dataset.result === "wrong");
  if (!answered.length) {
    setPaperFilterStatus("还没有作答，答完后再筛本页错题");
    return;
  }
  questions.forEach((question) => {
    question.hidden = question.dataset.result !== "wrong";
  });
  state.choiceWrongOnly = true;
  $("paperWeakWordsBtn").textContent = "显示全部题";
  setPaperFilterStatus(`本页已答 ${answered.length} 道，答错 ${wrong.length} 道`);
}

function setWeakWordFilters() {
  const english = state.catalog?.subjects?.find((subject) => subject.name === "英语");
  $("keywordInput").value = "";
  $("subjectFilterSelect").value = english ? String(english.id) : "";
  renderCategoryFilter();
  const wordCategory = state.catalog?.categories?.find((category) =>
    category.code === "WORD" || category.name === "单词"
  );
  $("categoryFilterSelect").value = wordCategory ? String(wordCategory.id) : "";
  $("tagFilterInput").value = "";
  document.querySelectorAll("#statusFilters input[type=checkbox]").forEach((input) => {
    input.checked = input.value === "forgot" || input.value === "vague";
  });
  state.itemPage = 1;
}

function selectVisibleVocabularyForPractice() {
  const ids = state.items
    .filter((item) => isVocabularyItem(item))
    .map((item) => Number(item.id))
    .filter((id) => Number.isFinite(id));
  if (!ids.length) {
    alert("当前页没有可选的英语词汇，请先筛错误单词");
    return;
  }
  ids.forEach((id) => state.selected.add(id));
  renderItems();
  setPaperFilterStatus(`已选本页 ${ids.length} 个错误词，可生成选择题`);
}

function setPaperFilterStatus(message) {
  if ($("paperFilterStatus")) {
    $("paperFilterStatus").textContent = message;
  }
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
  updateWordBroadcastControls();
}

function visibleItemIds() {
  return state.items.map((item) => Number(item.id)).filter((id) => Number.isFinite(id));
}

function toggleSelectVisible() {
  const ids = visibleItemIds();
  if (!ids.length) return;
  const allSelected = ids.every((id) => state.selected.has(id));
  ids.forEach((id) => {
    if (allSelected) {
      state.selected.delete(id);
    } else {
      state.selected.add(id);
    }
  });
  renderItems();
}

function renderItemCard(item) {
  const meta = `${escapeHtml(item.category_name)} / ${escapeHtml(item.subject_name)} / 录入 ${formatDate(item.first_learned_at)} / 掌握分 ${item.mastery_score} / 下次 ${formatDate(item.next_review_at)}`;
  const exampleButton = renderExampleSpeechButton(item, "读例句");
  const itemReadButton = renderItemReadButton(item);
  const recordingActions = renderRecordingActions(item);
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
          ${itemReadButton}
          <button class="small-action" onclick="toggleTextExpand(${item.id})">${expanded ? "收起全文" : "展开全文"}</button>
          ${recordingActions}
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
      ${renderVocabularyDetails(item)}
      <div class="inline-actions">
        ${itemReadButton}
        ${exampleButton}
        ${recordingActions}
        <button class="small-action" onclick="viewItemHistory(${item.id})">记录</button>
      </div>
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
      <div class="inline-actions">${renderItemReadButton(item)} ${renderRecordingActions(item)}</div>
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
      <div class="speech-row">${renderItemReadButton(item)}</div>
      ${item.prompt ? `<div class="card-prompt">${escapeHtml(item.prompt)}</div>` : ""}
    </div>
    <button class="answer-toggle" onclick="toggleAnswer()">${state.revealAnswer ? "隐藏答案" : "显示答案"}</button>
    <div class="answer-panel ${state.revealAnswer ? "" : "hidden"}">
      <div class="card-label">答案</div>
      <div class="answer">${escapeHtml(item.answer || item.content || "无答案")}</div>
      ${item.explanation ? `<div class="answer">${escapeHtml(item.explanation)}</div>` : ""}
      ${renderVocabularyDetails(item)}
      ${renderExampleSpeechButton(item, "读例句")}
      <div class="inline-actions">${renderRecordingActions(item)}</div>
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

function isWordItem(item) {
  return item.itemType === "WORD" ||
    item.item_type === "WORD" ||
    item.category_code === "WORD" ||
    item.categoryCode === "WORD" ||
    item.category_name === "英语单词" ||
    item.category_name === "单词";
}

function isVocabularyItem(item) {
  return isWordItem(item) ||
    item.itemType === "SENTENCE" ||
    item.item_type === "SENTENCE" ||
    item.itemType === "PHRASE" ||
    item.item_type === "PHRASE" ||
    item.category_code === "SENTENCE" ||
    item.categoryCode === "SENTENCE" ||
    item.category_code === "PHRASE" ||
    item.categoryCode === "PHRASE" ||
    item.category_name === "句子/短语" ||
    item.category_name === "短语" ||
    item.category_name === "词组";
}

function renderVocabularyDetails(item) {
  if (!isVocabularyItem(item)) return "";
  const extra = itemExtraFields(item);
  const rows = [
    detailRow("例句", extra, ["exampleSentence", "sentence", "example"]),
    detailRow("中文", extra, ["exampleTranslation", "sentenceTranslation", "translation"]),
    detailRow("相似词", extra, ["similarWords", "synonyms", "synonym"]),
    detailRow("反义词", extra, ["antonyms", "antonym", "opposite"]),
    detailRow("常见搭配", extra, ["phrase", "phrases"]),
    detailRow("音标", extra, ["phonetic", "ipa"])
  ].filter(Boolean);
  if (!rows.length) return "";
  return `<dl class="vocab-details">${rows.join("")}</dl>`;
}

function renderExampleSpeechButton(item, label = "读例句") {
  const sentence = firstExtraValue(itemExtraFields(item), ["exampleSentence", "sentence", "example"]);
  if (!sentence || !isLikelyEnglish(sentence)) return "";
  return renderSpeechButton(sentence, label);
}

function renderItemReadButton(item) {
  if (isVocabularyItem(item)) {
    return [
      renderReadAction("读英文", item.title),
      renderReadAction("读中文", item.answer || item.content || "")
    ].filter(Boolean).join(" ");
  }
  const text = readerLinesForItem(item).filter(Boolean).join("\n");
  if (!text) return "";
  return renderReadAction(isLongTextItem(item) ? "朗读正文" : "朗读", text);
}

function renderReadAction(label, text) {
  const value = String(text ?? "").trim();
  if (!value) return "";
  return `<button type="button" class="small-action read-btn" onclick="readItemText(decodeURIComponent('${encodeURIComponent(value)}'), 1, 0)">${escapeHtml(label)}</button>`;
}

function renderRecordingActions(item) {
  const extra = itemExtraFields(item);
  const url = firstExtraValue(extra, ["recordingUrl", "recordUrl", "audioUrl"]);
  const buttons = [
    `<button type="button" class="small-action recording-btn" onclick="saveRecordingLink(${Number(item.id)})">${url ? "改录音" : "贴录音"}</button>`
  ];
  if (url) {
    buttons.unshift(`<button type="button" class="small-action recording-link-btn" onclick="openExternalLink(decodeURIComponent('${encodeURIComponent(String(url))}'))">打开录音</button>`);
  }
  return buttons.join("");
}

function detailRow(label, extra, keys) {
  const value = firstExtraValue(extra, keys);
  if (!value) return "";
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatExtraValue(value))}</dd></div>`;
}

function firstExtraValue(extra, keys) {
  for (const key of keys) {
    if (extra[key] !== undefined && extra[key] !== null && String(extra[key]).trim() !== "") {
      return extra[key];
    }
  }
  return "";
}

function formatExtraValue(value) {
  if (Array.isArray(value)) return value.join("，");
  return String(value);
}

function itemExtraFields(item) {
  if (item.extraFields && typeof item.extraFields === "object") return item.extraFields;
  const raw = item.extra_json || item.extraJson;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveRecordingLink(itemId) {
  const item = state.items.find((row) => Number(row.id) === Number(itemId)) || state.today.find((row) => Number(row.id) === Number(itemId));
  const extra = item ? itemExtraFields(item) : {};
  const currentUrl = firstExtraValue(extra, ["recordingUrl", "recordUrl", "audioUrl"]);
  const url = prompt("粘贴跟读录音链接。留空可以清除已有链接。", currentUrl || "");
  if (url === null) return;
  const updated = await api(`/api/items/${itemId}/recording`, {
    method: "POST",
    body: JSON.stringify({ url: url.trim(), note: "" })
  });
  replaceItemInState(updated);
  renderItems();
  renderReview();
  alert(url.trim() ? "录音链接已保存" : "录音链接已清除");
}

function replaceItemInState(item) {
  const id = Number(item.id);
  state.items = state.items.map((row) => Number(row.id) === id ? item : row);
  state.today = state.today.map((row) => Number(row.id) === id ? item : row);
}

function openExternalLink(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener");
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

async function makeChoiceQuiz() {
  const itemIds = [...state.selected];
  if (!itemIds.length) {
    alert("请先在列表里勾选单词");
    return;
  }
  const direction = $("choiceDirectionSelect").value;
  const questions = await api("/api/practice/choices", {
    method: "POST",
    body: JSON.stringify({ itemIds, direction })
  });
  state.choiceWrongOnly = false;
  showTab("paper");
  $("paperWeakWordsBtn").textContent = "只看本页错题";
  $("paperPreview").innerHTML = `
    <h3>${direction === "CN_TO_EN" ? "中文选英文" : "英文选中文"}</h3>
    ${questions.map(renderChoiceQuestion).join("")}
  `;
  setPaperFilterStatus(`已生成 ${questions.length} 道选择题，作答后可只看本页错题`);
}

function renderChoiceQuestion(question, index) {
  const showSpeech = question.direction === "EN_TO_CN" && isLikelyEnglish(question.prompt);
  return `
    <article class="choice-question" data-item-id="${question.itemId}" data-direction="${escapeHtml(question.direction)}" data-prompt="${escapeHtml(question.prompt)}" data-correct="${escapeHtml(question.correctOption)}">
      <div class="choice-head">
        <span class="badge">${index + 1}</span>
        <strong>${escapeHtml(question.prompt)}</strong>
        ${showSpeech ? renderSpeechButton(question.prompt, "读音") : ""}
      </div>
      <div class="choice-options">
        ${(question.options || []).map((option) => `
          <button type="button" onclick="chooseOption(this)">${escapeHtml(option)}</button>
        `).join("")}
      </div>
      <div class="choice-result"></div>
    </article>
  `;
}

function renderSpeechButton(word, label = "读音") {
  const text = String(word ?? "").trim();
  if (!text || !isLikelyEnglish(text)) return "";
  return `<button type="button" class="small-action speech-btn" onclick="speakWord('${escapeJs(text)}')">${escapeHtml(label)}</button>`;
}

function isLikelyEnglish(value) {
  const text = String(value ?? "").trim();
  return /^[A-Za-z][A-Za-z' -]*$/.test(text);
}

function speakWord(word) {
  stopWordBroadcast(false);
  stopTextReader(false);
  speakText(word);
}

function readItemText(text, repeatTotal = 1, intervalMs = 0) {
  stopWordBroadcast(false);
  startReaderSegments(splitReaderText(text), { repeatTotal, intervalMs });
}

function speakText(text, options = {}) {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    alert("当前浏览器不支持朗读");
    return false;
  }
  const token = ++state.speechSeq;
  const utterance = new SpeechSynthesisUtterance(String(text ?? "").trim());
  utterance.lang = options.lang || detectSpeechLang(text);
  utterance.rate = options.rate || 0.82;
  utterance.pitch = 1;
  if (options.onend) {
    utterance.onend = () => {
      if (token === state.speechSeq) options.onend();
    };
  }
  if (options.onerror) {
    utterance.onerror = () => {
      if (token === state.speechSeq) options.onerror();
    };
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

function cancelCurrentSpeech() {
  state.speechSeq += 1;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function detectSpeechLang(text) {
  return /[\u3400-\u9fff]/.test(String(text ?? "")) ? "zh-CN" : "en-US";
}

function fillReaderFromItems(items) {
  const text = items.flatMap(readerLinesForItem).filter(Boolean).join("\n");
  if (!text) {
    alert("当前没有可生成朗读稿的内容");
    return;
  }
  $("readerTextInput").value = text;
  showTab("reader");
  setTextReaderStatus(`已生成 ${splitReaderText(text).length} 段朗读内容`);
  updateTextReaderControls();
}

function readerLinesForItem(item) {
  const extra = itemExtraFields(item);
  if (isLongTextItem(item)) {
    return [item.content || item.answer || item.title || ""].filter(Boolean);
  }
  if (isVocabularyItem(item)) {
    return [
      item.title,
      item.answer || item.content || "",
      firstExtraValue(extra, ["exampleSentence", "sentence", "example"]),
      firstExtraValue(extra, ["exampleTranslation", "sentenceTranslation", "translation"])
    ].filter(Boolean);
  }
  return [item.title, item.answer || item.content || item.explanation || ""].filter(Boolean);
}

function splitReaderText(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .flatMap((line) => splitReaderLine(line))
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitReaderLine(line) {
  const text = String(line ?? "").trim();
  if (!text) return [];
  if (text.length <= 120) return [text];
  return text.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [text];
}

function startTextReader() {
  const segments = splitReaderText($("readerTextInput").value);
  if (!segments.length) {
    alert("请先输入或生成朗读文本");
    return;
  }
  startReaderSegments(segments);
}

function startReaderSegments(segments, options = {}) {
  if (!segments.length) {
    alert("没有可朗读的内容");
    return;
  }
  stopWordBroadcast(false);
  stopTextReader(false);
  const repeatTotal = options.repeatTotal ?? readerRepeatTotal();
  const intervalMs = options.intervalMs ?? readerIntervalMs();
  state.textReader = {
    running: true,
    paused: false,
    segments,
    index: 0,
    repeat: 0,
    repeatTotal: Math.max(1, Math.min(10, Number(repeatTotal) || 1)),
    intervalMs: Math.max(0, Number(intervalMs) || 0),
    timerId: null
  };
  updateTextReaderControls();
  playTextReaderStep();
}

function playTextReaderStep() {
  const reader = state.textReader;
  if (!reader.running || reader.paused) return;
  if (reader.index >= reader.segments.length) {
    stopTextReader(false, "朗读完成");
    return;
  }
  const repeatTotal = reader.repeatTotal || 1;
  const segment = reader.segments[reader.index];
  setTextReaderStatus(`${reader.index + 1}/${reader.segments.length} · 第 ${reader.repeat + 1}/${repeatTotal} 遍：${excerpt(segment, 36)}`);
  const started = speakText(segment, {
    onend: scheduleNextTextReaderStep,
    onerror: scheduleNextTextReaderStep
  });
  if (!started) {
    stopTextReader(false, "当前浏览器不支持朗读");
  }
}

function scheduleNextTextReaderStep() {
  const reader = state.textReader;
  if (!reader.running || reader.paused) return;
  reader.repeat += 1;
  if (reader.repeat >= (reader.repeatTotal || 1)) {
    reader.repeat = 0;
    reader.index += 1;
  }
  clearTimeout(reader.timerId);
  reader.timerId = setTimeout(playTextReaderStep, reader.intervalMs || 0);
}

function toggleTextReaderPause() {
  const reader = state.textReader;
  if (!reader.running) return;
  reader.paused = !reader.paused;
  clearTimeout(reader.timerId);
  reader.timerId = null;
  if (reader.paused) {
    window.speechSynthesis?.pause();
    setTextReaderStatus("已暂停");
  } else {
    cancelCurrentSpeech();
    playTextReaderStep();
  }
  updateTextReaderControls();
}

function stopTextReader(cancelSpeech = true, status = "未开始朗读") {
  const timerId = state.textReader?.timerId;
  if (timerId) clearTimeout(timerId);
  state.textReader = {
    running: false,
    paused: false,
    segments: [],
    index: 0,
    repeat: 0,
    repeatTotal: 1,
    intervalMs: 0,
    timerId: null
  };
  if (cancelSpeech && "speechSynthesis" in window) {
    cancelCurrentSpeech();
  }
  setTextReaderStatus(status);
  updateTextReaderControls();
}

function readerRepeatTotal() {
  return Math.max(1, Math.min(10, Number($("readerRepeatSelect")?.value) || 1));
}

function readerIntervalMs() {
  return Math.max(0, Math.min(30, Number($("readerIntervalSelect")?.value) || 0)) * 1000;
}

function setTextReaderStatus(status) {
  if ($("textReaderStatus")) {
    $("textReaderStatus").textContent = status;
  }
}

function updateTextReaderControls() {
  const reader = state.textReader;
  if ($("pauseTextReaderBtn")) {
    $("pauseTextReaderBtn").disabled = !reader.running;
    $("pauseTextReaderBtn").textContent = reader.paused ? "继续" : "暂停";
  }
  if ($("stopTextReaderBtn")) {
    $("stopTextReaderBtn").disabled = !reader.running;
  }
}

function startWordBroadcast(options = {}) {
  const directionSelectId = options.directionSelectId || "wordBroadcastDirectionSelect";
  const direction = $(directionSelectId)?.value === "answer" ? "answer" : "title";
  const repeatTotal = Math.max(1, Number(options.repeatTotal) || 1);
  const items = state.items
    .map((item) => broadcastItemForReader(item, direction))
    .filter(Boolean);
  if (!items.length) {
    alert("当前列表没有可播报的内容");
    return;
  }
  stopTextReader(false);
  stopWordBroadcast(false);
  state.wordBroadcast = {
    running: true,
    paused: false,
    items,
    index: 0,
    repeat: 0,
    repeatTotal,
    intervalMs: Math.max(0, Number(options.intervalMs) || 0),
    label: options.label || (repeatTotal > 1 ? "听写" : "朗读"),
    timerId: null
  };
  updateWordBroadcastControls();
  playWordBroadcastStep();
}

function broadcastItemForReader(item, direction) {
  const title = String(item.title || "").trim();
  let text = "";
  if (isVocabularyItem(item)) {
    text = direction === "answer"
      ? String(item.answer || item.content || "").trim()
      : title;
  } else if (isLongTextItem(item)) {
    text = String(item.content || item.answer || title).trim();
  } else {
    text = String(item.answer || item.content || item.explanation || title).trim();
  }
  if (!text) return null;
  return { id: Number(item.id), title: title || excerpt(text, 18), text };
}

function startChoiceWrongBroadcast() {
  const questions = [...document.querySelectorAll("#paperPreview .choice-question")]
    .filter((question) => question.dataset.result === "wrong");
  if (!questions.length) {
    alert("当前选择题还没有答错的题");
    setPaperFilterStatus("当前选择题还没有答错的题");
    return;
  }
  const readEnglish = $("paperWordBroadcastDirectionSelect")?.value !== "answer";
  const items = questions.map((question) => {
    const direction = question.dataset.direction;
    const prompt = question.dataset.prompt || "";
    const correct = question.dataset.correct || "";
    const text = readEnglish
      ? (direction === "CN_TO_EN" ? correct : prompt)
      : (direction === "CN_TO_EN" ? prompt : correct);
    return {
      id: Number(question.dataset.itemId),
      title: prompt,
      text: String(text || prompt || correct).trim()
    };
  }).filter((item) => item.text);
  if (!items.length) {
    alert("当前错题没有可播报的内容");
    return;
  }
  stopTextReader(false);
  stopWordBroadcast(false);
  state.wordBroadcast = {
    running: true,
    paused: false,
    items,
    index: 0,
    repeat: 0,
    repeatTotal: 3,
    intervalMs: 3000,
    label: "错题听写",
    timerId: null
  };
  updateWordBroadcastControls();
  setPaperFilterStatus(`开始听写本页 ${items.length} 道错题`);
  playWordBroadcastStep();
}

function playWordBroadcastStep() {
  const broadcast = state.wordBroadcast;
  if (!broadcast.running || broadcast.paused) return;
  if (broadcast.index >= broadcast.items.length) {
    stopWordBroadcast(false, "播报完成");
    return;
  }
  const item = broadcast.items[broadcast.index];
  const repeatText = broadcast.repeatTotal > 1 ? ` · 第 ${broadcast.repeat + 1}/${broadcast.repeatTotal} 遍` : "";
  setWordBroadcastStatus(`${broadcast.label} ${broadcast.index + 1}/${broadcast.items.length} ${item.title}${repeatText}`);
  const started = speakText(item.text, {
    onend: () => scheduleNextWordBroadcastStep(),
    onerror: () => scheduleNextWordBroadcastStep()
  });
  if (!started) {
    stopWordBroadcast(false, "当前浏览器不支持朗读");
  }
}

function scheduleNextWordBroadcastStep() {
  const broadcast = state.wordBroadcast;
  if (!broadcast.running || broadcast.paused) return;
  broadcast.repeat += 1;
  if (broadcast.repeat >= broadcast.repeatTotal) {
    broadcast.repeat = 0;
    broadcast.index += 1;
  }
  clearTimeout(broadcast.timerId);
  broadcast.timerId = setTimeout(playWordBroadcastStep, broadcast.intervalMs);
}

function toggleWordBroadcastPause() {
  const broadcast = state.wordBroadcast;
  if (!broadcast.running) return;
  broadcast.paused = !broadcast.paused;
  clearTimeout(broadcast.timerId);
  broadcast.timerId = null;
  if (broadcast.paused) {
    window.speechSynthesis?.pause();
    setWordBroadcastStatus("已暂停");
  } else {
    cancelCurrentSpeech();
    playWordBroadcastStep();
  }
  updateWordBroadcastControls();
}

function stopWordBroadcast(cancelSpeech = true, status = "未开始播报") {
  const timerId = state.wordBroadcast?.timerId;
  if (timerId) clearTimeout(timerId);
  state.wordBroadcast = {
    running: false,
    paused: false,
    items: [],
    index: 0,
    repeat: 0,
    repeatTotal: 1,
    intervalMs: 800,
    label: "朗读",
    timerId: null
  };
  if (cancelSpeech) {
    cancelCurrentSpeech();
  }
  setWordBroadcastStatus(status);
  updateWordBroadcastControls();
}

function setWordBroadcastStatus(status) {
  if ($("wordBroadcastStatus")) {
    $("wordBroadcastStatus").textContent = status;
  }
}

function updateWordBroadcastControls() {
  const broadcast = state.wordBroadcast;
  const playableCount = state.items.filter((item) => isVocabularyItem(item) && isLikelyEnglish(item.title)).length;
  if ($("playVisibleWordsBtn")) {
    $("playVisibleWordsBtn").disabled = playableCount === 0;
  }
  if ($("pauseWordBroadcastBtn")) {
    $("pauseWordBroadcastBtn").disabled = !broadcast.running;
    $("pauseWordBroadcastBtn").textContent = broadcast.paused ? "继续" : "暂停";
  }
  if ($("stopWordBroadcastBtn")) {
    $("stopWordBroadcastBtn").disabled = !broadcast.running;
  }
}

async function chooseOption(button) {
  const question = button.closest(".choice-question");
  const correctOption = question.dataset.correct;
  const itemId = Number(question.dataset.itemId);
  const chosen = button.textContent;
  const correct = chosen === correctOption;
  const result = question.querySelector(".choice-result");
  question.dataset.result = correct ? "correct" : "wrong";
  question.querySelectorAll(".choice-options button").forEach((option) => {
    option.disabled = true;
    if (option.textContent === correctOption) option.classList.add("correct");
  });
  button.classList.add(correct ? "correct" : "wrong");
  result.textContent = correct ? "答对了，正在记录熟练..." : `答错了，正确答案：${correctOption}，正在记录不会...`;
  try {
    await api(`/api/reviews/${itemId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        rating: correct ? 3 : 0,
        note: correct ? "选择题答对，自动记录熟练" : "选择题答错，自动记录不会"
      })
    });
    await Promise.all([loadItems(), loadToday(), loadReport()]);
    result.textContent = correct ? "答对了，已记录为熟练" : `答错了，正确答案：${correctOption}，已记录为不会`;
  } catch (error) {
    result.textContent = `记录失败：${error.message || "请稍后重试"}`;
  }
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
  updateUrlFromState();
}

function activeTabId() {
  return document.querySelector(".panel.active")?.id || "home";
}

function updateUrlFromState() {
  if (state.restoringUrl || !state.catalog) return;
  const tab = activeTabId();
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (tab === "items") {
    const subject = selectedFilterSubject();
    const category = selectedFilterCategory();
    if (subject) params.set("subject", subject.name);
    if (category) params.set("category", category.name);
    if ($("keywordInput")?.value.trim()) params.set("keyword", $("keywordInput").value.trim());
    if ($("tagFilterInput")?.value.trim()) params.set("tag", $("tagFilterInput").value.trim());
    const statuses = selectedStatuses();
    if (statuses.length) params.set("status", statuses.join(","));
    if (state.itemPage > 1) params.set("page", String(state.itemPage));
    if (state.itemPageSize !== 50) params.set("pageSize", String(state.itemPageSize));
  }
  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function applyUrlState() {
  if (!state.catalog) return;
  state.restoringUrl = true;
  try {
    const params = new URLSearchParams(window.location.search);
    const route = routeMenus[window.location.hash];
    const tab = params.get("tab") || route?.tab || (route ? "items" : activeTabId());
    if (route?.subject || route?.category) {
      applyStudyMenuFilter(route.subject, route.category);
    }
    applyListFilterFromUrl(params);
    if (params.has("page")) {
      state.itemPage = Math.max(1, Number(params.get("page")) || 1);
    }
    if (params.has("pageSize")) {
      state.itemPageSize = Math.max(1, Number(params.get("pageSize")) || 50);
      $("itemsPageSizeSelect").value = String(state.itemPageSize);
    }
    showTab(tab || "home");
  } finally {
    state.restoringUrl = false;
  }
}

function applyListFilterFromUrl(params) {
  if (!params.has("subject") && !params.has("subjectId") && !params.has("category") && !params.has("categoryId")
      && !params.has("keyword") && !params.has("tag") && !params.has("status")) {
    return;
  }
  const subject = findSubjectFromParam(params.get("subjectId"), params.get("subject"));
  $("subjectFilterSelect").value = subject ? String(subject.id) : "";
  renderCategoryFilter();
  const category = findCategoryFromParam(params.get("categoryId"), params.get("category"), subject);
  $("categoryFilterSelect").value = category ? String(category.id) : "";
  $("keywordInput").value = params.get("keyword") || "";
  $("tagFilterInput").value = params.get("tag") || "";
  const statuses = new Set(String(params.get("status") || "").split(",").map((item) => item.trim()).filter(Boolean));
  document.querySelectorAll("#statusFilters input[type=checkbox]").forEach((input) => {
    input.checked = statuses.has(input.value);
  });
}

function selectedFilterSubject() {
  const id = Number($("subjectFilterSelect")?.value);
  return state.catalog.subjects.find((subject) => Number(subject.id) === id);
}

function selectedFilterCategory() {
  const id = Number($("categoryFilterSelect")?.value);
  return state.catalog.categories.find((category) => Number(category.id) === id);
}

function findSubjectFromParam(id, name) {
  if (id) {
    const byId = state.catalog.subjects.find((subject) => String(subject.id) === String(id));
    if (byId) return byId;
  }
  if (!name) return null;
  return state.catalog.subjects.find((subject) => subject.name === name);
}

function findCategoryFromParam(id, name, subject) {
  const categories = state.catalog.categories.filter((category) =>
    !subject || String(category.subject_id || "") === String(subject.id)
  );
  if (id) {
    const byId = categories.find((category) => String(category.id) === String(id));
    if (byId) return byId;
  }
  if (!name) return null;
  return categories.find((category) => category.name === name || category.name.includes(name) || name.includes(category.name));
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
    $("selectedCount").textContent = `本页 ${state.items.length} 项 / 共 ${state.itemTotal} 项 / 跨页已选 ${count} 项`;
  }
  if ($("historySelectedBtn")) {
    $("historySelectedBtn").disabled = count !== 1;
  }
  if ($("selectVisibleBtn")) {
    const ids = visibleItemIds();
    const allSelected = ids.length > 0 && ids.every((id) => state.selected.has(id));
    $("selectVisibleBtn").disabled = ids.length === 0;
    $("selectVisibleBtn").textContent = allSelected ? "取消当前全选" : "全选当前列表";
  }
  if ($("makePaperFromListBtn")) {
    $("makePaperFromListBtn").disabled = count === 0;
  }
  if ($("makePaperBtn")) {
    $("makePaperBtn").disabled = count === 0;
  }
  if ($("makeChoiceQuizBtn")) {
    $("makeChoiceQuizBtn").disabled = count === 0;
  }
  if ($("makeChoiceFromListBtn")) {
    $("makeChoiceFromListBtn").disabled = count === 0;
  }
  if ($("paperSelectVisibleBtn")) {
    $("paperSelectVisibleBtn").disabled = state.items.length === 0;
  }
  if ($("paperPlayWeakWordsBtn")) {
    $("paperPlayWeakWordsBtn").disabled = state.items.filter((item) => isVocabularyItem(item) && isLikelyEnglish(item.title)).length === 0;
  }
  if ($("paperFilterStatus") && state.itemTotal > 0) {
    $("paperFilterStatus").textContent = `当前筛选共 ${state.itemTotal} 项，本页 ${state.items.length} 项，已选 ${count} 项`;
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
  const reviewDays = [...days].reverse().filter((day) => Number(day.review_count || 0) > 0);
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
    ${reviewDays.map((day) => `
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

async function loadDailyAnalysis() {
  const date = $("analysisDateInput")?.value || localDateKey(new Date());
  const childId = $("scheduleChildSelect")?.value || $("childSelect")?.value || "";
  const params = new URLSearchParams({ date });
  if (childId) params.set("childId", childId);
  state.dailyAnalysis = await api(`/api/reports/daily?${params}`);
  renderDailyAnalysis();
}

function renderDailyAnalysis() {
  const data = state.dailyAnalysis;
  if (!data) return;
  const review = data.reviewSummary || {};
  const schedule = data.scheduleSummary || {};
  $("analysisSummary").innerHTML = `
    <div><strong>${Number(review.item_count || 0)}</strong><span>当天背诵项目</span></div>
    <div><strong>${Number(review.review_count || 0)}</strong><span>当天背诵次数</span></div>
    <div><strong>${Number(review.mastered_count || 0)}</strong><span>当天掌握</span></div>
    <div><strong>${Number(schedule.done_count || 0)} / ${Number(schedule.planned_count || 0)}</strong><span>课程完成</span></div>
  `;
  $("analysisCategories").innerHTML = `
    <h3>类别分布</h3>
    ${(data.categorySummary || []).map((row, index) => `
      <article class="report-row">
        <div>
          <strong>${escapeHtml(row.subject_name)} / ${escapeHtml(row.category_name)}</strong>
          <span>背 ${row.item_count} 个 / 共 ${row.review_count} 次 / 掌握 ${row.mastered_count} 个</span>
        </div>
        <span class="category-pill color-${index % 6}">${row.item_count}</span>
      </article>
    `).join("") || `<div class="empty-note">这一天还没有背诵记录</div>`}
  `;
  $("analysisSchedule").innerHTML = `
    <h3>课程完成</h3>
    ${(data.scheduleItems || []).map(renderAnalysisScheduleItem).join("") || `<div class="empty-note">这一天还没有安排课程</div>`}
  `;
  $("analysisReviews").innerHTML = `
    <h3>背诵明细</h3>
    ${(data.reviews || []).map((row) => `
      <article class="report-row">
        <div>
          <strong>${escapeHtml(row.title)}</strong>
          <span>${escapeHtml(row.subject_name)} / ${escapeHtml(row.category_name)} / ${formatDate(row.reviewed_at)}</span>
        </div>
        <span class="badge">${ratingLabel(row.rating)} ${row.before_mastery_score} -> ${row.after_mastery_score}</span>
      </article>
    `).join("") || `<div class="empty-note">这一天还没有背诵明细</div>`}
  `;
}

function renderAnalysisScheduleItem(item) {
  const status = item.checkin_status === "DONE" ? "完成" : "待完成";
  return `
    <article class="report-row">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.child_name || "")} / ${escapeHtml(item.subject_name || "未分科")} / 计划 ${formatTime(item.planned_start_time)}-${formatTime(item.planned_end_time)}</span>
        <span>实际 ${formatDate(item.actual_start_at) || "未填"} - ${formatDate(item.actual_end_at) || "未填"}</span>
      </div>
      <span class="badge">${status}</span>
    </article>
  `;
}

async function loadWeekSchedule() {
  const weekStart = $("scheduleWeekStartInput")?.value || weekStartKey(new Date());
  const childId = $("scheduleChildSelect")?.value || "";
  const params = new URLSearchParams({ weekStart });
  if (childId) params.set("childId", childId);
  state.weeklySchedule = await api(`/api/schedule/week?${params}`);
  renderWeekSchedule();
}

function renderWeekSchedule() {
  const data = state.weeklySchedule || { items: [], summary: {} };
  const summary = data.summary || {};
  $("scheduleSummary").innerHTML = `
    <div><strong>${Number(summary.planned_count || 0)}</strong><span>本周计划</span></div>
    <div><strong>${Number(summary.done_count || 0)}</strong><span>已完成</span></div>
    <div><strong>${Number(summary.pending_count || 0)}</strong><span>未完成</span></div>
    <div><strong>${completionRate(summary)}%</strong><span>完成率</span></div>
  `;
  const itemsByWeekDay = new Map();
  (data.items || []).forEach((item) => {
    const key = String(item.week_day || 1);
    const rows = itemsByWeekDay.get(key) || [];
    rows.push(item);
    itemsByWeekDay.set(key, rows);
  });
  $("weeklySchedule").innerHTML = Array.from({ length: 7 }, (_, index) => {
    const weekDay = index + 1;
    const rows = (itemsByWeekDay.get(String(weekDay)) || [])
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    return `
      <section class="schedule-day" data-week-day="${weekDay}" ondragover="allowScheduleDrop(event)" ondrop="dropScheduleItem(event, ${weekDay})">
        <h3>${weekDayName(index)}</h3>
        ${rows.map(renderScheduleCell).join("") || `<div class="empty-note">未安排</div>`}
      </section>
    `;
  }).join("");
}

function renderScheduleCell(item) {
  const done = item.checkin_status === "DONE";
  return `
    <button type="button" class="schedule-cell ${done ? "done" : ""}" draggable="true" data-id="${item.id}" onclick="openScheduleModal(${item.id})" ondragstart="dragScheduleItem(event, ${item.id})">
      <strong>${escapeHtml(item.title)}</strong>
      <span class="${done ? "schedule-status-done" : "schedule-status-pending"}">${done ? "完成" : "待"}</span>
    </button>
  `;
}

function openScheduleModal(id) {
  const item = (state.weeklySchedule?.items || []).find((row) => Number(row.id) === Number(id));
  if (!item) return;
  state.activeScheduleId = Number(id);
  const done = item.checkin_status === "DONE";
  $("scheduleModalTitle").textContent = item.title || "课程";
  $("scheduleModalMeta").textContent = `${item.child_name || ""} / ${item.subject_name || "未分科"} / ${item.category_name || "未分类"} / ${weekDayName(Number(item.week_day || 1) - 1)} / 计划 ${formatTime(item.planned_start_time)} - ${formatTime(item.planned_end_time)}`;
  $("scheduleModalTitleInput").value = item.title || "";
  $("scheduleModalWeekDay").value = String(item.week_day || 1);
  $("scheduleModalSubject").value = item.subject_id ? String(item.subject_id) : "";
  renderScheduleModalCategorySelect();
  $("scheduleModalCategory").value = item.category_id ? String(item.category_id) : "";
  $("scheduleModalPlanStart").value = timeInputValue(item.planned_start_time);
  $("scheduleModalPlanEnd").value = timeInputValue(item.planned_end_time);
  $("scheduleModalStart").value = datetimeLocalValue(item.actual_start_at);
  $("scheduleModalEnd").value = datetimeLocalValue(item.actual_end_at);
  $("scheduleModalNote").value = item.checkin_note || "";
  $("scheduleModalCopy").innerHTML = renderWeekDayOptions(item.week_day);
  $("scheduleModalDoneBtn").textContent = done ? "取消" : "完成";
  $("scheduleModal").classList.remove("hidden");
}

function closeScheduleModal() {
  state.activeScheduleId = null;
  $("scheduleModal").classList.add("hidden");
}

function activeScheduleItem() {
  return (state.weeklySchedule?.items || []).find((row) => Number(row.id) === Number(state.activeScheduleId));
}

async function addScheduleItem() {
  const title = $("scheduleTitleInput").value.trim();
  if (!title) {
    alert("请填写课程内容");
    return;
  }
  await api("/api/schedule/items", {
    method: "POST",
    body: JSON.stringify({
      childId: Number($("scheduleChildSelect").value || $("childSelect").value),
      weekDay: Number($("scheduleWeekDaySelect").value),
      subjectId: $("scheduleSubjectSelect").value ? Number($("scheduleSubjectSelect").value) : null,
      categoryId: $("scheduleCategorySelect").value ? Number($("scheduleCategorySelect").value) : null,
      title,
      plannedStartTime: $("scheduleStartTimeInput").value || null,
      plannedEndTime: $("scheduleEndTimeInput").value || null
    })
  });
  $("scheduleTitleInput").value = "";
  await Promise.all([loadWeekSchedule(), loadDailyAnalysis()]);
}

async function copyScheduleItem(id) {
  if (!id) return;
  const targetWeekDay = Number($("scheduleModalCopy").value);
  await api(`/api/schedule/items/${id}/copy`, {
    method: "POST",
    body: JSON.stringify({ targetWeekDay })
  });
  await loadWeekSchedule();
  closeScheduleModal();
}

async function copyScheduleDay() {
  const sourceWeekDay = Number($("scheduleCopyDaySource").value);
  const targetWeekDay = Number($("scheduleCopyDayTarget").value);
  if (sourceWeekDay === targetWeekDay) {
    alert("请选择不同的周几");
    return;
  }
  await api("/api/schedule/days/copy", {
    method: "POST",
    body: JSON.stringify({
      childId: Number($("scheduleChildSelect").value || $("childSelect").value),
      sourceWeekDay,
      targetWeekDay
    })
  });
  await loadWeekSchedule();
}

async function saveScheduleTemplate(id) {
  if (!id) return;
  const title = $("scheduleModalTitleInput").value.trim();
  if (!title) {
    alert("请填写标题");
    return;
  }
  const item = activeScheduleItem();
  await api(`/api/schedule/items/${id}/template`, {
    method: "POST",
    body: JSON.stringify({
      weekDay: Number($("scheduleModalWeekDay").value),
      subjectId: $("scheduleModalSubject").value ? Number($("scheduleModalSubject").value) : null,
      categoryId: $("scheduleModalCategory").value ? Number($("scheduleModalCategory").value) : null,
      title,
      plannedStartTime: $("scheduleModalPlanStart").value || null,
      plannedEndTime: $("scheduleModalPlanEnd").value || null,
      sortOrder: Number(item?.sort_order || 0)
    })
  });
  await loadWeekSchedule();
  closeScheduleModal();
}

function dragScheduleItem(event, id) {
  event.dataTransfer.setData("text/plain", String(id));
  event.dataTransfer.effectAllowed = "move";
}

function allowScheduleDrop(event) {
  event.preventDefault();
}

function dropScheduleItem(event, weekDay) {
  event.preventDefault();
  const id = Number(event.dataTransfer.getData("text/plain"));
  const item = (state.weeklySchedule?.items || []).find((row) => Number(row.id) === id);
  if (!item) return;
  item.week_day = weekDay;
  const targetId = Number(event.target.closest(".schedule-cell")?.dataset.id || 0);
  const sameDay = (state.weeklySchedule.items || []).filter((row) => Number(row.week_day || 1) === weekDay && Number(row.id) !== id);
  const targetIndex = sameDay.findIndex((row) => Number(row.id) === targetId);
  if (targetIndex >= 0) {
    sameDay.splice(targetIndex, 0, item);
  } else {
    sameDay.push(item);
  }
  sameDay.forEach((row, index) => {
    row.sort_order = index;
  });
  normalizeScheduleOrders();
  renderWeekSchedule();
}

async function saveScheduleOrder() {
  normalizeScheduleOrders();
  const items = (state.weeklySchedule?.items || []).map((item) => ({
    id: Number(item.id),
    weekDay: Number(item.week_day || 1),
    sortOrder: Number(item.sort_order || 0)
  }));
  await api("/api/schedule/items/reorder", {
    method: "POST",
    body: JSON.stringify({ items })
  });
  await loadWeekSchedule();
}

function normalizeScheduleOrders() {
  weekDayLabels().forEach((_, index) => {
    const weekDay = index + 1;
    (state.weeklySchedule?.items || [])
      .filter((item) => Number(item.week_day || 1) === weekDay)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .forEach((item, order) => {
        item.sort_order = order;
      });
  });
}

async function checkScheduleItem(id, done) {
  if (!id) return;
  await api(`/api/schedule/items/${id}/check`, {
    method: "POST",
    body: JSON.stringify(schedulePayload(id, done))
  });
  await Promise.all([loadWeekSchedule(), loadDailyAnalysis()]);
  closeScheduleModal();
}

async function saveScheduleItem(id) {
  if (!id) return;
  await api(`/api/schedule/items/${id}/update`, {
    method: "POST",
    body: JSON.stringify(schedulePayload(id, null))
  });
  await Promise.all([loadWeekSchedule(), loadDailyAnalysis()]);
  closeScheduleModal();
}

async function deleteScheduleItem(id) {
  if (!id) return;
  if (!confirm("确认删除这节课程安排吗？")) return;
  await api(`/api/schedule/items/${id}`, { method: "DELETE" });
  await Promise.all([loadWeekSchedule(), loadDailyAnalysis()]);
  closeScheduleModal();
}

function schedulePayload(id, done) {
  const item = (state.weeklySchedule?.items || []).find((row) => Number(row.id) === Number(id));
  const payload = {
    checkDate: checkDateForWeekDay(Number(item?.week_day || 1)),
    actualStartAt: toIsoDateTime($("scheduleModalStart").value),
    actualEndAt: toIsoDateTime($("scheduleModalEnd").value),
    note: $("scheduleModalNote").value
  };
  if (done !== null) payload.done = done;
  return payload;
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
  updateRocketScore();
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
  updateRocketScore();
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
    velocity: 0,
    altitude: 0,
    maxAltitude: 0,
    fuel: 100,
    score: 0,
    animationId: null,
    lastFrameTime: null
  };
  updateRocketButtons();
  $("rocketStatus").textContent = "任务：发射、分离一级、回收一级，再分离二级并回收。推力大于重力时火箭上升。";
  drawRocketFrame();
}

function drawRocket() {
  if (state.rocket.animationId) cancelAnimationFrame(state.rocket.animationId);
  state.rocket.lastFrameTime = null;
  const step = (timestamp) => {
    if (state.rocket.lastFrameTime === null) state.rocket.lastFrameTime = timestamp;
    const dt = Math.min(0.05, Math.max(0.001, (timestamp - state.rocket.lastFrameTime) / 1000));
    state.rocket.lastFrameTime = timestamp;
    const thrust = Number($("thrustSlider").value);
    const gravity = Number($("gravitySlider").value);
    const massBonus = [1, 1.25, 1.52][Math.min(2, state.rocket.stage - 1)];
    if (state.rocket.running) {
      const powered = state.rocket.fuel > 0;
      const atmosphere = Math.exp(-state.rocket.altitude / 70000);
      const engineAcceleration = powered ? (thrust * massBonus - gravity) * 14 : -gravity * 10;
      const drag = state.rocket.velocity * 0.018 * atmosphere;
      if (powered) state.rocket.fuel = Math.max(0, state.rocket.fuel - thrust * 0.13 * dt);
      state.rocket.velocity += (engineAcceleration - drag) * dt;
      state.rocket.altitude = Math.max(0, state.rocket.altitude + state.rocket.velocity * dt);
      state.rocket.maxAltitude = Math.max(state.rocket.maxAltitude, state.rocket.altitude);
      updateRocketScore();
      if (state.rocket.altitude <= 0 && state.rocket.fuel <= 0 && state.rocket.velocity < 0) {
        state.rocket.running = false;
        state.rocket.velocity = 0;
        $("rocketStatus").textContent = rocketSummary("燃料耗尽，飞行结束");
      } else {
        $("rocketStatus").textContent = rocketSummary(`${flightZone()} · ${state.rocket.stage > 2 ? "载荷入轨段" : `${state.rocket.stage}级飞行`}`);
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
  return `${prefix} / 高度 ${formatAltitude(state.rocket.altitude)} / 最高 ${formatAltitude(state.rocket.maxAltitude)} / 速度 ${Math.round(state.rocket.velocity)} m/s / 燃料 ${Math.round(state.rocket.fuel)}% / 已回收 ${state.rocket.recoveredStages.length} 层 / 得分 ${state.rocket.score}`;
}

function updateRocketScore() {
  const separationBonus = state.rocket.separatedStages.reduce((sum, stage) => sum + (stage === 1 ? 80 : 120), 0);
  const recoveryBonus = state.rocket.recoveredStages.reduce((sum, stage) => sum + (stage === 1 ? 160 : 220), 0);
  state.rocket.score = Math.floor(state.rocket.maxAltitude / 100) + separationBonus + recoveryBonus;
}

function formatAltitude(meters) {
  return meters >= 10000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function flightZone() {
  const altitude = state.rocket.altitude;
  if (altitude >= 100000) return "越过卡门线，进入太空";
  if (altitude >= 50000) return "中间层";
  if (altitude >= 12000) return "平流层";
  return "对流层";
}

function drawRocketFrame() {
  const canvas = $("rocketCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  drawSpaceBackground(ctx, width, height);
  const x = width / 2;
  const y = Math.max(118, 330 - Math.min(212, state.rocket.altitude / 35));
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
  ctx.fillStyle = state.rocket.altitude > 30000 ? "#ffffff" : "#28493f";
  ctx.font = "12px sans-serif";
  ctx.fillText(`燃料 ${Math.round(state.rocket.fuel)}%`, 14, 22);
  ctx.fillText(`得分 ${state.rocket.score}`, width - 78, 22);
  ctx.fillText(formatAltitude(state.rocket.altitude), 14, 40);
}

function drawSpaceBackground(ctx, width, height) {
  const altitude = state.rocket.altitude;
  const space = Math.min(1, Math.max(0, (altitude - 10000) / 90000));
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, mixColor([65, 155, 215], [2, 6, 24], space));
  gradient.addColorStop(1, mixColor([210, 241, 255], [16, 32, 78], space));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (space > 0.04) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, space * 1.7);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 42; i += 1) {
      const x = (i * 73 + 19) % width;
      const y = (i * 47 + altitude / (700 + (i % 5) * 130)) % (height - 70);
      const radius = i % 8 === 0 ? 1.5 : 0.8;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const cloudAlpha = Math.max(0, 1 - altitude / 18000);
  if (cloudAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = cloudAlpha * 0.82;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 4; i += 1) {
      const x = (45 + i * 96 - altitude / (120 + i * 18)) % (width + 90) - 45;
      const y = 105 + i * 68;
      ctx.beginPath();
      ctx.ellipse(x, y, 38, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const earthHeight = Math.max(48, 115 - altitude / 1700);
  ctx.fillStyle = altitude > 22000 ? "#2377bd" : "#65a96f";
  ctx.beginPath();
  ctx.ellipse(width / 2, height + earthHeight * 0.55, width * 0.78, earthHeight, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(118, 211, 255, ${0.35 + space * 0.55})`;
  ctx.lineWidth = 5;
  ctx.stroke();

  if (altitude > 45000) {
    ctx.fillStyle = "rgba(244, 241, 215, 0.9)";
    ctx.beginPath();
    ctx.arc(width - 48, 72, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = space > 0.45 ? "rgba(255,255,255,0.78)" : "rgba(40,73,63,0.62)";
  ctx.font = "11px sans-serif";
  ctx.fillText(flightZone(), 14, height - 16);
}

function mixColor(from, to, progress) {
  const values = from.map((value, index) => Math.round(value + (to[index] - value) * progress));
  return `rgb(${values[0]}, ${values[1]}, ${values[2]})`;
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
  resetItemPageAndLoad();
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
  groups.forEach((group) => group.days.reverse());
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

function parseLocalDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function weekStartKey(date) {
  const value = new Date(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return localDateKey(value);
}

function weekDayName(index) {
  return weekDayLabels()[index] || "";
}

function weekDayLabels() {
  return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
}

function checkDateForWeekDay(weekDay) {
  const start = parseLocalDate($("scheduleWeekStartInput").value || weekStartKey(new Date()));
  start.setDate(start.getDate() + Number(weekDay || 1) - 1);
  return localDateKey(start);
}

function completionRate(summary) {
  const total = Number(summary.planned_count || 0);
  if (!total) return 0;
  return Math.round((Number(summary.done_count || 0) / total) * 100);
}

function ratingLabel(rating) {
  return ["不会", "模糊", "基本会", "熟练"][Number(rating)] || "未知";
}

function formatDate(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function formatTime(value) {
  if (!value) return "未填";
  return String(value).slice(0, 5);
}

function timeInputValue(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function datetimeLocalValue(value) {
  if (!value) return "";
  return String(value).replace(" ", "T").slice(0, 16);
}

function toIsoDateTime(value) {
  return value ? `${value}:00` : null;
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
