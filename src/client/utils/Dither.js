///stolen from gimp hahaha
const toLinear = value => {
    value /= 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
};
function makePalette(colors, limit) {
    let boxes = [colors];
    while (boxes.length < limit) {
        let choice = -1;
        let bestScore = 0;
        let splitChannel = 0;
        for (let b = 0; b < boxes.length; b++) {
            const box = boxes[b];
            if (box.length < 2) continue;
            const mins = [255, 255, 255], maxs = [0, 0, 0];
            for (const color of box) for (let c = 0; c < 3; c++) {
                if (color[c] < mins[c]) mins[c] = color[c];
                if (color[c] > maxs[c]) maxs[c] = color[c];
            }
            const ranges = maxs.map((value, c) => value - mins[c]);
            const channel = ranges.indexOf(Math.max(...ranges));
            const score = ranges[channel] * box.reduce((sum, color) => sum + color[3], 0);
            if (score > bestScore) { bestScore = score; choice = b; splitChannel = channel; }
        }
        if (choice < 0) break;
        const box = boxes.splice(choice, 1)[0].slice().sort((a, b) => a[splitChannel] - b[splitChannel]);
        const total = box.reduce((sum, color) => sum + color[3], 0);
        let sum = 0, split = 1;
        for (; split < box.length; split++) {
            sum += box[split - 1][3];
            if (sum >= total / 2) break;
        }
        boxes.push(box.slice(0, split), box.slice(split));
    }
    return boxes.map(box => {
        const weight = box.reduce((sum, c) => sum + c[3], 0);
        return [0, 1, 2].map(channel => Math.round(box.reduce((sum, c) => sum + c[channel] * c[3], 0) / weight));
    });
}

export function ditherImageData(imageData, colorLimit = 16) {
    const { data, width, height } = imageData;
    const limit = Math.max(2, Math.min(256, Math.floor(Number(colorLimit) || 16)));
    const histogram = new Map();
    for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) continue;
        const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        const color = histogram.get(key);
        if (color) color[3]++;
        else histogram.set(key, [data[i], data[i + 1], data[i + 2], 1]);
    }
    const colors = Array.from(histogram.values());
    if (colors.length <= limit) return imageData;
    const palette = makePalette(colors, limit);
    const linearPalette = palette.map(color => color.map(toLinear));
    const errors = [new Float32Array((width + 2) * 3), new Float32Array((width + 2) * 3)];

    for (let y = 0; y < height; y++) {
        const reverse = (y & 1) === 1;
        const current = errors[y & 1];
        const next = errors[(y + 1) & 1];
        next.fill(0);
        for (let n = 0; n < width; n++) {
            const x = reverse ? width - 1 - n : n;
            const i = (y * width + x) * 4;
            const e = (x + 1) * 3;
            if (!data[i + 3]) { current[e] = current[e + 1] = current[e + 2] = 0; continue; }
            const original = [0, 1, 2].map(c => toLinear(data[i + c]));
            const adjusted = original.map((v, c) => Math.max(0, Math.min(1, v + current[e + c])));
            let best = 0, bestDistance = Infinity;
            for (let p = 0; p < palette.length; p++) {
                const d0 = adjusted[0] - linearPalette[p][0];
                const d1 = adjusted[1] - linearPalette[p][1];
                const d2 = adjusted[2] - linearPalette[p][2];
                const distance = 0.2126 * d0 * d0 + 0.7152 * d1 * d1 + 0.0722 * d2 * d2;
                if (distance < bestDistance) { bestDistance = distance; best = p; }
            }
            for (let c = 0; c < 3; c++) data[i + c] = palette[best][c];
            const error = adjusted.map((v, c) => v - linearPalette[best][c]);
            const bounded = error.map(v => Math.sign(v) * Math.min(0.1875, Math.abs(v)));
            const forward = reverse ? -1 : 1;
            const add = (array, px, channel, amount) => {
                if (px < 0 || px >= width) return;
                const pi = (y * width + px) * 4;
                if (array === next) {
                    const py = (y + 1) * width + px;
                    if (py >= width * height || !data[pi + width * 4 + 3]) return;
                    array[(px + 1) * 3 + channel] += amount;
                } else if (data[pi + 3]) array[(px + 1) * 3 + channel] += amount;
            };
            for (let c = 0; c < 3; c++) {
                add(current, x + forward, c, bounded[c] * 7 / 16);
                add(next, x - forward, c, bounded[c] * 3 / 16);
                add(next, x, c, bounded[c] * 5 / 16);
                add(next, x + forward, c, bounded[c] / 16);
            }
            current[e] = current[e + 1] = current[e + 2] = 0;
        }
    }
    return imageData;
}
