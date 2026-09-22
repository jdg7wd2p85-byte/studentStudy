// Run with: node scripts/import-shanghai-math-papers.mjs http://47.116.213.24 1
const base = process.argv[2];
const childId = Number(process.argv[3]);
if (!base || !Number.isInteger(childId) || childId < 1) {
  throw new Error("Usage: node scripts/import-shanghai-math-papers.mjs BASE_URL CHILD_ID");
}

const papers = [
  {
    year: 2024,
    paperUrl: "https://github.com/Code1ce/2024-shzk-Math/blob/main/paper0.pdf",
    note: "第三方重排版 PDF（GitHub 在线预览），非官方扫描件；逐题考点和建议年级待核对。",
  },
  {
    year: 2023,
    paperUrl: "https://www.tthaoke.com/shijuan_32544.html",
    note: "第三方原卷 PDF 资源页，下载可能需要登录；逐题考点和建议年级待核对。",
  },
  {
    year: 2022,
    paperUrl: "https://zy.21cnjy.com/12731403",
    note: "第三方真题与答案页面，可阅读题目文字；公式和图形以原卷为准，下载可能需要登录；逐题考点待核对。",
  },
  {
    year: 2021,
    paperUrl: "https://cdn.att.tthaoke.com/testpaper/release/f/f896f3c1a3d8bea0217f593611bb6690/%E4%B8%8A%E6%B5%B7%E5%B8%822021%E5%B9%B4%E4%B8%AD%E8%80%83%E6%95%B0%E5%AD%A6%E7%9C%9F%E9%A2%98%EF%BC%88%E5%8E%9F%E5%8D%B7%E7%89%88%EF%BC%89.pdf",
    note: "第三方原卷版 PDF，可直接预览；逐题考点和建议年级待核对。",
  },
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

const existing = await api(`/api/exams/papers?childId=${childId}`);
let added = 0;
for (const source of papers) {
  if (existing.some((paper) => Number(paper.exam_year) === source.year && paper.subject === "数学")) continue;
  await api("/api/exams/papers", {
    method: "POST",
    body: JSON.stringify({ childId, year: source.year, subject: "数学",
      title: `${source.year}年上海市中考数学真题`, paperUrl: source.paperUrl, note: source.note }),
  });
  added++;
}
console.log(`added=${added} total=${(await api(`/api/exams/papers?childId=${childId}`)).length}`);
