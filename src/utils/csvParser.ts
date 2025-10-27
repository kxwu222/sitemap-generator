import Papa from 'papaparse';

export interface CsvRow {
  title: string;
  url: string;
  group?: string;
}

export interface CsvParseResult {
  data: CsvRow[];
  errors: string[];
}

export async function parseCsvFile(file: File): Promise<CsvParseResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors: string[] = [];
        const data: CsvRow[] = [];

        // Check if required columns exist
        const headers = results.meta.fields || [];
        const hasTitle = headers.some(h => h.toLowerCase().includes('title') || h.toLowerCase().includes('name'));
        const hasUrl = headers.some(h => h.toLowerCase().includes('url') || h.toLowerCase().includes('link'));

        if (!hasTitle || !hasUrl) {
          errors.push('CSV must contain columns for title/name and url/link');
          resolve({ data, errors });
          return;
        }

        // Find the correct column indices
        const titleColumn = headers.find(h => 
          h.toLowerCase().includes('title') || 
          h.toLowerCase().includes('name') ||
          h.toLowerCase().includes('page')
        );
        const urlColumn = headers.find(h => 
          h.toLowerCase().includes('url') || 
          h.toLowerCase().includes('link') ||
          h.toLowerCase().includes('address')
        );
        
        // Find group column (optional)
        const groupColumn = headers.find(h => 
          h.toLowerCase().includes('category') || 
          h.toLowerCase().includes('group') ||
          h.toLowerCase().includes('type') ||
          h.toLowerCase().includes('section')
        );

        results.data.forEach((row: any, index: number) => {
          try {
            const title = String(row[titleColumn!] || '').trim();
            const url = String(row[urlColumn!] || '').trim();
            const group = groupColumn ? String(row[groupColumn] || '').trim() : undefined;

            if (!title) {
              errors.push(`Row ${index + 1}: Missing title`);
              return;
            }

            if (!url) {
              errors.push(`Row ${index + 1}: Missing URL`);
              return;
            }

            // Basic URL validation
            try {
              new URL(url.startsWith('http') ? url : `https://${url}`);
            } catch {
              errors.push(`Row ${index + 1}: Invalid URL format`);
              return;
            }

            data.push({ title, url, group });
          } catch (error) {
            errors.push(`Row ${index + 1}: Error parsing data`);
          }
        });

        resolve({ data, errors });
      },
      error: (error) => {
        resolve({ data: [], errors: [`Failed to parse CSV: ${error.message}`] });
      }
    });
  });
}

export function generateSampleCsv(): string {
  return `Page Title,Page URL,Group
Home,https://example.com,root
About Us,https://example.com/about,company
Our Team,https://example.com/about/team,company
Careers,https://example.com/about/careers,company
Products,https://example.com/products,products
Product A,https://example.com/products/product-a,products
Product B,https://example.com/products/product-b,products
Blog,https://example.com/blog,content
Blog Post 1,https://example.com/blog/post-1,content
Blog Post 2,https://example.com/blog/post-2,content
Support,https://example.com/support,support
FAQ,https://example.com/support/faq,support
Contact,https://example.com/support/contact,support
Documentation,https://example.com/docs,technical
Getting Started,https://example.com/docs/getting-started,technical
API Reference,https://example.com/docs/api,technical`;
}
