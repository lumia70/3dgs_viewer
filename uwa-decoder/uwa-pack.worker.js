// Pre-pack UWA decode output into the exact stream layout used by PlayCanvas'
// GSplatResource (splatColor / transformA / transformB / splatSH_*). This keeps the
// per-splat packing loops off the render thread.

const floatView = new Float32Array(1);
const int32View = new Int32Array(floatView.buffer);

// Same conversion as PlayCanvas FloatPacking.float2Half.
const float2Half = (value) => {
    floatView[0] = value;
    const x = int32View[0];

    let bits = (x >> 16) & 0x8000;
    let m = (x >> 12) & 0x07ff;
    const e = (x >> 23) & 0xff;

    if (e < 103) {
        if (e === 102 && (x & 0x007fffff)) {
            bits |= 1;
        }
        return bits;
    }

    if (e > 142) {
        bits |= 0x7c00;
        if (e === 255 && (x & 0x007fffff)) {
            bits |= 0x0200;
        }
        return bits;
    }

    if (e < 113) {
        m |= 0x0800;
        bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
        return bits;
    }

    bits |= ((e - 112) << 10) | (m >> 1);
    bits += m & 1;
    return bits;
};

const NUM_COEFFS = { 1: 3, 2: 8, 3: 15 };

const pack = (data) => {
    const count = data.numPoints;
    const positions = data.positions;
    const scales = data.scales;
    const rotations = data.rotations;
    const colors = data.colors;
    const features = data.featuresRestChannelMajor;

    const color = new Uint16Array(count * 4);
    const transformA = new Uint32Array(count * 4);
    const transformAFloat = new Float32Array(transformA.buffer);
    const transformB = new Uint16Array(count * 4);

    for (let i = 0; i < count; ++i) {
        const c = i * 4;
        color[c + 0] = float2Half(colors[c + 0] / 255);
        color[c + 1] = float2Half(colors[c + 1] / 255);
        color[c + 2] = float2Half(colors[c + 2] / 255);
        color[c + 3] = float2Half(colors[c + 3] / 255);

        transformAFloat[i * 4 + 0] = positions[i * 3 + 0];
        transformAFloat[i * 4 + 1] = positions[i * 3 + 1];
        transformAFloat[i * 4 + 2] = positions[i * 3 + 2];

        let w = rotations[i * 4 + 0];
        let x = rotations[i * 4 + 1];
        let y = rotations[i * 4 + 2];
        let z = rotations[i * 4 + 3];
        const len = Math.hypot(w, x, y, z);
        if (len > 0) {
            w /= len;
            x /= len;
            y /= len;
            z /= len;
        }
        if (w < 0) {
            w = -w;
            x = -x;
            y = -y;
            z = -z;
        }

        transformA[i * 4 + 3] = (float2Half(x) | (float2Half(y) << 16)) >>> 0;
        transformB[i * 4 + 0] = float2Half(scales[i * 3 + 0]);
        transformB[i * 4 + 1] = float2Half(scales[i * 3 + 1]);
        transformB[i * 4 + 2] = float2Half(scales[i * 3 + 2]);
        transformB[i * 4 + 3] = float2Half(z);
    }

    const shBands = Math.min(3, Math.max(0, data.shDegree | 0));
    const numCoeffs = NUM_COEFFS[shBands] ?? 0;
    const sh = {};

    if (numCoeffs > 0 && features && features.length >= count * numCoeffs * 3) {
        const sh1 = new Uint32Array(count * 4);
        const sh4 = shBands > 1 ? new Uint32Array(count * 4) : null;
        const sh8 = shBands > 1 ? new Uint32Array(shBands > 2 ? count * 4 : count) : null;
        const sh12 = shBands > 2 ? new Uint32Array(count * 4) : null;

        const t11 = (1 << 11) - 1;
        const t10 = (1 << 10) - 1;
        const maxFloat = new Float32Array(1);
        const maxUint = new Uint32Array(maxFloat.buffer);
        const c = new Float32Array(numCoeffs * 3);

        for (let i = 0; i < count; ++i) {
            for (let j = 0; j < numCoeffs; ++j) {
                c[j * 3 + 0] = features[j * count + i];
                c[j * 3 + 1] = features[(numCoeffs + j) * count + i];
                c[j * 3 + 2] = features[(numCoeffs * 2 + j) * count + i];
            }

            let max = c[0];
            for (let j = 1; j < numCoeffs * 3; ++j) {
                max = Math.max(max, Math.abs(c[j]));
            }
            if (max === 0) {
                continue;
            }

            for (let j = 0; j < numCoeffs; ++j) {
                c[j * 3 + 0] = Math.max(0, Math.min(t11, Math.floor((c[j * 3 + 0] / max * 0.5 + 0.5) * t11 + 0.5)));
                c[j * 3 + 1] = Math.max(0, Math.min(t10, Math.floor((c[j * 3 + 1] / max * 0.5 + 0.5) * t10 + 0.5)));
                c[j * 3 + 2] = Math.max(0, Math.min(t11, Math.floor((c[j * 3 + 2] / max * 0.5 + 0.5) * t11 + 0.5)));
            }

            maxFloat[0] = max;
            sh1[i * 4 + 0] = maxUint[0];
            sh1[i * 4 + 1] = c[0] << 21 | c[1] << 11 | c[2];
            sh1[i * 4 + 2] = c[3] << 21 | c[4] << 11 | c[5];
            sh1[i * 4 + 3] = c[6] << 21 | c[7] << 11 | c[8];

            if (sh4) {
                sh4[i * 4 + 0] = c[9] << 21 | c[10] << 11 | c[11];
                sh4[i * 4 + 1] = c[12] << 21 | c[13] << 11 | c[14];
                sh4[i * 4 + 2] = c[15] << 21 | c[16] << 11 | c[17];
                sh4[i * 4 + 3] = c[18] << 21 | c[19] << 11 | c[20];
            }

            if (sh8) {
                if (sh12) {
                    sh8[i * 4 + 0] = c[21] << 21 | c[22] << 11 | c[23];
                    sh8[i * 4 + 1] = c[24] << 21 | c[25] << 11 | c[26];
                    sh8[i * 4 + 2] = c[27] << 21 | c[28] << 11 | c[29];
                    sh8[i * 4 + 3] = c[30] << 21 | c[31] << 11 | c[32];
                    sh12[i * 4 + 0] = c[33] << 21 | c[34] << 11 | c[35];
                    sh12[i * 4 + 1] = c[36] << 21 | c[37] << 11 | c[38];
                    sh12[i * 4 + 2] = c[39] << 21 | c[40] << 11 | c[41];
                    sh12[i * 4 + 3] = c[42] << 21 | c[43] << 11 | c[44];
                } else {
                    sh8[i] = c[21] << 21 | c[22] << 11 | c[23];
                }
            }
        }

        sh.splatSH_1to3 = sh1;
        if (sh4) sh.splatSH_4to7 = sh4;
        if (sh8) sh.splatSH_8to11 = sh8;
        if (sh12) sh.splatSH_12to15 = sh12;
    }

    const transfer = [color.buffer, transformA.buffer, transformB.buffer, positions.buffer, scales.buffer];
    for (const texture of Object.values(sh)) {
        transfer.push(texture.buffer);
    }

    self.postMessage({
        positions,
        scales,
        packed: { color, transformA, transformB, sh },
        shBands
    }, transfer);
};

self.onmessage = (event) => {
    try {
        pack(event.data);
    } catch (e) {
        self.postMessage({ error: e?.message ?? String(e) });
    }
};
