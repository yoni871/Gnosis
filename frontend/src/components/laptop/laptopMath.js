export const OPEN_ANGLE = 110 * Math.PI / 180;
export const SOURCE_WIDTH = 1672;
export const SOURCE_HEIGHT = 941;

export function scrollProgress(scrollY, top, heroHeight) {
    return Math.min(1, Math.max(0, (scrollY - top) / Math.max(1, heroHeight * .55)));
}
export function openingAngle(progress) {
    return OPEN_ANGLE * (1 - Math.min(1, Math.max(0, progress)));
}

// Projective mapping from a rectangular UV space into the original screen's
// four photographed corners. No invented UI, crossfade, or photo-lid rotation.
export function screenHomography() {
    const source = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const corners = [[1167, 532], [1536, 548], [1580, 330], [1207, 327]];
    const rows = [];
    source.forEach(([u, v], i) => {
        const x = corners[i][0] / SOURCE_WIDTH, y = 1 - corners[i][1] / SOURCE_HEIGHT;
        rows.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
        rows.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
    });
    for (let col = 0; col < 8; col += 1) {
        let pivot = col;
        for (let r = col + 1; r < 8; r += 1) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
        [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
        const divisor = rows[col][col];
        for (let c = col; c < 9; c += 1) rows[col][c] /= divisor;
        for (let r = 0; r < 8; r += 1) {
            if (r === col) continue;
            const factor = rows[r][col];
            for (let c = col; c < 9; c += 1) rows[r][c] -= factor * rows[col][c];
        }
    }
    return [...rows.map(row => row[8]), 1];
}
