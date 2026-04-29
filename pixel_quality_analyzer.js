const sharp = require("sharp");

const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

const QUALITY_COLOR_PROFILES = {
    w: { label: "白", rgb: [232, 232, 232] },
    g: { label: "绿", rgb: [64, 212, 106] },
    b: { label: "蓝", rgb: [78, 161, 255] },
    p: { label: "紫", rgb: [166, 92, 255] },
    o: { label: "金", rgb: [255, 208, 76] },
    r: { label: "红", rgb: [242, 76, 76] }
};

const QUALITY_ANALYSIS_PROFILES = {
    standard: {
        qualityProfile: "standard"
    },
    high_contrast_191: {
        qualityProfile: "high_contrast_191",
        backgroundTileSize: 6,
        minTileQualityFraction: 0.14,
        minTileDominanceMargin: 1.08,
        minBackgroundRegionTiles: 5,
        minBackgroundRegionDimension: 18,
        minBackgroundEdgeCoverage: 0.34,
        suppressNestedObjectColors: true,
        minNestedObjectContainment: 0.78,
        minNestedContainerAreaRatio: 1.25,
        maxNestedObjectAreaRatio: 0.72
    }
};

function resolveQualityAnalysisOptions(options = {}) {
    const requestedProfile = String(options.qualityProfile || options.profile || "standard");
    const profile = QUALITY_ANALYSIS_PROFILES[requestedProfile] ? requestedProfile : "standard";
    return {
        ...QUALITY_ANALYSIS_PROFILES[profile],
        ...options,
        qualityProfile: profile
    };
}

function clampInteger(value, min, max) {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, numeric));
}

function resolveCrop(crop = null, width, height) {
    if (!crop || typeof crop !== "object") {
        return {
            left: 0,
            top: 0,
            width,
            height
        };
    }

    const rawLeft = Number(crop.left ?? crop.x ?? 0);
    const rawTop = Number(crop.top ?? crop.y ?? 0);
    const rawWidth = Number(crop.width ?? 1);
    const rawHeight = Number(crop.height ?? 1);
    const left = rawLeft > 0 && rawLeft < 1 ? rawLeft * width : rawLeft;
    const top = rawTop > 0 && rawTop < 1 ? rawTop * height : rawTop;
    const cropWidth = rawWidth > 0 && rawWidth <= 1 ? rawWidth * width : rawWidth;
    const cropHeight = rawHeight > 0 && rawHeight <= 1 ? rawHeight * height : rawHeight;
    const resolvedLeft = clampInteger(left, 0, Math.max(0, width - 1));
    const resolvedTop = clampInteger(top, 0, Math.max(0, height - 1));

    return {
        left: resolvedLeft,
        top: resolvedTop,
        width: clampInteger(cropWidth, 1, width - resolvedLeft),
        height: clampInteger(cropHeight, 1, height - resolvedTop)
    };
}

function colorDistance([leftR, leftG, leftB], [rightR, rightG, rightB]) {
    return Math.sqrt(
        ((leftR - rightR) ** 2)
        + ((leftG - rightG) ** 2)
        + ((leftB - rightB) ** 2)
    );
}

function rgbToHsl(r, g, b) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;
    const delta = max - min;

    if (delta === 0) {
        return { h: 0, s: 0, l: lightness };
    }

    const saturation = delta / (1 - Math.abs((2 * lightness) - 1));
    let hue;
    if (max === red) {
        hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
        hue = 60 * (((blue - red) / delta) + 2);
    } else {
        hue = 60 * (((red - green) / delta) + 4);
    }

    return {
        h: hue < 0 ? hue + 360 : hue,
        s: saturation,
        l: lightness
    };
}

function scoreQualityPixel(quality, r, g, b) {
    const profile = QUALITY_COLOR_PROFILES[quality];
    if (!profile) return 0;
    return Math.max(0, 1 - (colorDistance([r, g, b], profile.rgb) / 185));
}

