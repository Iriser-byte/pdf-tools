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
    progressFill: document.getElementById('progress-fill')
};

// ============================================
// Tab Navigation
// ============================================
elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        // Update tabs
        elements.tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update sections
        elements.sections.forEach(s => s.classList.remove('active'));
        document.getElementById(`${targetTab}-section`).classList.add('active');
    });
});

// ============================================
// Utility Functions
// ============================================
function showProgress(text = 'Đang xử lý...', percent = 0) {
    elements.progressOverlay.classList.remove('hidden');
    elements.progressText.textContent = text;
    elements.progressFill.style.width = `${percent}%`;
}

function hideProgress() {
    elements.progressOverlay.classList.add('hidden');
}

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

async function loadPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await pdfjsLib.getDocument(arrayBuffer).promise;
}

// ============================================
// Drag & Drop Handlers
// ============================================
function setupDragDrop(uploadArea, handleFiles) {
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
        const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
        if (files.length > 0) {
            handleFiles(files);
        }
    });
}

// ============================================
// SPLIT PDF Functions
// ============================================
async function handleSplitFile(files) {
    const file = files[0];
    if (!file) return;

    try {
        showProgress('Đang đọc PDF...');

        state.split.file = file;
        state.split.pdfDoc = await loadPDF(file);
        state.split.totalPages = state.split.pdfDoc.numPages;
        state.split.selectedPages = new Set();

        // Select all pages by default
        for (let i = 1; i <= state.split.totalPages; i++) {
            state.split.selectedPages.add(i);
        }

        // Update UI
        elements.splitFileName.textContent = file.name;
        elements.splitFilePages.textContent = `${state.split.totalPages} trang • ${formatFileSize(file.size)}`;
        elements.splitFileInfo.classList.remove('hidden');
        elements.splitPageSelector.classList.remove('hidden');
        elements.splitActions.classList.remove('hidden');
        elements.splitUpload.classList.add('hidden');

        // Set default input
        elements.splitPagesInput.value = `1-${state.split.totalPages}`;

        // Render page thumbnails
        await renderSplitPreviews();

        hideProgress();
    } catch (error) {
        console.error('Error loading PDF:', error);
        hideProgress();
        alert('Lỗi: Không thể đọc file PDF này.');
    }
}

async function renderSplitPreviews() {
    elements.splitPreviewGrid.innerHTML = '';

    for (let pageNum = 1; pageNum <= state.split.totalPages; pageNum++) {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'page-thumbnail';
        thumbnail.dataset.page = pageNum;

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

        elements.splitPreviewGrid.appendChild(thumbnail);

        // Render thumbnail
        renderPageThumbnail(pageNum, thumbnail.querySelector('canvas'));
    }
}

async function renderPageThumbnail(pageNum, canvas) {
    try {
        const page = await state.split.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.3 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
    } catch (error) {
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
}

async function splitPDF() {
    const pages = Array.from(state.split.selectedPages).sort((a, b) => a - b);

    if (pages.length === 0) {
        alert('Vui lòng chọn ít nhất một trang.');
        return;
    }

    try {
        showProgress('Đang cắt PDF...', 0);

        const srcPdfBytes = await state.split.file.arrayBuffer();
        const srcPdf = await PDFLib.PDFDocument.load(srcPdfBytes);
        const newPdf = await PDFLib.PDFDocument.create();

        for (let i = 0; i < pages.length; i++) {
            const [copiedPage] = await newPdf.copyPages(srcPdf, [pages[i] - 1]);
            newPdf.addPage(copiedPage);
            showProgress(`Đang xử lý trang ${i + 1}/${pages.length}...`, ((i + 1) / pages.length) * 100);
        }

        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });

        const fileName = state.split.file.name.replace('.pdf', '') + '_split.pdf';
        saveAs(blob, fileName);

        hideProgress();
    } catch (error) {
        console.error('Error splitting PDF:', error);
        hideProgress();
        alert('Lỗi: Không thể cắt file PDF.');
    }
}

async function splitToImages() {
    const pages = Array.from(state.split.selectedPages).sort((a, b) => a - b);

    if (pages.length === 0) {
        alert('Vui lòng chọn ít nhất một trang.');
        return;
    }

    try {
        showProgress('Đang chuyển đổi...', 0);

        const zip = new JSZip();
        const scale = 150 / 72; // 150 DPI

        for (let i = 0; i < pages.length; i++) {
            const pageNum = pages[i];
            const page = await state.split.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/png');
            });

            const fileName = `page_${String(pageNum).padStart(3, '0')}.png`;
            zip.file(fileName, blob);

            showProgress(`Đang xử lý trang ${i + 1}/${pages.length}...`, ((i + 1) / pages.length) * 100);
        }

        showProgress('Đang tạo file ZIP...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipName = state.split.file.name.replace('.pdf', '') + '_images.zip';
        saveAs(zipBlob, zipName);

        hideProgress();
    } catch (error) {
        console.error('Error converting to images:', error);
        hideProgress();
        alert('Lỗi: Không thể chuyển đổi sang ảnh.');
    }
}

