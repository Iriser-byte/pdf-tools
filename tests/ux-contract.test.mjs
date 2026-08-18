import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const [html, script, styles] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../style.css', import.meta.url), 'utf8')
]);

class MockElement {
    constructor() {
        this.attributes = new Map();
        this.children = [];
        this.classList = {
            values: new Set(),
            add: (...values) => values.forEach(value => this.classList.values.add(value)),
            remove: (...values) => values.forEach(value => this.classList.values.delete(value)),
            toggle: (value, force) => {
                const shouldAdd = force ?? !this.classList.values.has(value);
                if (shouldAdd) this.classList.values.add(value);
                else this.classList.values.delete(value);
                return shouldAdd;
            },
            contains: value => this.classList.values.has(value)
        };
        this.dataset = {};
        this.style = {};
        this.tabIndex = 0;
    }

    addEventListener() {}
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); return node; }
    focus() {}
    getContext() { return {}; }
    querySelector() { return new MockElement(); }
    querySelectorAll() { return []; }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function createAppHarness() {
    const elements = new Map();
    const alerts = [];
    const document = {
        activeElement: new MockElement(),
        addEventListener() {},
        contains: () => true,
        createElement: () => new MockElement(),
        getElementById: id => {
            if (!elements.has(id)) elements.set(id, new MockElement());
            return elements.get(id);
        },
        querySelector: selector => {
            if (!elements.has(selector)) elements.set(selector, new MockElement());
            return elements.get(selector);
        },
        querySelectorAll: () => []
    };
    const context = vm.createContext({
        Blob,
        HTMLElement: MockElement,
        JSZip: class {},
        PDFLib: {},
        Set,
        alert: message => alerts.push(message),
        console: { error() {}, log() {} },
        document,
        pdfjsLib: { GlobalWorkerOptions: {} },
        requestAnimationFrame: callback => callback(),
        saveAs() {}
    });

    vm.runInContext(script, context);
    return { alerts, context };
}

test('exposes semantic upload feedback for every tool state', () => {
    for (const state of ['idle', 'loading', 'ready', 'processing', 'success', 'error', 'cancelled']) {
        assert.match(script, new RegExp(`\\b${state}:`));
    }

    for (const tool of ['split', 'merge', 'convert']) {
        assert.match(html, new RegExp(`id="${tool}-upload-feedback"`));
        assert.match(html, new RegExp(`id="${tool}-upload"[^>]*role="button"`));
    }
});

test('keeps progress cancellable and announced as a dialog', () => {
    assert.match(html, /role="dialog"/);
    assert.match(html, /role="progressbar"/);
    assert.match(html, /id="progress-cancel"/);
    assert.match(script, /class OperationCancelledError/);
    assert.match(script, /event\.key === 'Escape'/);
});

test('cancels split thumbnail generation before the upload can become ready', async () => {
    const { context } = createAppHarness();
    context.pdfjsLib.getDocument = () => ({
        promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
                getViewport: () => ({ width: 1, height: 1 }),
                render: () => ({
                    promise: Promise.resolve().then(() => vm.runInContext('activeOperation.cancelled = true;', context))
                })
            })
        })
    });

    const task = vm.runInContext(`
        handleSplitFile([{
            name: 'cancelled.pdf',
            type: 'application/pdf',
            size: 1,
            arrayBuffer: async () => new ArrayBuffer(0)
        }]);
    `, context);
    await task;

    const feedbackState = vm.runInContext('elements.splitUploadFeedback.dataset.state;', context);
    assert.equal(feedbackState, 'cancelled');
});

test('reports operation errors inline without a blocking alert and restores the UI', () => {
    const { alerts, context } = createAppHarness();
    const result = vm.runInContext(`
        const operation = { tool: 'split', cancelled: false };
        activeOperation = operation;
        showProgress('Đang kiểm tra...', 25);
        handleOperationError(operation, new Error('test'), 'Lỗi kiểm tra nội tuyến.');
        ({
            feedbackState: elements.splitUploadFeedback.dataset.state,
            isBusy: elements.splitUpload.getAttribute('aria-busy'),
            overlayHidden: elements.progressOverlay.classList.contains('hidden')
        });
    `, context);

    assert.deepEqual(alerts, []);
    assert.equal(result.feedbackState, 'error');
    assert.equal(result.isBusy, 'false');
    assert.equal(result.overlayHidden, true);
});

test('protects file names from HTML interpolation and supports narrow screens', () => {
    assert.match(script, /fileName\.textContent = item\.file\.name/);
    assert.doesNotMatch(script, /mergeSortable\.innerHTML = state\.merge\.files/);
    assert.match(styles, /text-overflow: ellipsis/);
    assert.match(styles, /max-width: 480px/);
});
