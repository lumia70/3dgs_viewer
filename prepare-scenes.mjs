import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const WORKSPACE = join(ROOT, '..');
const SCENE_ROOTS = [
    { id: 'dianpu', label: 'Dianpu LOD scenes', dir: join(WORKSPACE, 'data/lod/dianpu') },
    { id: '500w-sh0-lod', label: '500w SH0 LOD scenes', dir: join(WORKSPACE, 'data/lod/500w-sh0-lod') }
];
const SETTINGS_DIR = join(ROOT, 'settings');
const GLB_POINT_BUDGET = 3_500_000;
const PAD = 2.0;

const readJson = (file) => {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
};

const glbJson = (file) => {
    const fd = openSync(file, 'r');
    const head = Buffer.alloc(1024 * 1024);
    const length = readSync(fd, head, 0, head.length, 0);
    closeSync(fd);
    const buffer = head.subarray(0, length);
    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const length = buffer.readUInt32LE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (type.trim() === 'JSON') {
            return JSON.parse(buffer.toString('utf8', offset + 8, offset + 8 + length));
        }
        offset += 8 + length;
    }
    return null;
};

const glbInfo = (file) => {
    try {
        const json = glbJson(file);
        const accessor = json?.accessors?.[0];
        if (!accessor || !Number.isFinite(accessor.count) || !accessor.min || !accessor.max) {
            return null;
        }
        return {
            count: accessor.count,
            min: accessor.min,
            max: accessor.max,
            uwa: [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])]
            .some(extension => extension.startsWith('UWA_'))
        };
    } catch {
        return null;
    }
};

const collectFilesByLevel = (tree) => {
    const levels = new Map();
    const walk = (node) => {
        if (node.lods) {
            for (const [level, lod] of Object.entries(node.lods)) {
                if (!levels.has(level)) {
                    levels.set(level, new Set());
                }
                levels.get(level).add(lod.file);
            }
        }
        (node.children ?? []).forEach(walk);
    };
    walk(tree ?? {});
    return levels;
};

const absolute = (scene, name) => `/data/lod/dianpu/${scene}/${name}`;

const settingsTemplate = (position, target) => ({
    version: 2,
    tonemapping: 'linear',
    highPrecisionRendering: false,
    background: { color: [0, 0, 0] },
    postEffectSettings: {
        sharpness: { enabled: false, amount: 0 },
        bloom: { enabled: false, intensity: 0.1, blurLevel: 2 },
        grading: { enabled: false, brightness: 1, contrast: 1, saturation: 1, tint: [1, 1, 1] },
        vignette: { enabled: false, intensity: 0.5, inner: 0.3, outer: 0.75, curvature: 1 },
        fringing: { enabled: false, intensity: 0.5 }
    },
    animTracks: [],
    cameras: [{
        initial: {
            position,
            target,
            fov: 75
        }
    }],
    annotations: [],
    startMode: 'default'
});

const mirror = (v) => [-v[0], -v[1], v[2]];

const prepareSettings = (sceneDir, scene) => {
    const sceneJson = readJson(join(sceneDir, 'default.scene.json'));
    const camera = sceneJson?.cameraInfo;
    if (!camera?.position || !camera?.lookAt) {
        return false;
    }
    mkdirSync(SETTINGS_DIR, { recursive: true });
    writeFileSync(join(SETTINGS_DIR, `${scene}.json`), JSON.stringify(
        settingsTemplate(camera.position, camera.lookAt), null, 4
    ));
    return true;
};

const prepareSog = (sceneDir, scene) => {
    for (const name of ['lod-meta-sog.json', 'lod-meta.json']) {
        const manifest = readJson(join(sceneDir, name));
        if (!manifest?.filenames?.length || !manifest.tree) {
            continue;
        }
        if (!manifest.filenames.some(file => file.toLowerCase().endsWith('.sog'))) {
            continue;
        }
        const output = {
            ...manifest,
            filenames: manifest.filenames,
            upAxis: 'y'
        };
        if (typeof output.environment === 'string') {
            output.environment = output.environment;
        } else if (!output.environment) {
            delete output.environment;
        }
        mkdirSync(join(sceneDir, 'sog'), { recursive: true });
        writeFileSync(join(sceneDir, 'sog', 'lod-meta.json'), JSON.stringify(output, null, 2));
        return true;
    }
    return false;
};

const prepareGlb = (sceneDir, scene) => {
    // The AGP/mobile loader indexes GLB LOD through the same per-node
    // `lod-meta.json` tree as SOG. Keep the original tree and offsets; the
    // engine's octree then selects/upgrades levels per leaf.
    const manifest = readJson(join(sceneDir, 'lod-meta.json'));
    if (!manifest?.filenames?.length || !manifest.tree) {
        return null;
    }
    if (!manifest.filenames.some(file => file.toLowerCase().endsWith('.glb'))) {
        return null;
    }

    const output = {
        ...manifest,
        upAxis: 'y'
    };
    delete output.previewLevel;

    mkdirSync(join(sceneDir, 'glb'), { recursive: true });
    writeFileSync(join(sceneDir, 'glb', 'lod-meta.json'), JSON.stringify(output, null, 2));
    return { levels: manifest.lodLevels, files: manifest.filenames.length };
};

const report = [];
for (const root of SCENE_ROOTS) {
    const scenes = readdirSync(root.dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

    for (const scene of scenes) {
        const sceneDir = join(root.dir, scene);
        const settings = prepareSettings(sceneDir, scene);
        const sog = prepareSog(sceneDir, scene);
        const glb = prepareGlb(sceneDir, scene);
        report.push({ root: root.id, label: root.label, scene, settings, sog, glb });
    }
}

writeFileSync(join(ROOT, 'scene-catalog.json'), JSON.stringify(report, null, 2));
for (const row of report) {
    console.log(`${row.root}/${row.scene}: settings=${row.settings} sog=${row.sog} glb=${row.glb ? `adaptive ${row.glb.levels}lvl ${row.glb.files}f` : false}`);
}




