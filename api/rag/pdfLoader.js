import pdf from 'pdf-parse';
import fs from 'fs/promises';

/**
 * PDF Loader Module
 * Extracts text content from PDF files
 */

/**
 * Extract text from a PDF file
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<{text: string, numPages: number, metadata: object}>} - Extracted content
 */
export async function loadPDF(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);

    return {
      text: data.text,
      numPages: data.numpages,
      metadata: data.info
    };
  } catch (error) {
    console.error('Error loading PDF:', error);
    throw new Error(`Failed to load PDF: ${error.message}`);
  }
}

/**
 * Extract text from PDF with page-level granularity
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<Array<{pageNumber: number, text: string}>>} - Array of pages with text
 */
export async function loadPDFByPages(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    
    // Custom render function to track pages
    let currentPage = 1;
    const pages = [];
    let currentText = '';

    const options = {
      pagerender: (pageData) => {
        return pageData.getTextContent().then((textContent) => {
          const pageText = textContent.items.map(item => item.str).join(' ');
          pages.push({
            pageNumber: currentPage,
            text: pageText
          });
          currentPage++;
          return pageText;
        });
      }
    };

    const data = await pdf(dataBuffer, options);

    // If page-level extraction didn't work, fall back to simple method
    if (pages.length === 0) {
      const textPerPage = data.text.split('\f'); // Form feed character often separates pages
      return textPerPage.map((text, index) => ({
        pageNumber: index + 1,
        text: text.trim()
      })).filter(page => page.text.length > 0);
    }

    return pages;
  } catch (error) {
    console.error('Error loading PDF by pages:', error);
    throw new Error(`Failed to load PDF by pages: ${error.message}`);
  }
}