function classifyPixelQuality(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const range = max - min;

    if (max >= 180 && range <= 62) return "w";
    if (r >= 170 && g >= 125 && b <= 145 && r >= g * 1.05) return "o";
    if (r >= 155 && r >= g * 1.45 && r >= b * 1.35) return "r";
    if (g >= 135 && g >= r * 1.25 && g >= b * 1.08) return "g";
    if (r >= 110 && b >= 150 && g <= 150 && b >= g * 1.25) return "p";
    if (b >= 150 && b >= r * 1.25 && b >= g * 1.05) return "b";
    return null;
}

function classifyTileBackgroundQuality(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    if (max > 215 || max < 42 || chroma < 30) return null;

    const { h, s, l } = rgbToHsl(r, g, b);
    if (s < 0.18 || l < 0.13 || l > 0.62) return null;

    if ((h <= 18 || h >= 342) && r >= g * 1.18 && r >= b * 1.05) return "r";
    if (h >= 30 && h <= 58 && r >= g * 0.95 && g >= b * 1.22) return "o";
    if (h >= 82 && h <= 165 && g >= r * 1.08 && g >= b * 0.82) return "g";
    if (h >= 188 && h <= 232 && b >= r * 1.15 && b >= g * 0.92) return "b";
    if (h >= 246 && h <= 315 && b >= g * 1.08 && r >= g * 1.08) return "p";
    return null;
}

function classifyHighContrastTileBackgroundQuality(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    if (max > 230 || max < 34 || chroma < 8) return null;

    const { h, s, l } = rgbToHsl(r, g, b);
    if (s < 0.055 || l < 0.1 || l > 0.7) return null;

    if ((h <= 18 || h >= 342) && r >= g * 0.92 && r >= b * 0.92) return "r";
    if (h >= 30 && h <= 58 && chroma >= 18 && r >= g * 0.88 && g >= b * 1.05) return "o";
    if (h >= 78 && h <= 168 && g >= r * 0.96 && g >= b * 0.84) return "g";
    if (h >= 178 && h <= 238 && chroma >= 26 && b >= r * 1.03 && b >= g * 0.92) return "b";
    if (h >= 239 && h <= 318 && chroma >= 22 && b >= g * 0.98 && r >= g * 0.82) return "p";
    return null;
}

function classifyBackgroundQuality(r, g, b, options = {}) {
    if (options.qualityProfile === "high_contrast_191") {
        return classifyHighContrastTileBackgroundQuality(r, g, b);
    }
    return classifyTileBackgroundQuality(r, g, b);
}

function getPixelIndex(x, y, width) {
    return ((y * width) + x) * 4;
}

function isUsefulComponent(component, options, crop) {
    const minComponentPixels = Number.isFinite(options.minComponentPixels) ? options.minComponentPixels : 120;
    const minDimension = Number.isFinite(options.minDimension) ? options.minDimension : 8;
    const maxWidth = Number.isFinite(options.maxWidth) ? options.maxWidth : crop.width * 0.96;
    const maxHeight = Number.isFinite(options.maxHeight) ? options.maxHeight : crop.height * 0.96;
    const requireFrameShape = options.requireFrameShape !== false;

    if (component.pixel_count < minComponentPixels) return false;
    if (component.width < minDimension || component.height < minDimension) return false;
    if (component.width > maxWidth || component.height > maxHeight) return false;
    if (requireFrameShape) {
        const minFrameDimension = Number.isFinite(options.minFrameDimension) ? options.minFrameDimension : 22;
        const minFrameEdgeCoverage = Number.isFinite(options.minFrameEdgeCoverage) ? options.minFrameEdgeCoverage : 0.28;
        const maxFrameFillRatio = Number.isFinite(options.maxFrameFillRatio) ? options.maxFrameFillRatio : 0.62;
        const minFrameFillRatio = Number.isFinite(options.minFrameFillRatio) ? options.minFrameFillRatio : 0.055;
        if (component.width < minFrameDimension || component.height < minFrameDimension) return false;
        if (component.fill_ratio < minFrameFillRatio || component.fill_ratio > maxFrameFillRatio) return false;
        if (component.edge_coverage < minFrameEdgeCoverage) return false;
    }
    return true;
}

