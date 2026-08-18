/* ============================================
   PDF Tools - JavaScript Application
   ============================================ */

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================
// Global State
// ============================================
const state = {
    split: {
        file: null,
        pdfDoc: null,
        totalPages: 0,
        selectedPages: new Set()
    },
    merge: {
        files: [],
        pdfDocs: []
    },
    convert: {
        file: null,
        pdfDoc: null,
        totalPages: 0
    }
};

// ============================================
// DOM Elements
// ============================================
const elements = {
    // Tabs
    tabs: document.querySelectorAll('.tab'),
    sections: document.querySelectorAll('.section'),

    // Split
    splitUpload: document.getElementById('split-upload'),
    splitFileInput: document.getElementById('split-file-input'),
    splitFileInfo: document.getElementById('split-file-info'),
    splitFileName: document.getElementById('split-file-name'),
    splitFilePages: document.getElementById('split-file-pages'),
    splitRemoveFile: document.getElementById('split-remove-file'),
    splitPageSelector: document.getElementById('split-page-selector'),
    splitPagesInput: document.getElementById('split-pages-input'),
    splitPreviewGrid: document.getElementById('split-preview-grid'),
    splitActions: document.getElementById('split-actions'),
    splitBtn: document.getElementById('split-btn'),
    splitToImagesBtn: document.getElementById('split-to-images-btn'),

    // Merge
    mergeUpload: document.getElementById('merge-upload'),
    mergeFileInput: document.getElementById('merge-file-input'),
    mergeFilesList: document.getElementById('merge-files-list'),
    mergeSortable: document.getElementById('merge-sortable'),
    mergeTotalPages: document.getElementById('merge-total-pages'),
    mergeBtn: document.getElementById('merge-btn'),

    // Convert
    convertUpload: document.getElementById('convert-upload'),
    convertFileInput: document.getElementById('convert-file-input'),
    convertFileInfo: document.getElementById('convert-file-info'),
    convertFileName: document.getElementById('convert-file-name'),
    convertFilePages: document.getElementById('convert-file-pages'),
    convertRemoveFile: document.getElementById('convert-remove-file'),
    convertOptions: document.getElementById('convert-options'),
    convertPagesInput: document.getElementById('convert-pages-input'),
    qualitySlider: document.getElementById('quality-slider'),
    qualityLabel: document.getElementById('quality-label'),
    convertBtn: document.getElementById('convert-btn'),

    // Progress
    progressOverlay: document.getElementById('progress-overlay'),
    progressText: document.getElementById('progress-text'),
    progressFill: document.getElementById('progress-fill'),
    progressBar: document.querySelector('.progress-bar'),
    progressCancel: document.getElementById('progress-cancel'),
    appStatus: document.getElementById('app-status'),

    // Upload feedback
    splitUploadFeedback: document.getElementById('split-upload-feedback'),
    mergeUploadFeedback: document.getElementById('merge-upload-feedback'),
    convertUploadFeedback: document.getElementById('convert-upload-feedback')
};

// ============================================
// Accessible UI feedback and progress state
// ============================================
const uploadElements = {
    split: { area: elements.splitUpload, feedback: elements.splitUploadFeedback },
    merge: { area: elements.mergeUpload, feedback: elements.mergeUploadFeedback },
    convert: { area: elements.convertUpload, feedback: elements.convertUploadFeedback }
};

const uploadStateMessages = {
    idle: 'Sẵn sàng chọn file PDF.',
    loading: 'Đang đọc file PDF.',
    ready: 'File PDF đã sẵn sàng.',
    processing: 'Đang xử lý file PDF.',
    success: 'Đã hoàn tất và tải file xuống.',
    error: 'Không thể hoàn tất thao tác.',
    cancelled: 'Đã hủy thao tác.'
};

let activeOperation = null;
let lastFocusedElement = null;

class OperationCancelledError extends Error {
    constructor() {
        super('Operation cancelled');
        this.name = 'OperationCancelledError';
    }
}

function setUploadState(tool, status, message = uploadStateMessages[status]) {
    const target = uploadElements[tool];
    if (!target) return;

    target.area.dataset.state = status;
    target.area.setAttribute('aria-busy', ['loading', 'processing'].includes(status) ? 'true' : 'false');
    target.feedback.dataset.state = status;
    target.feedback.textContent = message;
    elements.appStatus.textContent = message;
}

