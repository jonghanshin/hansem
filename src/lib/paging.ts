/** 표시할 페이지 번호: 처음/끝과 현재 주변만, 나머지는 … */
export function pageNumbers(page: number, totalPages: number): (number | "…")[] {
  const set = new Set([1, totalPages, page - 2, page - 1, page, page + 1, page + 2]);
  const nums = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}
