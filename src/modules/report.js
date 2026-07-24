/**
 * 合规检查报告导出
 * - Excel：使用 SheetJS（xlsx），列表 + 汇总两张表
 * - PDF：使用 html2canvas 光栅化（保证中文不乱码）+ jsPDF 排版
 */
import * as XLSX from 'xlsx';

function typeLabel(t) {
  return { safety: '安全平台', cleaning: '清扫平台', transport: '运输平台', unknown: '工作台面' }[t] || '工作台面';
}
function riskLabel(r) {
  return { high: '高风险', medium: '中风险', low: '低风险', none: '合规' }[r] || r;
}

function toRows(platforms) {
  return platforms.map((p) => ({
    台面编号: p.id,
    类型: typeLabel(p.type),
    高程_m: Number(p.elevation.toFixed(2)),
    面积_m2: Number(p.area.toFixed(1)),
    平均宽度_m: Number(p.averageWidth.toFixed(2)),
    最小宽度_m: Number(p.minWidth.toFixed(2)),
    最大宽度_m: Number(p.maxWidth.toFixed(2)),
    阈值_m: Number((p.threshold || 0).toFixed(2)),
    是否合规: p.isCompliant ? '合规' : '不合规',
    风险等级: riskLabel(worstRisk(p)),
    问题描述: (p.complianceIssues || []).join('；')
  }));
}

function worstRisk(p) {
  const order = { high: 3, medium: 2, low: 1, none: 0 };
  let w = 'none';
  let s = -1;
  for (const m of p.widthMeasurements || []) {
    const v = order[m.riskLevel] ?? 0;
    if (v > s) { s = v; w = m.riskLevel; }
  }
  return w;
}

export function exportExcel(platforms, summary, config, mineName = '矿山') {
  const rows = toRows(platforms);
  const ws1 = XLSX.utils.json_to_sheet(rows);
  const summaryRows = [
    { 指标: '矿山名称', 数值: mineName },
    { 指标: '台面总数', 数值: summary?.totalPlatforms ?? 0 },
    { 指标: '合规数', 数值: summary?.compliantCount ?? 0 },
    { 指标: '不合规数', 数值: summary?.nonCompliantCount ?? 0 },
    { 指标: '合规率', 数值: `${((summary?.complianceRate ?? 0) * 100).toFixed(1)}%` },
    { 指标: '高风险', 数值: summary?.riskDistribution?.high ?? 0 },
    { 指标: '中风险', 数值: summary?.riskDistribution?.medium ?? 0 },
    { 指标: '低风险', 数值: summary?.riskDistribution?.low ?? 0 }
  ];
  const ws2 = XLSX.utils.json_to_sheet(summaryRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws2, '统计汇总');
  XLSX.utils.book_append_sheet(wb, ws1, '台面清单');
  XLSX.writeFile(wb, `${mineName}-边坡合规性检查-${nowStr()}.xlsx`);
}

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function exportPDF(platforms, summary, config, screenshotDataUrl, mineName = '矿山') {
  const html = buildReportHTML(platforms, summary, config, screenshotDataUrl, mineName);

  // 构造临时节点
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;background:#fff;color:#222;font-family:"Microsoft YaHei",sans-serif;padding:32px;box-sizing:border-box;';
  container.innerHTML = html;
  document.body.appendChild(container);

  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  document.body.removeChild(container);

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let remaining = imgH;
  let position = 0;
  const imgData = canvas.toDataURL('image/png');
  pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
  remaining -= pageH;
  while (remaining > 0) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
    remaining -= pageH;
  }
  pdf.save(`${mineName}-边坡合规性检查-${nowStr()}.pdf`);
}

function buildReportHTML(platforms, summary, config, screenshotDataUrl, mineName) {
  const rate = ((summary?.complianceRate ?? 0) * 100).toFixed(1);
  const img = screenshotDataUrl
    ? `<img src="${screenshotDataUrl}" style="width:100%;border:1px solid #ddd;margin:12px 0;" />`
    : '';
  const rows = platforms
    .map((p) => {
      const color = p.isCompliant ? '#52c41a' : '#f5222d';
      return `<tr style="color:${color}">
        <td>${p.id}</td><td>${typeLabel(p.type)}</td>
        <td>${p.elevation.toFixed(1)}</td><td>${p.averageWidth.toFixed(2)}</td>
        <td>${p.minWidth.toFixed(2)}</td><td>${p.isCompliant ? '合规' : '不合规'}</td>
        <td>${riskLabel(worstRisk(p))}</td></tr>`;
    })
    .join('');
  return `
    <h2 style="margin:0 0 4px;">${mineName} · 边坡工作台面合规性检查报告</h2>
    <div style="color:#888;font-size:12px;">生成时间：${new Date().toLocaleString('zh-CN')}</div>
    <h3 style="margin:18px 0 6px;">一、检查结论</h3>
    <p style="font-size:14px;">台面总数 <b>${summary?.totalPlatforms ?? 0}</b>，合规 <b style="color:#52c41a">${summary?.compliantCount ?? 0}</b>，
    不合规 <b style="color:#f5222d">${summary?.nonCompliantCount ?? 0}</b>，合规率 <b>${rate}%</b>。</p>
    ${img}
    <h3 style="margin:18px 0 6px;">二、台面清单</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#f0f0f0;">
        <th style="border:1px solid #ccc;padding:4px;">编号</th><th style="border:1px solid #ccc;padding:4px;">类型</th>
        <th style="border:1px solid #ccc;padding:4px;">高程(m)</th><th style="border:1px solid #ccc;padding:4px;">平均宽(m)</th>
        <th style="border:1px solid #ccc;padding:4px;">最小宽(m)</th><th style="border:1px solid #ccc;padding:4px;">判定</th>
        <th style="border:1px solid #ccc;padding:4px;">风险</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <h3 style="margin:18px 0 6px;">三、依据</h3>
    <p style="font-size:12px;color:#666;">GB 16423-2020《金属非金属矿山安全规程》；安全平台≥${config.compliance.safetyPlatformMinWidth}m，清扫平台≥${config.compliance.cleaningPlatformMinWidth}m，运输平台≥${config.compliance.transportPlatformMinWidth}m。</p>
  `;
}