function showProgress(text = 'Đang xử lý...', percent = 0, cancellable = true) {
    lastFocusedElement = document.activeElement;
    elements.progressOverlay.classList.remove('hidden');
    elements.progressOverlay.setAttribute('aria-hidden', 'false');
    elements.progressText.textContent = text;
    elements.progressFill.style.width = `${percent}%`;
    elements.progressBar.setAttribute('aria-valuenow', String(Math.round(percent)));
    elements.progressCancel.disabled = !cancellable;
    elements.progressCancel.textContent = cancellable ? 'Hủy xử lý' : 'Đang hoàn tất...';
    requestAnimationFrame(() => elements.progressCancel.focus());
}

function updateProgress(operation, text, percent = 0, cancellable = true) {
    if (operation !== activeOperation) return;
    elements.progressText.textContent = text;
    elements.progressFill.style.width = `${percent}%`;
    elements.progressBar.setAttribute('aria-valuenow', String(Math.round(percent)));
    elements.progressCancel.disabled = !cancellable || operation.cancelled;
    if (operation.cancelled) elements.progressCancel.textContent = 'Đang hủy...';
}

function hideProgress() {
    elements.progressOverlay.classList.add('hidden');
    elements.progressOverlay.setAttribute('aria-hidden', 'true');
    if (lastFocusedElement instanceof HTMLElement && document.contains(lastFocusedElement)) {
        lastFocusedElement.focus();
    }
    lastFocusedElement = null;
}

function startOperation(tool, text, percent = 0, status = 'processing') {
    const operation = { tool, cancelled: false };
    activeOperation = operation;
    setUploadState(tool, status, text);
    showProgress(text, percent, true);
    return operation;
}

function assertOperationActive(operation) {
    if (operation.cancelled || activeOperation !== operation) {
        throw new OperationCancelledError();
    }
}

function finishOperation(operation, status, message) {
    if (activeOperation === operation) {
        activeOperation = null;
        hideProgress();
    }
    setUploadState(operation.tool, status, message);
}

function handleOperationError(operation, error, message) {
    if (error instanceof OperationCancelledError) {
        finishOperation(operation, 'cancelled', 'Đã hủy thao tác. File của bạn không được tải lên máy chủ.');
        return;
    }

    console.error(message, error);
    finishOperation(operation, 'error', message);
}

elements.progressCancel.addEventListener('click', () => {
    if (!activeOperation || elements.progressCancel.disabled) return;
    activeOperation.cancelled = true;
    elements.progressCancel.disabled = true;
    elements.progressCancel.textContent = 'Đang hủy...';
    elements.progressText.textContent = 'Đang dừng sau bước hiện tại...';
    elements.appStatus.textContent = 'Đang hủy thao tác.';
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && activeOperation) {
        event.preventDefault();
        elements.progressCancel.focus();
        return;
    }

    if (event.key === 'Escape' && activeOperation && !elements.progressCancel.disabled) {
        event.preventDefault();
        elements.progressCancel.click();
    }
});

// ============================================
// Tab Navigation
// ============================================
function selectTab(tab) {
    const targetTab = tab.dataset.tab;

    elements.tabs.forEach(t => {
        const selected = t === tab;
        t.classList.toggle('active', selected);
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
    });

    elements.sections.forEach(s => s.classList.remove('active'));
    document.getElementById(`${targetTab}-section`).classList.add('active');
}

elements.tabs.forEach((tab, index) => {
    tab.id = `${tab.dataset.tab}-tab`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `${tab.dataset.tab}-section`);
    tab.setAttribute('aria-selected', String(tab.classList.contains('active')));
    tab.tabIndex = tab.classList.contains('active') ? 0 : -1;

    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
        const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = elements.tabs.length - 1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % elements.tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + elements.tabs.length) % elements.tabs.length;
        elements.tabs[nextIndex].focus();
        selectTab(elements.tabs[nextIndex]);
    });
});

document.querySelector('.tabs').setAttribute('role', 'tablist');
elements.sections.forEach(section => {
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', `${section.id.replace('-section', '')}-tab`);
});

// ============================================
// Utility Functions
// ============================================

function parsePageRanges(input, maxPage) {
    const pages = new Set();
    const parts = input.split(',').map(p => p.trim()).filter(p => p);

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.max(1, start); i <= Math.min(maxPage, end); i++) {
                    pages.add(i);
                }
            }
        } else {
            const page = parseInt(part);
            if (!isNaN(page) && page >= 1 && page <= maxPage) {
                pages.add(page);
            }
        }
    }

    return Array.from(pages).sort((a, b) => a - b);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function isPdfFile(file) {
    return file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
}

