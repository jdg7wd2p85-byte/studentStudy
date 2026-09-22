const examState = { papers: [], paperId: null, questions: [], editingPaperId: null, editingQuestionId: null, attemptQuestionId: null, request: 0 };
const examEl = (id) => document.getElementById(id);
const examEscape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const examLabels = { UNKNOWN: "待标注", LEARNED: "已学", LEARNING: "正在学", UNLEARNED: "未学", CORRECT: "独立做对", HINTED: "提示后会", WRONG: "不会", CARELESS: "粗心" };

async function examApi(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await response.json();
  if (!body.success) throw new Error(body.message || "请求失败");
  return body.data;
}

function examChildId() { return examEl("examChild").value; }
function examParams(extra = {}) { return new URLSearchParams({ childId: examChildId(), ...extra }); }
function examNotify(error) { alert(error.message || String(error)); }

window.initExamCatalog = function () {
  const children = state.catalog.children || [];
  const subjects = state.catalog.subjects || [];
  examEl("examChild").innerHTML = children.map((row) => `<option value="${row.id}">${examEscape(row.name)}</option>`).join("");
  examEl("examSubject").innerHTML = `<option value="">全部科目</option>` + subjects.map((row) => `<option value="${examEscape(row.name)}">${examEscape(row.name)}</option>`).join("");
  examEl("examPaperSubject").innerHTML = subjects.map((row) => `<option value="${examEscape(row.name)}">${examEscape(row.name)}</option>`).join("");
};

window.addExamRouteParams = function (params) {
  const map = { examChild: "child", examYear: "year", examSubject: "examSubject", examGrade: "grade", examStage: "stage", examResult: "result", examKeyword: "knowledge" };
  for (const [id, key] of Object.entries(map)) {
    const value = examEl(id).value;
    if (value && !(id === "examChild" && value === String(state.catalog?.children?.[0]?.id))) params.set(key, value);
  }
  if (examState.paperId) params.set("paper", String(examState.paperId));
};

window.restoreExamRoute = function (params) {
  const map = { examChild: "child", examYear: "year", examSubject: "examSubject", examGrade: "grade", examStage: "stage", examResult: "result", examKeyword: "knowledge" };
  for (const [id, key] of Object.entries(map)) {
    if (id === "examYear" && params.has(key) && /^\d{4}$/.test(params.get(key))) {
      examEl(id).insertAdjacentHTML("beforeend", `<option value="${params.get(key)}">${params.get(key)}</option>`);
    }
    if (params.has(key)) examEl(id).value = params.get(key);
  }
  examState.paperId = params.has("paper") ? Number(params.get("paper")) : null;
};

window.loadExamPage = async function () {
  if (!state.catalog || !examChildId()) return;
  const request = ++examState.request;
  try {
    const papers = await examApi(`/api/exams/papers?${examParams()}`);
    if (request !== examState.request) return;
    examState.papers = papers;
    const yearValue = examEl("examYear").value;
    const years = [...new Set(papers.map((row) => String(row.exam_year)))];
    examEl("examYear").innerHTML = `<option value="">全部年份</option>` + years.map((year) => `<option value="${year}">${year}</option>`).join("");
    examEl("examYear").value = yearValue;
    const visible = papers.filter((row) => (!examEl("examYear").value || String(row.exam_year) === examEl("examYear").value)
      && (!examEl("examSubject").value || row.subject === examEl("examSubject").value));
    if (examState.paperId && !visible.some((row) => Number(row.id) === examState.paperId)) examState.paperId = null;
    examEl("examPapers").innerHTML = `<button type="button" class="exam-paper ${!examState.paperId ? "active" : ""}" data-paper="all"><strong>全部年份</strong><span>跨卷查看</span><small>${visible.length} 张原卷</small></button>` + visible.map((row) => `
      <button type="button" class="exam-paper ${Number(row.id) === examState.paperId ? "active" : ""}" data-paper="${row.id}">
        <strong>${examEscape(row.exam_year)} ${examEscape(row.subject)}</strong>
        <span>${examEscape(row.title)}</span><small>${row.question_count} 题</small>
      </button>`).join("");
    examEl("examNewQuestionBtn").disabled = !examState.paperId;
    await loadExamQuestions(request);
  } catch (error) { examNotify(error); }
};

