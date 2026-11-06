// stolen from gimp hahaha
const toLinear = value => {
    value /= 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
};
const toSrgb = value => {
    value = Math.max(0, Math.min(1, value));
    return 255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055);
};

const LAB_LOW_A = -86.181, LAB_HIGH_A = 98.237;
const LAB_LOW_B = -107.858, LAB_HIGH_B = 94.480;
const LAB_SCALE_A = 255 / (LAB_HIGH_A - LAB_LOW_A);
const LAB_SCALE_B = 255 / (LAB_HIGH_B - LAB_LOW_B);
const GIMP_LAB_WEIGHTS = [13, 24, 26];

function rgbToLabCoordinates(rgb) {
    const r = toLinear(rgb[0]), g = toLinear(rgb[1]), b = toLinear(rgb[2]);
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    const y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b);
    const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
    const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
    const fx = f(x), fy = f(y), fz = f(z);
    const lab = [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    return [
        Math.max(0, Math.min(255, lab[0] * 2.55)),
        Math.max(0, Math.min(255, (lab[1] - LAB_LOW_A) * LAB_SCALE_A)),
        Math.max(0, Math.min(255, (lab[2] - LAB_LOW_B) * LAB_SCALE_B))
    ];
}

function labCoordinatesToRgb(coordinates) {
    const lab = [
        coordinates[0] / 2.55,
        coordinates[1] / LAB_SCALE_A + LAB_LOW_A,
        coordinates[2] / LAB_SCALE_B + LAB_LOW_B
    ];
    const fy = (lab[0] + 16) / 116;
    const fx = fy + lab[1] / 500;
    const fz = fy - lab[2] / 200;
    const inv = t => t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) * 27 / 24389;
    const x = 0.95047 * inv(fx), y = inv(fy), z = 1.08883 * inv(fz);
    return [
        toSrgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
        toSrgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z),
        toSrgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z)
    ].map(Math.round);
}

function limitDiffusionError(error, lowBleed) {
    const magnitude = Math.abs(error);
    let limited;
    if (lowBleed) {
        const firstLimit = (24 * 256) / 65535;
        const secondLimit = (24 * 2 * 256) / 65535;
        limited = magnitude < firstLimit ? magnitude
            : magnitude < secondLimit ? (magnitude - firstLimit) / 2 + firstLimit
            : secondLimit;
    } else {
        limited = Math.min(magnitude, (192 * 256) / 65535);
    }
    return Math.sign(error) * limited;
}

function makePalette(colors, limit) {
    const samples = colors.map(color => [...color, rgbToLabCoordinates(color).map(Math.round)]);
    let boxes = [samples];
    while (boxes.length < limit) {
        let choice = -1;
        let bestScore = 0;
        let splitChannel = 0;
        for (let b = 0; b < boxes.length; b++) {
            const box = boxes[b];
            if (box.length < 2) continue;
            const population = box.reduce((sum, color) => sum + color[3], 0);
            const means = [0, 1, 2].map(c => box.reduce((sum, color) => sum + color[4][c] * color[3], 0) / population);
            const errors = [0, 1, 2].map(c => box.reduce((sum, color) => {
                const delta = color[4][c] - means[c];
                return sum + color[3] * delta * delta;
            }, 0) * GIMP_LAB_WEIGHTS[c] * GIMP_LAB_WEIGHTS[c]);
            const channel = errors.indexOf(Math.max(...errors));
            let score = errors[channel];
            if (limit <= 16 && boxes.length <= 2) {
                const lightnessBias = boxes.length === 1 ? 2.66 : 1.33;
                if (channel === 0) score *= lightnessBias;
            }
            if (score > bestScore) { bestScore = score; choice = b; splitChannel = channel; }
        }
        if (choice < 0) break;
        const box = boxes.splice(choice, 1)[0].slice().sort((a, b) => a[4][splitChannel] - b[4][splitChannel]);
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
        const labCoordinates = [0, 1, 2].map(channel => box.reduce((sum, c) => sum + c[4][channel] * c[3], 0) / weight);
        return labCoordinatesToRgb(labCoordinates);
    });
}

export function ditherImageData(imageData, colorLimit = 16, lowBleed = true) {
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
    const labPalette = palette.map(color => rgbToLabCoordinates(color).map(Math.round));
    const paletteMin = [0, 1, 2].map(c => Math.min(...linearPalette.map(color => color[c])));
    const paletteMax = [0, 1, 2].map(c => Math.max(...linearPalette.map(color => color[c])));
    const errors = [new Float32Array((width + 2) * 3), new Float32Array((width + 2) * 3)];
    const inverseColorCache = new Map();

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
            const adjusted = original.map((v, c) => Math.max(paletteMin[c], Math.min(paletteMax[c], v + limitDiffusionError(current[e + c], lowBleed))));
            const adjustedLab = rgbToLabCoordinates(adjusted.map(toSrgb)).map(Math.round);
            const cacheKey = (adjustedLab[0] << 16) | (adjustedLab[1] << 8) | adjustedLab[2];
            let best = inverseColorCache.get(cacheKey);
            if (best === undefined) {
                let bestDistance = Infinity;
                for (let p = 0; p < palette.length; p++) {
                    const d0 = adjustedLab[0] - labPalette[p][0];
                    const d1 = adjustedLab[1] - labPalette[p][1];
                    const d2 = adjustedLab[2] - labPalette[p][2];
                    const distance = (d0 * GIMP_LAB_WEIGHTS[0]) ** 2
                        + (d1 * GIMP_LAB_WEIGHTS[1]) ** 2
                        + (d2 * GIMP_LAB_WEIGHTS[2]) ** 2;
                    if (distance < bestDistance) { bestDistance = distance; best = p; }
                }
                inverseColorCache.set(cacheKey, best);
            }
            for (let c = 0; c < 3; c++) data[i + c] = palette[best][c];
            const error = adjusted.map((v, c) => v - linearPalette[best][c]);
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
                add(current, x + forward, c, error[c] * 7 / 16);
                add(next, x - forward, c, error[c] * 3 / 16);
                add(next, x, c, error[c] * 5 / 16);
                add(next, x + forward, c, error[c] / 16);
            }
            current[e] = current[e + 1] = current[e + 2] = 0;
        }
    }
    return imageData;
}