async function loadPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await pdfjsLib.getDocument(arrayBuffer).promise;
}

// ============================================
// Drag & Drop Handlers
// ============================================
function setupUploadTrigger(uploadArea, fileInput) {
    uploadArea.addEventListener('click', (event) => {
        if (event.target.closest('label, input, button')) return;
        fileInput.click();
    });

    uploadArea.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        fileInput.click();
    });
}

function setupDragDrop(uploadArea, handleFiles, tool) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.remove('dragover');
        });
    });

    uploadArea.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(isPdfFile);
        if (files.length > 0) {
            handleFiles(files);
        } else {
            setUploadState(tool, 'error', 'Chỉ hỗ trợ file PDF. Vui lòng chọn lại file hợp lệ.');
        }
    });
}

// ============================================
// SPLIT PDF Functions
// ============================================
async function handleSplitFile(files) {
    const file = files[0];
    if (!file) return;
    if (!isPdfFile(file)) {
        setUploadState('split', 'error', 'Chỉ hỗ trợ file PDF. Vui lòng chọn lại file hợp lệ.');
        return;
    }

    const operation = startOperation('split', 'Đang đọc PDF...', 0, 'loading');

    try {
        const pdfDoc = await loadPDF(file);
        assertOperationActive(operation);

        state.split.file = file;
        state.split.pdfDoc = pdfDoc;
        state.split.totalPages = state.split.pdfDoc.numPages;
        state.split.selectedPages = new Set();

        // Select all pages by default
        for (let i = 1; i <= state.split.totalPages; i++) {
            state.split.selectedPages.add(i);
        }

        // Update UI
        elements.splitFileName.textContent = file.name;
        elements.splitFileName.title = file.name;
        elements.splitFilePages.textContent = `${state.split.totalPages} trang • ${formatFileSize(file.size)}`;
        elements.splitFileInfo.classList.remove('hidden');
        elements.splitPageSelector.classList.remove('hidden');
        elements.splitActions.classList.remove('hidden');
        elements.splitUpload.classList.add('hidden');

        // Set default input
        elements.splitPagesInput.value = `1-${state.split.totalPages}`;

        // Render page thumbnails
        await renderSplitPreviews(operation);
        assertOperationActive(operation);

        finishOperation(operation, 'ready', 'PDF đã sẵn sàng. Chọn các trang bạn muốn giữ lại.');
    } catch (error) {
        handleOperationError(operation, error, 'Lỗi: Không thể đọc file PDF này.');
    }
}

async function renderSplitPreviews(operation) {
    elements.splitPreviewGrid.innerHTML = '';

    for (let pageNum = 1; pageNum <= state.split.totalPages; pageNum++) {
        assertOperationActive(operation);
        const thumbnail = document.createElement('div');
        thumbnail.className = 'page-thumbnail';
        thumbnail.dataset.page = pageNum;
        thumbnail.setAttribute('role', 'button');
        thumbnail.tabIndex = 0;
        thumbnail.setAttribute('aria-label', `Chọn trang ${pageNum}`);
        thumbnail.setAttribute('aria-pressed', String(state.split.selectedPages.has(pageNum)));

        if (state.split.selectedPages.has(pageNum)) {
            thumbnail.classList.add('selected');
        }

        thumbnail.innerHTML = `
            <canvas></canvas>
            <span class="page-number">Trang ${pageNum}</span>
            <span class="check-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </span>
        `;

        // Click to toggle selection
        thumbnail.addEventListener('click', () => {
            togglePageSelection(pageNum);
        });
        thumbnail.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            togglePageSelection(pageNum);
        });

        elements.splitPreviewGrid.appendChild(thumbnail);

        // A render already in progress cannot be interrupted, so cancellation is observed before and after it.
        await renderPageThumbnail(pageNum, thumbnail.querySelector('canvas'), operation);
        assertOperationActive(operation);
    }
}

