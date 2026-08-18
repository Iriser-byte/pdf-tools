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

    /**
     * @typedef {object} PageRecord
     * @property {string} id Stable page identifier for organizer operations.
     * @property {number} originalIndex 1-based page index from the source document.
     * @property {number} rotation Clockwise rotation in degrees, normalized to 0/90/180/270.
     */

    /**
     * @typedef {object} PageOrganizerCore
     * @property {() => PageRecord[]} getPages Returns a new array of cloned page records; mutating the snapshot does not change organizer state.
     * @property {(pageId: string, targetIndex: number) => boolean} reorderPage Returns `false` when `pageId` is unknown or `targetIndex` is outside the current page bounds.
     * @property {(pageId: string) => boolean} rotatePageClockwise Returns `false` when `pageId` does not match a current page.
     * @property {(pageId: string) => boolean} deletePage Returns `false` when `pageId` does not match a current page.
     * @property {(sourceBytes: *, exportOptions?: { pdfLib?: object }) => Promise<Uint8Array>} exportPdf Exports the current order and rotation using bytes accepted by `PDFDocument.load()`, resolves with saved PDF bytes, rejects with `TypeError` when `sourceBytes` is missing, throws when PDFLib is unavailable or malformed, and otherwise propagates PDF processing errors.
     */

    /**
     * Creates the in-memory page organizer model for a source PDF.
     *
     * @param {number} pageCount Number of pages available from the source document.
     * @param {{ pdfLib?: object }} [options] Optional default PDFLib implementation for export operations.
     * @returns {PageOrganizerCore}
     */
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
