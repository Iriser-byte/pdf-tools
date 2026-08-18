(function (root, factory) {
    const api = factory(root);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    root.PageOrganizerCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    const ROTATION_STEP = 90;

    function normalizeRotation(angle) {
        return ((angle % 360) + 360) % 360;
    }

    function clonePage(page) {
        return {
            id: page.id,
            originalIndex: page.originalIndex,
            rotation: page.rotation
        };
    }

    function findPageIndex(pages, pageId) {
        return pages.findIndex(page => page.id === pageId);
    }

    function isValidTargetIndex(targetIndex, length) {
        return Number.isInteger(targetIndex) && targetIndex >= 0 && targetIndex < length;
    }

    function readRotationAngle(page) {
        if (!page || typeof page.getRotation !== 'function') {
            return 0;
        }

        const rotation = page.getRotation();
        return typeof rotation?.angle === 'number' ? rotation.angle : 0;
    }

    function resolvePdfLib(rootObject, defaultPdfLib, overridePdfLib) {
        const pdfLib = overridePdfLib || defaultPdfLib || rootObject.PDFLib;

        if (!pdfLib || !pdfLib.PDFDocument || typeof pdfLib.degrees !== 'function') {
            throw new Error('PDFLib with PDFDocument and degrees() is required for export.');
        }

        if (typeof pdfLib.PDFDocument.load !== 'function' || typeof pdfLib.PDFDocument.create !== 'function') {
            throw new Error('PDFLib.PDFDocument.load() and PDFLib.PDFDocument.create() are required for export.');
        }

        return pdfLib;
    }

    function createInitialPages(pageCount) {
        if (!Number.isInteger(pageCount) || pageCount < 0) {
            throw new TypeError('pageCount must be a non-negative integer.');
        }

        return Array.from({ length: pageCount }, (_, index) => ({
            id: 'page-' + (index + 1),
            originalIndex: index + 1,
            rotation: 0
        }));
    }

    function createPageOrganizerCore(pageCount, options) {
        const settings = options || {};
        const pages = createInitialPages(pageCount);
        const defaultPdfLib = settings.pdfLib;

        function getPages() {
            return pages.map(clonePage);
        }

        function reorderPage(pageId, targetIndex) {
            const currentIndex = findPageIndex(pages, pageId);

            if (currentIndex === -1 || !isValidTargetIndex(targetIndex, pages.length)) {
                return false;
            }

            if (currentIndex === targetIndex) {
                return true;
            }

            const page = pages[currentIndex];
            pages.splice(currentIndex, 1);
            pages.splice(targetIndex, 0, page);
            return true;
        }

        function rotatePageClockwise(pageId) {
            const pageIndex = findPageIndex(pages, pageId);

            if (pageIndex === -1) {
                return false;
            }

            pages[pageIndex].rotation = normalizeRotation(pages[pageIndex].rotation + ROTATION_STEP);
            return true;
        }

        function deletePage(pageId) {
            const pageIndex = findPageIndex(pages, pageId);

            if (pageIndex === -1) {
                return false;
            }

            pages.splice(pageIndex, 1);
            return true;
        }

        async function exportPdf(sourceBytes, exportOptions) {
            if (sourceBytes == null) {
                throw new TypeError('sourceBytes is required for export.');
            }

            const pdfLib = resolvePdfLib(root, defaultPdfLib, exportOptions && exportOptions.pdfLib);
            const sourceDocument = await pdfLib.PDFDocument.load(sourceBytes);
            const outputDocument = await pdfLib.PDFDocument.create();
            const sourceIndices = pages.map(page => page.originalIndex - 1);
            const copiedPages = sourceIndices.length > 0
                ? await outputDocument.copyPages(sourceDocument, sourceIndices)
                : [];

            copiedPages.forEach((copiedPage, index) => {
                const originalRotation = readRotationAngle(sourceDocument.getPage(sourceIndices[index]));
                const finalRotation = normalizeRotation(originalRotation + pages[index].rotation);
                copiedPage.setRotation(pdfLib.degrees(finalRotation));
                outputDocument.addPage(copiedPage);
            });

            return outputDocument.save();
        }

        return {
            deletePage,
            exportPdf,
            getPages,
            reorderPage,
            rotatePageClockwise
        };
    }

    return {
        createPageOrganizerCore
    };
}));