async function renderPageThumbnail(pageNum, canvas, operation) {
    try {
        assertOperationActive(operation);
        const page = await state.split.pdfDoc.getPage(pageNum);
        assertOperationActive(operation);
        const viewport = page.getViewport({ scale: 0.3 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        assertOperationActive(operation);
    } catch (error) {
        if (error instanceof OperationCancelledError) throw error;
        console.error(`Error rendering page ${pageNum}:`, error);
    }
}

function togglePageSelection(pageNum) {
    const thumbnail = elements.splitPreviewGrid.querySelector(`[data-page="${pageNum}"]`);

    if (state.split.selectedPages.has(pageNum)) {
        state.split.selectedPages.delete(pageNum);
        thumbnail.classList.remove('selected');
    } else {
        state.split.selectedPages.add(pageNum);
        thumbnail.classList.add('selected');
    }
    thumbnail.setAttribute('aria-pressed', String(state.split.selectedPages.has(pageNum)));

    // Update input field to match selection
    updatePagesInputFromSelection();
}

function updatePagesInputFromSelection() {
    const pages = Array.from(state.split.selectedPages).sort((a, b) => a - b);

    if (pages.length === 0) {
        elements.splitPagesInput.value = '';
        return;
    }

    // Convert to ranges
    const ranges = [];
    let start = pages[0];
    let end = pages[0];

    for (let i = 1; i < pages.length; i++) {
        if (pages[i] === end + 1) {
            end = pages[i];
        } else {
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = pages[i];
            end = pages[i];
        }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);

    elements.splitPagesInput.value = ranges.join(', ');
}

function updateSelectionFromInput() {
    const pages = parsePageRanges(elements.splitPagesInput.value, state.split.totalPages);
    state.split.selectedPages = new Set(pages);

    // Update thumbnails
    const thumbnails = elements.splitPreviewGrid.querySelectorAll('.page-thumbnail');
    thumbnails.forEach(thumb => {
        const pageNum = parseInt(thumb.dataset.page);
        if (state.split.selectedPages.has(pageNum)) {
            thumb.classList.add('selected');
        } else {
            thumb.classList.remove('selected');
        }
        thumb.setAttribute('aria-pressed', String(state.split.selectedPages.has(pageNum)));
    });
}

function resetSplit() {
    state.split = { file: null, pdfDoc: null, totalPages: 0, selectedPages: new Set() };
    elements.splitFileInfo.classList.add('hidden');
    elements.splitPageSelector.classList.add('hidden');
    elements.splitActions.classList.add('hidden');
    elements.splitUpload.classList.remove('hidden');
    elements.splitPagesInput.value = '';
    elements.splitPreviewGrid.innerHTML = '';
    elements.splitFileInput.value = '';
    setUploadState('split', 'idle', 'Sẵn sàng chọn một file PDF để cắt.');
}

async function splitPDF() {
    const pages = Array.from(state.split.selectedPages).sort((a, b) => a - b);

    if (pages.length === 0) {
        alert('Vui lòng chọn ít nhất một trang.');
        return;
    }

    const operation = startOperation('split', 'Đang cắt PDF...', 0);

    try {

        const srcPdfBytes = await state.split.file.arrayBuffer();
        const srcPdf = await PDFLib.PDFDocument.load(srcPdfBytes);
        const newPdf = await PDFLib.PDFDocument.create();

        for (let i = 0; i < pages.length; i++) {
            assertOperationActive(operation);
            const [copiedPage] = await newPdf.copyPages(srcPdf, [pages[i] - 1]);
            assertOperationActive(operation);
            newPdf.addPage(copiedPage);
            updateProgress(operation, `Đang xử lý trang ${i + 1}/${pages.length}...`, ((i + 1) / pages.length) * 100);
        }

        const pdfBytes = await newPdf.save();
        assertOperationActive(operation);
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });

        const fileName = state.split.file.name.replace('.pdf', '') + '_split.pdf';
        saveAs(blob, fileName);

        finishOperation(operation, 'success', 'Đã cắt PDF và bắt đầu tải file xuống.');
    } catch (error) {
        handleOperationError(operation, error, 'Lỗi: Không thể cắt file PDF.');
    }
}