function collectFrameQualityComponents(raw, width, height, crop, options = {}) {
    const visited = new Uint8Array(width * height);
    const blocks = [];
    const qualityByOffset = new Array(width * height);
    const scoreByOffset = new Float32Array(width * height);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = getPixelIndex(x, y, width);
            const quality = classifyPixelQuality(raw[index], raw[index + 1], raw[index + 2]);
            const offset = (y * width) + x;
            qualityByOffset[offset] = quality;
            scoreByOffset[offset] = quality ? scoreQualityPixel(quality, raw[index], raw[index + 1], raw[index + 2]) : 0;
        }
    }

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const startOffset = (y * width) + x;
            const quality = qualityByOffset[startOffset];
            if (!quality || visited[startOffset]) continue;

            const queue = [startOffset];
            visited[startOffset] = 1;
            let cursor = 0;
            let minX = x;
            let maxX = x;
            let minY = y;
            let maxY = y;
            let scoreSum = 0;
            let topEdgePixels = 0;
            let bottomEdgePixels = 0;
            let leftEdgePixels = 0;
            let rightEdgePixels = 0;

            while (cursor < queue.length) {
                const offset = queue[cursor];
                cursor += 1;
                const pointY = Math.floor(offset / width);
                const pointX = offset - (pointY * width);

                minX = Math.min(minX, pointX);
                maxX = Math.max(maxX, pointX);
                minY = Math.min(minY, pointY);
                maxY = Math.max(maxY, pointY);
                scoreSum += scoreByOffset[offset];

                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
                    const nx = pointX + dx;
                    const ny = pointY + dy;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
                    const nextOffset = (ny * width) + nx;
                    if (visited[nextOffset] || qualityByOffset[nextOffset] !== quality) return;
                    visited[nextOffset] = 1;
                    queue.push(nextOffset);
                });
            }

            queue.forEach((offset) => {
                const pointY = Math.floor(offset / width);
                const pointX = offset - (pointY * width);
                if (pointY === minY) topEdgePixels += 1;
                if (pointY === maxY) bottomEdgePixels += 1;
                if (pointX === minX) leftEdgePixels += 1;
                if (pointX === maxX) rightEdgePixels += 1;
            });

            const componentWidth = maxX - minX + 1;
            const componentHeight = maxY - minY + 1;
            const horizontalEdgeCoverage = Math.min(topEdgePixels, bottomEdgePixels) / componentWidth;
            const verticalEdgeCoverage = Math.min(leftEdgePixels, rightEdgePixels) / componentHeight;
            const component = {
                quality,
                label: QUALITY_COLOR_PROFILES[quality].label,
                x: crop.left + minX,
                y: crop.top + minY,
                width: componentWidth,
                height: componentHeight,
                pixel_count: queue.length,
                fill_ratio: Math.round((queue.length / (componentWidth * componentHeight)) * 10000) / 10000,
                edge_coverage: Math.round(Math.min(horizontalEdgeCoverage, verticalEdgeCoverage) * 10000) / 10000,
                confidence: Math.round((scoreSum / queue.length) * 10000) / 10000,
                detection_method: "frame_component"
            };
            if (isUsefulComponent(component, options, crop)) blocks.push(component);
        }
    }

    return blocks.sort((left, right) => left.y - right.y || left.x - right.x || QUALITY_ORDER.indexOf(left.quality) - QUALITY_ORDER.indexOf(right.quality));
}

function chooseDominantQuality(counts) {
    const ranked = QUALITY_ORDER
        .filter((quality) => quality !== "w")
        .map((quality) => ({ quality, count: counts[quality] || 0 }))
        .sort((left, right) => right.count - left.count);
    const top = ranked[0];
    const next = ranked[1];
    if (!top || top.count <= 0) return null;
    return {
        quality: top.quality,
        count: top.count,
        margin: next && next.count > 0 ? top.count / next.count : Infinity
    };
}

