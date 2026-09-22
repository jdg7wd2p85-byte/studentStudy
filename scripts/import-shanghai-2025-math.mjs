// Run with: node scripts/import-shanghai-2025-math.mjs http://47.116.213.24 1
const base = process.argv[2];
const childId = Number(process.argv[3]);
if (!base || !Number.isInteger(childId) || childId < 1) {
  throw new Error("Usage: node scripts/import-shanghai-2025-math.mjs BASE_URL CHILD_ID");
}

const rows = [
  [1, "合并同类项、幂的运算", "七年级"],
  [2, "列代数式：差的平方", "七年级"],
  [3, "正比例函数的定义", "八年级"],
  [4, "众数与中位数", "九年级"],
  [5, "平面向量的模、勾股定理", "九年级"],
  [6, "等腰三角形性质、两圆位置关系", "九年级"],
  [7, "因式分解：提公因式", "七年级"],
  [8, "一元一次不等式组", "七年级"],
  [9, "一元二次方程根的判别式", "八年级"],
  [10, "反比例函数的增减性", "八年级"],
  [11, "无理方程求解", "八年级"],
  [12, "二次函数图像平移", "九年级"],
  [13, "简单概率：抽牌问题", "九年级"],
  [14, "解直角三角形的应用：测量距离", "九年级"],
  [15, "样本估计总体、扇形统计图", "九年级"],
  [16, "科学记数法、皮秒与秒的单位换算", "八年级"],
  [17, "矩形与菱形、翻折与轴对称", "八年级"],
  [18, "圆与正五边形、弦与圆心角", "九年级"],
  [19, "实数混合运算、分数指数幂、二次根式", "八年级"],
  [20, "分式方程及增根检验", "七年级"],
  [21, "一次函数应用：储水量与温度", "八年级"],
  [22, "梯形旋转拼图、等腰三角形", "八年级"],
  [23, "圆的性质、弦与相似三角形", "九年级"],
  [24, "二次函数与几何综合", "九年级"],
  [25, "平行四边形、全等与相似三角形综合", "跨年级"],
];

async function api(path, options) {
  const response = await fetch(new URL(path, base), {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(`${path}: ${body.message || response.status}`);
  return body.data;
}

const papers = await api(`/api/exams/papers?childId=${childId}`);
let paper = papers.find((item) => Number(item.exam_year) === 2025 && item.subject === "数学");
const paperUrl = "https://sjds.net/603939.html";
const paperNote = "第三方原卷图片预览页；电子版领取需关注公众号。考点参考公开逐题分析；年级按沪教版目录推定，仅供规划，实际教学进度请手动调整。";
if (!paper) {
  const created = await api("/api/exams/papers", {
    method: "POST",
    body: JSON.stringify({
      childId,
      year: 2025,
      subject: "数学",
      title: "2025年上海市中考数学真题",
      paperUrl,
      note: paperNote,
    }),
  });
  paper = { id: created.id };
} else if (paper.paper_url === "https://www.czsx.com.cn/download.asp?id=254080") {
  await api(`/api/exams/papers/${paper.id}`, {
    method: "PUT",
    body: JSON.stringify({ childId, year: 2025, subject: "数学", title: paper.title,
      paperUrl, answerUrl: paper.answer_url, note: paperNote }),
  });
}

const existing = await api(`/api/exams/papers/${paper.id}/questions?childId=${childId}`);
const numbers = new Set(existing.map((item) => String(item.question_no)));
let added = 0;
for (const [number, knowledgePoints, gradeLevel] of rows) {
  if (numbers.has(String(number))) continue;
  await api(`/api/exams/papers/${paper.id}/questions?childId=${childId}`, {
    method: "POST",
    body: JSON.stringify({
      number: String(number),
      type: number <= 6 ? "选择题" : number <= 18 ? "填空题" : "解答题",
      knowledgePoints,
      gradeLevel,
      learningStage: "UNKNOWN",
    }),
  });
  added++;
}
const verified = await api(`/api/exams/papers/${paper.id}/questions?childId=${childId}`);
console.log(`paper=${paper.id} added=${added} total=${verified.length}`);