async function splitToImages() {
    const pages = Array.from(state.split.selectedPages).sort((a, b) => a - b);

    if (pages.length === 0) {
        alert('Vui lòng chọn ít nhất một trang.');
        return;
    }

    const operation = startOperation('split', 'Đang chuyển đổi...', 0);

    try {

        const zip = new JSZip();
        const scale = 150 / 72; // 150 DPI

        for (let i = 0; i < pages.length; i++) {
            assertOperationActive(operation);
            const pageNum = pages[i];
            const page = await state.split.pdfDoc.getPage(pageNum);
            assertOperationActive(operation);
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            assertOperationActive(operation);

            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/png');
            });

            const fileName = `page_${String(pageNum).padStart(3, '0')}.png`;
            zip.file(fileName, blob);

            updateProgress(operation, `Đang xử lý trang ${i + 1}/${pages.length}...`, ((i + 1) / pages.length) * 100);
        }

        updateProgress(operation, 'Đang tạo file ZIP...', 100);
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        assertOperationActive(operation);
        const zipName = state.split.file.name.replace('.pdf', '') + '_images.zip';
        saveAs(zipBlob, zipName);

        finishOperation(operation, 'success', 'Đã chuyển các trang thành ảnh và bắt đầu tải ZIP xuống.');
    } catch (error) {
        handleOperationError(operation, error, 'Lỗi: Không thể chuyển đổi sang ảnh.');
    }
}

// Split event listeners
setupUploadTrigger(elements.splitUpload, elements.splitFileInput);
setupDragDrop(elements.splitUpload, handleSplitFile, 'split');
elements.splitFileInput.addEventListener('change', (e) => handleSplitFile(Array.from(e.target.files)));
elements.splitRemoveFile.addEventListener('click', resetSplit);
elements.splitPagesInput.addEventListener('input', updateSelectionFromInput);
elements.splitBtn.addEventListener('click', splitPDF);
elements.splitToImagesBtn.addEventListener('click', splitToImages);

// ============================================
// MERGE PDF Functions
// ============================================
async function handleMergeFiles(files) {
    const pdfFiles = files.filter(isPdfFile);
    if (pdfFiles.length === 0) {
        setUploadState('merge', 'error', 'Chỉ hỗ trợ file PDF. Vui lòng chọn lại file hợp lệ.');
        return;
    }

    const operation = startOperation('merge', 'Đang đọc PDF...', 0, 'loading');
    const loadedFiles = [];
    const loadedDocs = [];
    let failedFiles = 0;

    try {
        for (let index = 0; index < pdfFiles.length; index++) {
            assertOperationActive(operation);
            const file = pdfFiles[index];
            try {
                const pdfDoc = await loadPDF(file);
                assertOperationActive(operation);
                loadedFiles.push({
                    file,
                    numPages: pdfDoc.numPages,
                    id: Date.now() + Math.random()
                });
                loadedDocs.push(pdfDoc);
            } catch (error) {
                if (error instanceof OperationCancelledError) throw error;
                failedFiles++;
                console.error(`Error loading ${file.name}:`, error);
            }
            updateProgress(operation, `Đang đọc file ${index + 1}/${pdfFiles.length}...`, ((index + 1) / pdfFiles.length) * 100);
        }

        if (loadedFiles.length === 0) {
            throw new Error('No readable PDFs');
        }

        state.merge.files.push(...loadedFiles);
        state.merge.pdfDocs.push(...loadedDocs);
        updateMergeList();
        const message = failedFiles > 0
            ? `Đã sẵn sàng ${loadedFiles.length} file. ${failedFiles} file không thể đọc đã được bỏ qua.`
            : `Đã sẵn sàng ${loadedFiles.length} file PDF để hợp nhất.`;
        finishOperation(operation, 'ready', message);
    } catch (error) {
        handleOperationError(operation, error, 'Lỗi: Không thể đọc các file PDF đã chọn.');
    }
}

function updateMergeList() {
    if (state.merge.files.length === 0) {
        elements.mergeFilesList.classList.add('hidden');
        elements.mergeBtn.classList.add('hidden');
        elements.mergeUpload.classList.remove('hidden');
        return;
    }

    elements.mergeUpload.classList.add('hidden');
    elements.mergeFilesList.classList.remove('hidden');
    elements.mergeBtn.classList.remove('hidden');

    elements.mergeSortable.replaceChildren();
    state.merge.files.forEach((item, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'sortable-item';
        listItem.dataset.id = item.id;
        listItem.draggable = true;

        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        dragHandle.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 3; i++) dragHandle.appendChild(document.createElement('span'));

        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info-inline';
        const fileName = document.createElement('span');
        fileName.className = 'file-name';
        fileName.textContent = item.file.name;
        fileName.title = item.file.name;
        const filePages = document.createElement('span');
        filePages.className = 'file-pages';
        filePages.textContent = `${item.numPages} trang`;
        fileInfo.append(fileName, filePages);

        const removeButton = document.createElement('button');
        removeButton.className = 'btn-remove';
        removeButton.type = 'button';
        removeButton.textContent = '×';
        removeButton.setAttribute('aria-label', `Xóa ${item.file.name} khỏi danh sách hợp nhất`);
        removeButton.addEventListener('click', () => removeMergeFile(index));

        listItem.append(dragHandle, fileInfo, removeButton);
        elements.mergeSortable.appendChild(listItem);
    });

    // Update total pages
    const totalPages = state.merge.files.reduce((sum, item) => sum + item.numPages, 0);
    elements.mergeTotalPages.textContent = totalPages;

    // Setup drag and drop for sorting
    setupSortable();
}

