import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const script = await readFile(new URL('../page-organizer-core.js', import.meta.url), 'utf8');

function loadBrowserGlobal() {
    const context = vm.createContext({
        Uint8Array,
        console: { error() {}, log() {} }
    });

    vm.runInContext(script, context);
    return context.PageOrganizerCore;
}

function createPdfLibFake(originalRotations) {
    let targetDocument;
    let loadedBytes;

    class FakeSourcePage {
        constructor(angle) {
            this.angle = angle;
        }

        getRotation() {
            return { angle: this.angle };
        }
    }

    class FakeSourceDocument {
        constructor(angles) {
            this.pages = angles.map(angle => new FakeSourcePage(angle));
        }

        getPage(index) {
            return this.pages[index];
        }
    }

    class FakeCopiedPage {
        constructor(sourceIndex) {
            this.sourceIndex = sourceIndex;
            this.rotationAngle = null;
        }

        setRotation(rotation) {
            this.rotationAngle = rotation.angle;
        }
    }

    class FakeTargetDocument {
        constructor() {
            this.copiedIndices = [];
            this.pages = [];
        }

        async copyPages(sourceDocument, indices) {
            this.copiedIndices.push([...indices]);
            return indices.map(index => {
                assert.ok(sourceDocument.getPage(index));
                return new FakeCopiedPage(index);
            });
        }

        addPage(page) {
            this.pages.push(page);
        }

        async save() {
            const payload = JSON.stringify({
                order: this.pages.map(page => page.sourceIndex + 1),
                rotations: this.pages.map(page => page.rotationAngle)
            });
            return Uint8Array.from(Buffer.from(payload, 'utf8'));
        }
    }

    return {
        PDFDocument: {
            async load(bytes) {
                loadedBytes = bytes;
                return new FakeSourceDocument(originalRotations);
            },
            async create() {
                targetDocument = new FakeTargetDocument();
                return targetDocument;
            }
        },
        degrees(angle) {
            return { angle: ((angle % 360) + 360) % 360 };
        },
        getLoadedBytes() {
            return loadedBytes;
        },
        getTargetDocument() {
            return targetDocument;
        }
    };
}

test('exposes a stable browser global and CommonJS API', () => {
    const browserApi = loadBrowserGlobal();
    const commonJsApi = require('../page-organizer-core.js');

    assert.equal(typeof browserApi.createPageOrganizerCore, 'function');
    assert.equal(typeof commonJsApi.createPageOrganizerCore, 'function');
});

test('reorders pages deterministically by page id and target index', () => {
    const { createPageOrganizerCore } = require('../page-organizer-core.js');
    const core = createPageOrganizerCore(4);

    assert.equal(core.reorderPage('page-3', 0), true);
    assert.equal(core.reorderPage('page-4', 2), true);

    assert.deepEqual(
        core.getPages().map(page => page.originalIndex),
        [3, 1, 4, 2]
    );
    assert.deepEqual(
        core.getPages().map(page => page.rotation),
        [0, 0, 0, 0]
    );
});

test('rotates pages clockwise in 90 degree steps and wraps at 360', () => {
    const { createPageOrganizerCore } = require('../page-organizer-core.js');
    const core = createPageOrganizerCore(2);

    assert.equal(core.rotatePageClockwise('page-2'), true);
    assert.equal(core.rotatePageClockwise('page-2'), true);
    assert.equal(core.rotatePageClockwise('page-2'), true);
    assert.equal(core.rotatePageClockwise('page-2'), true);
    assert.equal(core.rotatePageClockwise('page-2'), true);

    assert.deepEqual(core.getPages(), [
        { id: 'page-1', originalIndex: 1, rotation: 0 },
        { id: 'page-2', originalIndex: 2, rotation: 90 }
    ]);
});

test('deletes pages without altering surviving page identity', () => {
    const { createPageOrganizerCore } = require('../page-organizer-core.js');
    const core = createPageOrganizerCore(4);

    assert.equal(core.deletePage('page-2'), true);
    assert.equal(core.deletePage('page-4'), true);

    assert.deepEqual(core.getPages(), [
        { id: 'page-1', originalIndex: 1, rotation: 0 },
        { id: 'page-3', originalIndex: 3, rotation: 0 }
    ]);
});

test('ignores invalid operations without corrupting state', () => {
    const { createPageOrganizerCore } = require('../page-organizer-core.js');
    const core = createPageOrganizerCore(3);

    core.rotatePageClockwise('page-2');
    const before = core.getPages();

    assert.equal(core.reorderPage('page-9', 0), false);
    assert.equal(core.reorderPage('page-2', -1), false);
    assert.equal(core.reorderPage('page-2', 3), false);
    assert.equal(core.reorderPage('page-2', 1.5), false);
    assert.equal(core.deletePage('page-9'), false);
    assert.equal(core.rotatePageClockwise('page-9'), false);

    assert.deepEqual(core.getPages(), before);
});

test('exports surviving pages in current order with combined rotations', async () => {
    const { createPageOrganizerCore } = require('../page-organizer-core.js');
    const pdfLib = createPdfLibFake([0, 90, 180, 270]);
    const sourceBytes = Uint8Array.from([1, 2, 3, 4]);
    const core = createPageOrganizerCore(4, { pdfLib });

    core.rotatePageClockwise('page-2');
    core.rotatePageClockwise('page-4');
    core.rotatePageClockwise('page-4');
    core.rotatePageClockwise('page-4');
    core.deletePage('page-3');
    core.reorderPage('page-4', 1);

    const exportedBytes = await core.exportPdf(sourceBytes);
    const exported = JSON.parse(Buffer.from(exportedBytes).toString('utf8'));

    assert.equal(pdfLib.getLoadedBytes(), sourceBytes);
    assert.deepEqual(pdfLib.getTargetDocument().copiedIndices, [[0, 3, 1]]);
    assert.deepEqual(exported.order, [1, 4, 2]);
    assert.deepEqual(exported.rotations, [0, 180, 180]);
});