async function loadExamQuestions(request = examState.request) {
  const paper = examState.papers.find((row) => Number(row.id) === examState.paperId);
  if (examState.paperId && !paper) return;
  const query = examParams({
    ...(paper ? {} : { year: examEl("examYear").value, subject: examEl("examSubject").value }),
    grade: examEl("examGrade").value,
    stage: examEl("examStage").value,
    result: examEl("examResult").value,
    keyword: examEl("examKeyword").value.trim()
  });
  try {
    const rows = await examApi(`${paper ? `/api/exams/papers/${paper.id}/questions` : "/api/exams/questions"}?${query}`);
    if (request !== examState.request) return;
    examState.questions = rows;
    const learned = rows.filter((row) => row.learning_stage === "LEARNED");
    const correct = learned.filter((row) => row.latest_result === "CORRECT").length;
    const weak = learned.filter((row) => ["WRONG", "HINTED", "CARELESS"].includes(row.latest_result)).length;
    examEl("examSummary").innerHTML = `<strong>${paper ? `${examEscape(paper.exam_year)} ${examEscape(paper.subject)}` : "跨卷总览"}</strong> · 筛出 ${rows.length} 题 · 已学 ${learned.length} 题 · 独立做对 ${correct} 题 · 待巩固 ${weak} 题`;
    const safeLink = (url, label) => url ? `<a href="${examEscape(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : "";
    examEl("examQuestions").innerHTML = `
      ${paper ? `<div class="exam-paper-detail"><strong>${examEscape(paper.title)}</strong>
        <div>${safeLink(paper.paper_url, "打开原卷")} ${safeLink(paper.answer_url, "打开答案")}
          <button type="button" data-edit-paper="${paper.id}">编辑原卷</button></div>
        ${paper.note ? `<p>${examEscape(paper.note)}</p>` : ""}
      </div>` : ""}
      ${rows.length ? rows.map((row) => `<article class="exam-question">
        <div class="exam-question-head"><strong>${paper ? "" : `${examEscape(row.exam_year)} ${examEscape(row.subject)} · `}第 ${examEscape(row.question_no)} 题</strong>
          <span>${examEscape(row.grade_level || "年级待标注")} · ${examEscape(examLabels[row.learning_stage])} · ${examEscape(examLabels[row.latest_result] || "未做过")}</span></div>
        <p>${examEscape(row.knowledge_points || "知识点待标注")}</p>
        ${row.question_text ? `<div class="exam-question-text">${examEscape(row.question_text)}</div>` : ""}
        ${row.question_url ? safeLink(row.question_url, "打开原题") : ""}
        <small>作答 ${row.attempt_count} 次${row.latest_attempted_at ? ` · 最近 ${examEscape(String(row.latest_attempted_at).replace("T", " ").slice(0, 16))}` : ""}</small>
        <div class="exam-actions"><button type="button" data-attempt="${row.id}">记录作答 / 历史</button><button type="button" data-edit-question="${row.id}">编辑标注</button></div>
      </article>`).join("") : `<p class="empty-note">当前筛选没有题目</p>`}`;
  } catch (error) { examNotify(error); }
}

function examOpenModal(id) { examEl(id).classList.remove("hidden"); }
function examCloseModal(id) { examEl(id).classList.add("hidden"); }
function examPaperForm(row = null) {
  examState.editingPaperId = row?.id || null;
  examEl("examPaperModalTitle").textContent = row ? "编辑原卷" : "添加原卷";
  examEl("examPaperYear").value = row?.exam_year || new Date().getFullYear();
  examEl("examPaperSubject").value = row?.subject || "数学";
  examEl("examPaperTitle").value = row?.title || "";
  examEl("examPaperUrl").value = row?.paper_url || "";
  examEl("examAnswerUrl").value = row?.answer_url || "";
  examEl("examPaperNote").value = row?.note || "";
  examEl("examPaperDeleteBtn").hidden = !row;
  examOpenModal("examPaperModal");
}

function examQuestionForm(row = null) {
  if (!examState.paperId) return;
  examState.editingQuestionId = row?.id || null;
  examEl("examQuestionModalTitle").textContent = row ? `编辑第 ${row.question_no} 题` : "添加题目";
  const fields = { examQuestionNumber: "question_no", examQuestionType: "question_type", examQuestionText: "question_text", examQuestionUrl: "question_url", examQuestionKnowledge: "knowledge_points", examQuestionGrade: "grade_level", examQuestionSemester: "semester", examQuestionStage: "learning_stage", examQuestionDifficulty: "difficulty", examQuestionNote: "note" };
  for (const [id, key] of Object.entries(fields)) examEl(id).value = row?.[key] || (id === "examQuestionStage" ? "UNKNOWN" : "");
  examEl("examQuestionDeleteBtn").hidden = !row;
  examOpenModal("examQuestionModal");
}

async function examAttemptForm(row) {
  examState.attemptQuestionId = row.id;
  examEl("examAttemptModalTitle").textContent = `第 ${row.question_no} 题作答记录`;
  examEl("examAttemptResult").value = "CORRECT";
  examEl("examAttemptReason").value = "";
  examEl("examAttemptNote").value = "";
  examOpenModal("examAttemptModal");
  await loadExamAttempts();
}

async function loadExamAttempts() {
  try {
    const rows = await examApi(`/api/exams/questions/${examState.attemptQuestionId}/attempts?${examParams()}`);
    examEl("examAttemptHistory").innerHTML = rows.length ? rows.map((row) => `
      <div><strong>${examEscape(examLabels[row.result])}</strong> · ${examEscape(String(row.attempted_at).replace("T", " ").slice(0, 16))}
      ${row.error_reason ? `<span> · ${examEscape(row.error_reason)}</span>` : ""}
      ${row.note ? `<p>${examEscape(row.note)}</p>` : ""}</div>`).join("") : `<p class="empty-note">还没有作答记录</p>`;
  } catch (error) { examNotify(error); }
}

for (const id of ["examChild", "examYear", "examSubject", "examGrade", "examStage", "examResult"]) {
  examEl(id).addEventListener("change", () => {
    if (id === "examChild" || id === "examYear" || id === "examSubject") examState.paperId = null;
    updateUrlFromState(); window.loadExamPage();
  });
}
examEl("examKeyword").addEventListener("input", () => {
  clearTimeout(examState.searchTimer);
  examState.searchTimer = setTimeout(() => { updateUrlFromState(); window.loadExamPage(); }, 250);
});
examEl("examPapers").addEventListener("click", (event) => {
  const button = event.target.closest("[data-paper]");
  if (!button) return;
  examState.paperId = button.dataset.paper === "all" ? null : Number(button.dataset.paper);
  updateUrlFromState(); window.loadExamPage();
});
examEl("examQuestions").addEventListener("click", (event) => {
  const paperButton = event.target.closest("[data-edit-paper]");
  if (paperButton) return examPaperForm(examState.papers.find((row) => Number(row.id) === Number(paperButton.dataset.editPaper)));
  const editButton = event.target.closest("[data-edit-question]");
  if (editButton) {
    const row = examState.questions.find((item) => Number(item.id) === Number(editButton.dataset.editQuestion));
    examState.paperId = Number(row.paper_id);
    updateUrlFromState();
    return examQuestionForm(row);
  }
  const attemptButton = event.target.closest("[data-attempt]");
  if (attemptButton) examAttemptForm(examState.questions.find((row) => Number(row.id) === Number(attemptButton.dataset.attempt)));
});
examEl("examNewPaperBtn").onclick = () => examPaperForm();
examEl("examNewQuestionBtn").onclick = () => examQuestionForm();
examEl("examCopyLinkBtn").onclick = async () => {
  updateUrlFromState();
  await navigator.clipboard.writeText(location.href);
  examEl("examCopyLinkBtn").textContent = "已复制";
  setTimeout(() => examEl("examCopyLinkBtn").textContent = "复制当前链接", 1600);
};
for (const [button, modal] of [["examPaperCloseBtn", "examPaperModal"], ["examQuestionCloseBtn", "examQuestionModal"], ["examAttemptCloseBtn", "examAttemptModal"]]) {
  examEl(button).onclick = () => examCloseModal(modal);
  examEl(modal).onclick = (event) => { if (event.target === examEl(modal)) examCloseModal(modal); };
}

examEl("examPaperSaveBtn").onclick = async () => {
  const payload = { childId: Number(examChildId()), year: Number(examEl("examPaperYear").value), subject: examEl("examPaperSubject").value,
    title: examEl("examPaperTitle").value, paperUrl: examEl("examPaperUrl").value, answerUrl: examEl("examAnswerUrl").value, note: examEl("examPaperNote").value };
  try {
    const result = await examApi(examState.editingPaperId ? `/api/exams/papers/${examState.editingPaperId}` : "/api/exams/papers",
      { method: examState.editingPaperId ? "PUT" : "POST", body: JSON.stringify(payload) });
    examState.paperId = Number(result.id);
    examEl("examYear").value = ""; examEl("examSubject").value = "";
    examCloseModal("examPaperModal"); updateUrlFromState(); await window.loadExamPage();
  } catch (error) { examNotify(error); }
};

examEl("examPaperDeleteBtn").onclick = async () => {
  if (!confirm("删除这张原卷、所有题目及全部作答记录？")) return;
  try {
    await examApi(`/api/exams/papers/${examState.editingPaperId}?${examParams()}`, { method: "DELETE" });
    examState.paperId = null;
    examCloseModal("examPaperModal");
    updateUrlFromState();
    await window.loadExamPage();
  } catch (error) { examNotify(error); }
};

examEl("examQuestionSaveBtn").onclick = async () => {
  const payload = { number: examEl("examQuestionNumber").value, type: examEl("examQuestionType").value,
    text: examEl("examQuestionText").value, questionUrl: examEl("examQuestionUrl").value,
    knowledgePoints: examEl("examQuestionKnowledge").value, gradeLevel: examEl("examQuestionGrade").value,
    semester: examEl("examQuestionSemester").value, learningStage: examEl("examQuestionStage").value,
    difficulty: examEl("examQuestionDifficulty").value, note: examEl("examQuestionNote").value };
  try {
    await examApi(examState.editingQuestionId ? `/api/exams/questions/${examState.editingQuestionId}?${examParams()}` : `/api/exams/papers/${examState.paperId}/questions?${examParams()}`,
      { method: examState.editingQuestionId ? "PUT" : "POST", body: JSON.stringify(payload) });
    examCloseModal("examQuestionModal"); await window.loadExamPage();
  } catch (error) { examNotify(error); }
};

examEl("examQuestionDeleteBtn").onclick = async () => {
  if (!confirm("删除这道题及全部作答记录？")) return;
  try {
    await examApi(`/api/exams/questions/${examState.editingQuestionId}?${examParams()}`, { method: "DELETE" });
    examCloseModal("examQuestionModal"); await window.loadExamPage();
  } catch (error) { examNotify(error); }
};

examEl("examAttemptSaveBtn").onclick = async () => {
  try {
    await examApi(`/api/exams/questions/${examState.attemptQuestionId}/attempts`, { method: "POST", body: JSON.stringify({
      childId: Number(examChildId()), result: examEl("examAttemptResult").value,
      errorReason: examEl("examAttemptReason").value, note: examEl("examAttemptNote").value
    }) });
    examEl("examAttemptNote").value = "";
    await loadExamAttempts(); await window.loadExamPage();
  } catch (error) { examNotify(error); }
};