function collectBackgroundTileComponents(raw, width, height, crop, options = {}) {
    const tileSize = Number.isFinite(options.backgroundTileSize) ? options.backgroundTileSize : 8;
    const minTileQualityFraction = Number.isFinite(options.minTileQualityFraction) ? options.minTileQualityFraction : 0.18;
    const minTileDominanceMargin = Number.isFinite(options.minTileDominanceMargin) ? options.minTileDominanceMargin : 1.2;
    const gridWidth = Math.ceil(width / tileSize);
    const gridHeight = Math.ceil(height / tileSize);
    const qualityGrid = new Array(gridWidth * gridHeight);
    const confidenceGrid = new Float32Array(gridWidth * gridHeight);
    const visited = new Uint8Array(gridWidth * gridHeight);
    const blocks = [];

    for (let gridY = 0; gridY < gridHeight; gridY += 1) {
        for (let gridX = 0; gridX < gridWidth; gridX += 1) {
            const startX = gridX * tileSize;
            const startY = gridY * tileSize;
            const endX = Math.min(width, startX + tileSize);
            const endY = Math.min(height, startY + tileSize);
            const counts = Object.fromEntries(QUALITY_ORDER.map((quality) => [quality, 0]));
            let area = 0;

            for (let y = startY; y < endY; y += 1) {
                for (let x = startX; x < endX; x += 1) {
                    const index = getPixelIndex(x, y, width);
                    const quality = classifyBackgroundQuality(raw[index], raw[index + 1], raw[index + 2], options);
                    area += 1;
                    if (quality) counts[quality] += 1;
                }
            }

            const dominant = chooseDominantQuality(counts);
            const offset = (gridY * gridWidth) + gridX;
            if (!dominant) continue;
            if (dominant.count < area * minTileQualityFraction) continue;
            if (dominant.margin < minTileDominanceMargin) continue;
            qualityGrid[offset] = dominant.quality;
            confidenceGrid[offset] = dominant.count / area;
        }
    }

    for (let gridY = 0; gridY < gridHeight; gridY += 1) {
        for (let gridX = 0; gridX < gridWidth; gridX += 1) {
            const startOffset = (gridY * gridWidth) + gridX;
            const quality = qualityGrid[startOffset];
            if (!quality || visited[startOffset]) continue;

            const queue = [startOffset];
            visited[startOffset] = 1;
            let cursor = 0;
            let minGridX = gridX;
            let maxGridX = gridX;
            let minGridY = gridY;
            let maxGridY = gridY;
            let confidenceSum = 0;

            while (cursor < queue.length) {
                const offset = queue[cursor];
                cursor += 1;
                const pointY = Math.floor(offset / gridWidth);
                const pointX = offset - (pointY * gridWidth);

                minGridX = Math.min(minGridX, pointX);
                maxGridX = Math.max(maxGridX, pointX);
                minGridY = Math.min(minGridY, pointY);
                maxGridY = Math.max(maxGridY, pointY);
                confidenceSum += confidenceGrid[offset];

                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
                    const nx = pointX + dx;
                    const ny = pointY + dy;
                    if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) return;
                    const nextOffset = (ny * gridWidth) + nx;
                    if (visited[nextOffset] || qualityGrid[nextOffset] !== quality) return;
                    visited[nextOffset] = 1;
                    queue.push(nextOffset);
                });
            }

            const bboxTileWidth = maxGridX - minGridX + 1;
            const bboxTileHeight = maxGridY - minGridY + 1;
            const componentWidth = Math.min(width, (maxGridX + 1) * tileSize) - (minGridX * tileSize);
            const componentHeight = Math.min(height, (maxGridY + 1) * tileSize) - (minGridY * tileSize);
            const fillRatio = queue.length / (bboxTileWidth * bboxTileHeight);
            let topEdgeTiles = 0;
            let bottomEdgeTiles = 0;
            let leftEdgeTiles = 0;
            let rightEdgeTiles = 0;
            queue.forEach((offset) => {
                const pointY = Math.floor(offset / gridWidth);
                const pointX = offset - (pointY * gridWidth);
                if (pointY === minGridY) topEdgeTiles += 1;
                if (pointY === maxGridY) bottomEdgeTiles += 1;
                if (pointX === minGridX) leftEdgeTiles += 1;
                if (pointX === maxGridX) rightEdgeTiles += 1;
            });
            const horizontalEdgeCoverage = Math.min(topEdgeTiles, bottomEdgeTiles) / bboxTileWidth;
            const verticalEdgeCoverage = Math.min(leftEdgeTiles, rightEdgeTiles) / bboxTileHeight;
            const edgeCoverage = Math.min(horizontalEdgeCoverage, verticalEdgeCoverage);
            const minRegionTiles = Number.isFinite(options.minBackgroundRegionTiles) ? options.minBackgroundRegionTiles : 9;
            const minRegionDimension = Number.isFinite(options.minBackgroundRegionDimension) ? options.minBackgroundRegionDimension : 32;
            const minRegionFillRatio = Number.isFinite(options.minBackgroundRegionFillRatio) ? options.minBackgroundRegionFillRatio : 0.38;
            const minRegionEdgeCoverage = Number.isFinite(options.minBackgroundEdgeCoverage)
                ? options.minBackgroundEdgeCoverage
                : 0;

            if (queue.length < minRegionTiles) continue;
            if (componentWidth < minRegionDimension || componentHeight < minRegionDimension) continue;
            if (fillRatio < minRegionFillRatio) continue;
            if (edgeCoverage < minRegionEdgeCoverage) continue;

            blocks.push({
                quality,
                label: QUALITY_COLOR_PROFILES[quality].label,
                x: crop.left + (minGridX * tileSize),
                y: crop.top + (minGridY * tileSize),
                width: componentWidth,
                height: componentHeight,
                pixel_count: queue.length * tileSize * tileSize,
                fill_ratio: Math.round(fillRatio * 10000) / 10000,
                edge_coverage: Math.round(edgeCoverage * 10000) / 10000,
                confidence: Math.round((confidenceSum / queue.length) * 10000) / 10000,
                detection_method: "background_tile"
            });
        }
    }

    return blocks.sort((left, right) => left.y - right.y || left.x - right.x || QUALITY_ORDER.indexOf(left.quality) - QUALITY_ORDER.indexOf(right.quality));
}