function setupSortable() {
    const items = elements.mergeSortable.querySelectorAll('.sortable-item');
    let draggedItem = null;

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedItem = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (draggedItem && draggedItem !== item) {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    item.parentNode.insertBefore(draggedItem, item);
                } else {
                    item.parentNode.insertBefore(draggedItem, item.nextSibling);
                }
                updateMergeOrder();
            }
        });
    });
}

function updateMergeOrder() {
    const items = elements.mergeSortable.querySelectorAll('.sortable-item');
    const newFiles = [];
    const newDocs = [];

    items.forEach(item => {
        const id = parseFloat(item.dataset.id);
        const index = state.merge.files.findIndex(f => f.id === id);
        if (index !== -1) {
            newFiles.push(state.merge.files[index]);
            newDocs.push(state.merge.pdfDocs[index]);
        }
    });

    state.merge.files = newFiles;
    state.merge.pdfDocs = newDocs;
}

function removeMergeFile(index) {
    state.merge.files.splice(index, 1);
    state.merge.pdfDocs.splice(index, 1);
    updateMergeList();
    setUploadState('merge', state.merge.files.length ? 'ready' : 'idle', state.merge.files.length
        ? 'Danh sách file PDF đã được cập nhật.'
        : 'Sẵn sàng chọn các file PDF để hợp nhất.');
}

async function mergePDFs() {
    if (state.merge.files.length < 2) {
        alert('Vui lòng chọn ít nhất 2 file PDF để hợp nhất.');
        return;
    }

    const operation = startOperation('merge', 'Đang hợp nhất PDF...', 0);

    try {

        const mergedPdf = await PDFLib.PDFDocument.create();

        for (let i = 0; i < state.merge.files.length; i++) {
            assertOperationActive(operation);
            const file = state.merge.files[i].file;
            const pdfBytes = await file.arrayBuffer();
            assertOperationActive(operation);
            const pdf = await PDFLib.PDFDocument.load(pdfBytes);
            assertOperationActive(operation);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            assertOperationActive(operation);
            copiedPages.forEach(page => mergedPdf.addPage(page));
            updateProgress(operation, `Đang xử lý file ${i + 1}/${state.merge.files.length}...`, ((i + 1) / state.merge.files.length) * 100);
        }

        const pdfBytes = await mergedPdf.save();
        assertOperationActive(operation);
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        saveAs(blob, 'merged.pdf');

        finishOperation(operation, 'success', 'Đã hợp nhất PDF và bắt đầu tải file xuống.');
    } catch (error) {
        handleOperationError(operation, error, 'Lỗi: Không thể hợp nhất file PDF.');
    }
}

// Merge event listeners
setupUploadTrigger(elements.mergeUpload, elements.mergeFileInput);
setupDragDrop(elements.mergeUpload, handleMergeFiles, 'merge');
elements.mergeFileInput.addEventListener('change', (e) => handleMergeFiles(Array.from(e.target.files)));
elements.mergeBtn.addEventListener('click', mergePDFs);

// ============================================
// CONVERT TO IMAGE Functions
// ============================================
async function handleConvertFile(files) {
    const file = files[0];
    if (!file) return;
    if (!isPdfFile(file)) {
        setUploadState('convert', 'error', 'Chỉ hỗ trợ file PDF. Vui lòng chọn lại file hợp lệ.');
        return;
    }

    const operation = startOperation('convert', 'Đang đọc PDF...', 0, 'loading');

    try {
        const pdfDoc = await loadPDF(file);
        assertOperationActive(operation);

        state.convert.file = file;
        state.convert.pdfDoc = pdfDoc;
        state.convert.totalPages = state.convert.pdfDoc.numPages;

        // Update UI
        elements.convertFileName.textContent = file.name;
        elements.convertFileName.title = file.name;
        elements.convertFilePages.textContent = `${state.convert.totalPages} trang • ${formatFileSize(file.size)}`;
        elements.convertFileInfo.classList.remove('hidden');
        elements.convertOptions.classList.remove('hidden');
        elements.convertBtn.classList.remove('hidden');
        elements.convertUpload.classList.add('hidden');

        finishOperation(operation, 'ready', 'PDF đã sẵn sàng. Chọn tùy chọn xuất ảnh.');
    } catch (error) {
        handleOperationError(operation, error, 'Lỗi: Không thể đọc file PDF này.');
    }
}

