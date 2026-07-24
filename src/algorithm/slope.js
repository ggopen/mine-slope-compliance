/**
 * 坡度计算 —— Horn's 有限差分法
 * 输入：高程网格 heights (Float32Array, 长度 cols*rows)，行优先
 * 输出：坡度角数组 slope (Float32Array, 度)
 */

/**
 * 计算每个网格点的局部坡度角（度）
 * @param {Float32Array} heights 高程网格（米），行优先 index = row*cols + col
 * @param {number} cols 列数
 * @param {number} rows 行数
 * @param {number} cellSize 网格间距（米）
 * @returns {Float32Array} 坡度角（度）
 */
export function computeSlope(heights, cols, rows, cellSize) {
  const slope = new Float32Array(cols * rows);

  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      const a = heights[(row - 1) * cols + (col - 1)];
      const b = heights[(row - 1) * cols + col];
      const c = heights[(row - 1) * cols + (col + 1)];
      const d = heights[row * cols + (col - 1)];
      const f = heights[row * cols + (col + 1)];
      const g = heights[(row + 1) * cols + (col - 1)];
      const h = heights[(row + 1) * cols + col];
      const i = heights[(row + 1) * cols + (col + 1)];

      if (anyNaN([a, b, c, d, f, g, h, i])) {
        slope[row * cols + col] = 0;
        continue;
      }

      const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cellSize);
      const dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cellSize);

      const gradient = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
      slope[row * cols + col] = Math.atan(gradient) * (180 / Math.PI);
    }
  }

  // 边界点：复制相邻内部点坡度，避免 0 值空洞
  for (let col = 0; col < cols; col++) {
    slope[col] = slope[cols + col] || 0;
    slope[(rows - 1) * cols + col] = slope[(rows - 2) * cols + col] || 0;
  }
  for (let row = 0; row < rows; row++) {
    slope[row * cols] = slope[row * cols + 1] || 0;
    slope[row * cols + (cols - 1)] = slope[row * cols + (cols - 2)] || 0;
  }

  return slope;
}

function anyNaN(arr) {
  for (let i = 0; i < arr.length; i++) if (Number.isNaN(arr[i])) return true;
  return false;
}
