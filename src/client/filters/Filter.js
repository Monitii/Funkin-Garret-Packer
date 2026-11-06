class Filter {
    constructor() {
    }

    apply(buffer) {
        if (this.constructor === Filter) return buffer;

        let retCanvas = document.createElement("canvas");
        let retCtx = retCanvas.getContext("2d");

        retCanvas.width = buffer.width;
        retCanvas.height = buffer.height;

        let bufferCtx = buffer.getContext("2d", { willReadFrequently: true });

        const maxChunkPixels = 1024 * 1024;
        const chunkHeight = Math.max(1, Math.min(128, Math.floor(maxChunkPixels / buffer.width)));
        for (let y = 0; y < buffer.height; y += chunkHeight) {
            const height = Math.min(chunkHeight, buffer.height - y);
            const imageData = bufferCtx.getImageData(0, y, buffer.width, height);
            retCtx.putImageData(this.applyImageData(imageData), 0, y);
        }

        return retCanvas;
    }

    applyImageData(imageData) {
        return imageData;
    }

    static get type() {
        return "none";
    }
}

export default Filter;