function resetConvert() {
    state.convert = { file: null, pdfDoc: null, totalPages: 0 };
    elements.convertFileInfo.classList.add('hidden');
    elements.convertOptions.classList.add('hidden');
    elements.convertBtn.classList.add('hidden');
    elements.convertUpload.classList.remove('hidden');
    elements.convertFileInput.value = '';
    setUploadState('convert', 'idle', 'Sẵn sàng chọn một file PDF để chuyển đổi.');
}

async function convertToImages() {
    const format = document.querySelector('input[name="format"]:checked').value;
    const pagesOption = document.querySelector('input[name="pages"]:checked').value;
    const quality = parseInt(elements.qualitySlider.value);

    // DPI settings
    const dpiMap = { 1: 72, 2: 150, 3: 300 };
    const scale = dpiMap[quality] / 72;

    // Get pages to convert
    let pagesToConvert;
    if (pagesOption === 'all') {
        pagesToConvert = Array.from({ length: state.convert.totalPages }, (_, i) => i + 1);
    } else {
        pagesToConvert = parsePageRanges(elements.convertPagesInput.value, state.convert.totalPages);
        if (pagesToConvert.length === 0) {
            alert('Vui lòng chọn ít nhất một trang.');
            return;
        }
    }

    const operation = startOperation('convert', 'Đang chuyển đổi...', 0);

    try {

        const zip = new JSZip();
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';

        for (let i = 0; i < pagesToConvert.length; i++) {
            assertOperationActive(operation);
            const pageNum = pagesToConvert[i];
            const page = await state.convert.pdfDoc.getPage(pageNum);
            assertOperationActive(operation);
            const viewport = page.getViewport({ scale });

            // Create canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render page
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            assertOperationActive(operation);

            // Convert to blob
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, mimeType, format === 'jpeg' ? 0.9 : undefined);
            });

            // Add to zip
            const fileName = `page_${String(pageNum).padStart(3, '0')}.${format}`;
            zip.file(fileName, blob);

            updateProgress(operation, `Đang xử lý trang ${i + 1}/${pagesToConvert.length}...`, ((i + 1) / pagesToConvert.length) * 100);
        }

        // Generate zip
        updateProgress(operation, 'Đang tạo file ZIP...', 100);
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        assertOperationActive(operation);
        const zipName = state.convert.file.name.replace('.pdf', '') + '_images.zip';
        saveAs(zipBlob, zipName);

        finishOperation(operation, 'success', 'Đã chuyển PDF thành ảnh và bắt đầu tải ZIP xuống.');
    } catch (error) {
        handleOperationError(operation, error, 'Lỗi: Không thể chuyển đổi PDF sang ảnh.');
    }
}

// Convert event listeners
setupUploadTrigger(elements.convertUpload, elements.convertFileInput);
setupDragDrop(elements.convertUpload, handleConvertFile, 'convert');
elements.convertFileInput.addEventListener('change', (e) => handleConvertFile(Array.from(e.target.files)));
elements.convertRemoveFile.addEventListener('click', resetConvert);
elements.convertBtn.addEventListener('click', convertToImages);

// Quality slider
elements.qualitySlider.addEventListener('input', () => {
    const labels = {
        1: 'Thấp (72 DPI)',
        2: 'Vừa (150 DPI)',
        3: 'Cao (300 DPI)'
    };
    elements.qualityLabel.textContent = labels[elements.qualitySlider.value];
});

// Custom pages toggle
document.querySelectorAll('input[name="pages"]').forEach(radio => {
    radio.addEventListener('change', () => {
        elements.convertPagesInput.classList.toggle('hidden', radio.value !== 'custom' || !radio.checked);
    });
});

// ============================================
// Initialize
// ============================================
console.log('PDF Tools loaded successfully!');