function intersectionOverUnion(left, right) {
    const x1 = Math.max(left.x, right.x);
    const y1 = Math.max(left.y, right.y);
    const x2 = Math.min(left.x + left.width, right.x + right.width);
    const y2 = Math.min(left.y + left.height, right.y + right.height);
    const width = Math.max(0, x2 - x1);
    const height = Math.max(0, y2 - y1);
    const intersection = width * height;
    if (intersection <= 0) return 0;
    const leftArea = left.width * left.height;
    const rightArea = right.width * right.height;
    return intersection / (leftArea + rightArea - intersection);
}

function centerInside(inner, outer) {
    const centerX = inner.x + (inner.width / 2);
    const centerY = inner.y + (inner.height / 2);
    return centerX >= outer.x
        && centerX <= outer.x + outer.width
        && centerY >= outer.y
        && centerY <= outer.y + outer.height;
}

function blockArea(block) {
    return Math.max(0, Number(block && block.width) || 0) * Math.max(0, Number(block && block.height) || 0);
}

function intersectionArea(left, right) {
    const x1 = Math.max(left.x, right.x);
    const y1 = Math.max(left.y, right.y);
    const x2 = Math.min(left.x + left.width, right.x + right.width);
    const y2 = Math.min(left.y + left.height, right.y + right.height);
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function isNestedObjectColorBlock(inner, outer, options = {}) {
    if (!inner || !outer || inner === outer) return false;
    if (inner.quality === outer.quality) return false;

    const innerArea = blockArea(inner);
    const outerArea = blockArea(outer);
    if (innerArea <= 0 || outerArea <= 0) return false;

    const minContainerAreaRatio = Number.isFinite(options.minNestedContainerAreaRatio)
        ? options.minNestedContainerAreaRatio
        : 1.25;
    const maxObjectAreaRatio = Number.isFinite(options.maxNestedObjectAreaRatio)
        ? options.maxNestedObjectAreaRatio
        : 0.72;
    if (outerArea < innerArea * minContainerAreaRatio) return false;
    if (innerArea / outerArea > maxObjectAreaRatio) return false;
    if (!centerInside(inner, outer)) return false;

    const minContainment = Number.isFinite(options.minNestedObjectContainment)
        ? options.minNestedObjectContainment
        : 0.78;
    return (intersectionArea(inner, outer) / innerArea) >= minContainment;
}

function suppressNestedObjectColorBlocks(blocks, options = {}) {
    if (options.suppressNestedObjectColors !== true) return blocks;
    return blocks.filter((block) => !blocks.some((outer) => isNestedObjectColorBlock(block, outer, options)));
}

function mergeQualityBlocks(backgroundBlocks, frameBlocks) {
    const merged = [...backgroundBlocks];

    frameBlocks.forEach((frameBlock) => {
        const duplicateIndex = merged.findIndex((block) => (
            intersectionOverUnion(frameBlock, block) >= 0.2
            || centerInside(frameBlock, block)
            || centerInside(block, frameBlock)
        ));
        if (duplicateIndex === -1) {
            merged.push(frameBlock);
            return;
        }

        const existingBlock = merged[duplicateIndex];
        if (
            existingBlock.quality === frameBlock.quality
            && frameBlock.confidence > existingBlock.confidence
        ) {
            merged[duplicateIndex] = frameBlock;
        }
    });

    return merged.sort((left, right) => left.y - right.y || left.x - right.x || QUALITY_ORDER.indexOf(left.quality) - QUALITY_ORDER.indexOf(right.quality));
}

function collectQualityComponents(raw, width, height, crop, options = {}) {
    const backgroundBlocks = collectBackgroundTileComponents(raw, width, height, crop, options);
    const frameBlocks = collectFrameQualityComponents(raw, width, height, crop, options);
    const mergedBlocks = mergeQualityBlocks(backgroundBlocks, frameBlocks);
    return suppressNestedObjectColorBlocks(mergedBlocks, options);
}

async function analyzeQualityColorBlocksFromImageBuffer(input, options = {}) {
    const analysisOptions = resolveQualityAnalysisOptions(options);
    const image = sharp(input);
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error("无法读取图片尺寸");
    const crop = resolveCrop(analysisOptions.crop, metadata.width, metadata.height);
    const { data, info } = await image
        .extract(crop)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return {
        image: {
            width: metadata.width,
            height: metadata.height
        },
        crop,
        quality_profile: analysisOptions.qualityProfile,
        quality_profiles: QUALITY_COLOR_PROFILES,
        blocks: collectQualityComponents(data, info.width, info.height, crop, analysisOptions)
    };
}

async function analyzeQualityColorBlocksFromImageFile(filePath, options = {}) {
    return analyzeQualityColorBlocksFromImageBuffer(filePath, options);
}

function summarizeQualityBlocks(blocks = []) {
    const counts = Object.fromEntries(QUALITY_ORDER.map((quality) => [quality, 0]));
    (Array.isArray(blocks) ? blocks : []).forEach((block) => {
        if (QUALITY_ORDER.includes(block.quality)) counts[block.quality] += 1;
    });
    return {
        counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0)
    };
}

module.exports = {
    QUALITY_COLOR_PROFILES,
    QUALITY_ORDER,
    analyzeQualityColorBlocksFromImageBuffer,
    analyzeQualityColorBlocksFromImageFile,
    classifyPixelQuality,
    resolveCrop,
    summarizeQualityBlocks
};