// Split event listeners
setupDragDrop(elements.splitUpload, handleSplitFile);
elements.splitFileInput.addEventListener('change', (e) => handleSplitFile(Array.from(e.target.files)));
elements.splitRemoveFile.addEventListener('click', resetSplit);
elements.splitPagesInput.addEventListener('input', updateSelectionFromInput);
elements.splitBtn.addEventListener('click', splitPDF);
elements.splitToImagesBtn.addEventListener('click', splitToImages);

// ============================================
// MERGE PDF Functions
// ============================================
async function handleMergeFiles(files) {
    showProgress('Đang đọc PDF...');

    for (const file of files) {
        try {
            const pdfDoc = await loadPDF(file);
            state.merge.files.push({
                file,
                numPages: pdfDoc.numPages,
                id: Date.now() + Math.random()
            });
            state.merge.pdfDocs.push(pdfDoc);
        } catch (error) {
            console.error(`Error loading ${file.name}:`, error);
        }
    }

    updateMergeList();
    hideProgress();
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

    elements.mergeSortable.innerHTML = state.merge.files.map((item, index) => `
        <li class="sortable-item" data-id="${item.id}" draggable="true">
            <div class="drag-handle">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <div class="file-info-inline">
                <span class="file-name">${item.file.name}</span>
                <span class="file-pages">${item.numPages} trang</span>
            </div>
            <button class="btn-remove" onclick="removeMergeFile(${index})">×</button>
        </li>
    `).join('');

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

window.removeMergeFile = function (index) {
    state.merge.files.splice(index, 1);
    state.merge.pdfDocs.splice(index, 1);
    updateMergeList();
};

async function mergePDFs() {
    if (state.merge.files.length < 2) {
        alert('Vui lòng chọn ít nhất 2 file PDF để hợp nhất.');
        return;
    }

    try {
        showProgress('Đang hợp nhất PDF...', 0);

        const mergedPdf = await PDFLib.PDFDocument.create();

        for (let i = 0; i < state.merge.files.length; i++) {
            const file = state.merge.files[i].file;
            const pdfBytes = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach(page => mergedPdf.addPage(page));
            showProgress(`Đang xử lý file ${i + 1}/${state.merge.files.length}...`, ((i + 1) / state.merge.files.length) * 100);
        }

        const pdfBytes = await mergedPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        saveAs(blob, 'merged.pdf');

        hideProgress();
    } catch (error) {
        console.error('Error merging PDFs:', error);
        hideProgress();
        alert('Lỗi: Không thể hợp nhất file PDF.');
    }
}

// Merge event listeners
setupDragDrop(elements.mergeUpload, handleMergeFiles);
elements.mergeFileInput.addEventListener('change', (e) => handleMergeFiles(Array.from(e.target.files)));
elements.mergeBtn.addEventListener('click', mergePDFs);

// ============================================
// CONVERT TO IMAGE Functions
// ============================================
async function handleConvertFile(files) {
    const file = files[0];
    if (!file) return;

    try {
        showProgress('Đang đọc PDF...');

        state.convert.file = file;
        state.convert.pdfDoc = await loadPDF(file);
        state.convert.totalPages = state.convert.pdfDoc.numPages;

        // Update UI
        elements.convertFileName.textContent = file.name;
        elements.convertFilePages.textContent = `${state.convert.totalPages} trang • ${formatFileSize(file.size)}`;
        elements.convertFileInfo.classList.remove('hidden');
        elements.convertOptions.classList.remove('hidden');
        elements.convertBtn.classList.remove('hidden');
        elements.convertUpload.classList.add('hidden');

        hideProgress();
    } catch (error) {
        console.error('Error loading PDF:', error);
        hideProgress();
        alert('Lỗi: Không thể đọc file PDF này.');
    }
}

function resetConvert() {
    state.convert = { file: null, pdfDoc: null, totalPages: 0 };
    elements.convertFileInfo.classList.add('hidden');
    elements.convertOptions.classList.add('hidden');
    elements.convertBtn.classList.add('hidden');
    elements.convertUpload.classList.remove('hidden');
    elements.convertFileInput.value = '';
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

    try {
        showProgress('Đang chuyển đổi...', 0);

        const zip = new JSZip();
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';

        for (let i = 0; i < pagesToConvert.length; i++) {
            const pageNum = pagesToConvert[i];
            const page = await state.convert.pdfDoc.getPage(pageNum);
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

            // Convert to blob
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, mimeType, format === 'jpeg' ? 0.9 : undefined);
            });

            // Add to zip
            const fileName = `page_${String(pageNum).padStart(3, '0')}.${format}`;
            zip.file(fileName, blob);

            showProgress(`Đang xử lý trang ${i + 1}/${pagesToConvert.length}...`, ((i + 1) / pagesToConvert.length) * 100);
        }

        // Generate zip
        showProgress('Đang tạo file ZIP...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipName = state.convert.file.name.replace('.pdf', '') + '_images.zip';
        saveAs(zipBlob, zipName);

        hideProgress();
    } catch (error) {
        console.error('Error converting PDF:', error);
        hideProgress();
        alert('Lỗi: Không thể chuyển đổi PDF sang ảnh.');
    }
}

// Convert event listeners
setupDragDrop(elements.convertUpload, handleConvertFile);
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
