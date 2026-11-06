//stolen from gimp hahaha
export function ditherImageData(imageData, levels = 4) {
    const { data, width, height } = imageData;
    const errors = new Float32Array(width * height * 3);
    const max = Math.max(1, levels - 1);
    const quantize = value => Math.round(Math.max(0, Math.min(255, value)) / 255 * max) * 255 / max;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (data[i + 3] === 0) continue;
            const e = (y * width + x) * 3;
            const old = [0, 1, 2].map(c => Math.max(0, Math.min(255, data[i + c] + errors[e + c])));
            const next = old.map(quantize);
            for (let c = 0; c < 3; c++) data[i + c] = next[c];
            const error = old.map((v, c) => v - next[c]);
            
            const distribute = (nx, ny, weight) => {
                if (nx < 0 || nx >= width || ny >= height) return;
                const ni = (ny * width + nx) * 4;
                if (data[ni + 3] === 0) return;
                const ne = (ny * width + nx) * 3;
                for (let c = 0; c < 3; c++) errors[ne + c] += error[c] * weight;
            };
            distribute(x + 1, y, 7 / 16);
            distribute(x - 1, y + 1, 3 / 16);
            distribute(x, y + 1, 5 / 16);
            distribute(x + 1, y + 1, 1 / 16);
        }
    }
    return imageData;
}
