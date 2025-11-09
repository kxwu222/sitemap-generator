import Papa from 'papaparse';

export interface CsvRow {
  title: string;
  url: string;
  group?: string;
  contentType?: string;
  lastUpdated?: string; // normalized DD-MM-YYYY when possible
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

        // Find content type column (optional)
        const contentTypeColumn = headers.find(h => 
          h.toLowerCase().includes('content type') ||
          (h.toLowerCase().includes('type') && !h.toLowerCase().includes('mime')) ||
          h.toLowerCase().includes('format')
        );

        // Find last updated column (optional)
        const lastUpdatedColumn = headers.find(h => 
          h.toLowerCase().includes('last updated') ||
          h.toLowerCase().includes('updated') ||
          h.toLowerCase().includes('modified') ||
          h.toLowerCase().includes('last modified') ||
          h.toLowerCase().includes('date')
        );

        results.data.forEach((row: any, index: number) => {
          try {
            const title = String(row[titleColumn!] || '').trim();
            const url = String(row[urlColumn!] || '').trim();
            const group = groupColumn ? String(row[groupColumn] || '').trim() : undefined;
            const contentType = contentTypeColumn ? String(row[contentTypeColumn] || '').trim() : undefined;
            const lastUpdatedRaw = lastUpdatedColumn ? String(row[lastUpdatedColumn] || '').trim() : undefined;

            // Allow empty title - use URL as fallback
            if (!url) {
              errors.push(`Row ${index + 1}: Missing URL`);
              return;
            }
            
            // Use URL as title if title is missing
            const safeTitle = title || url;

            // Basic URL validation - be lenient to accept all URLs
            // Invalid URLs will be normalized during export if needed
            // Only reject completely empty or whitespace-only URLs
            if (!url.trim()) {
              errors.push(`Row ${index + 1}: Empty URL`);
              return;
            }

            // Normalize date to DD-MM-YYYY if present and valid
            let lastUpdated: string | undefined = undefined;
            if (lastUpdatedRaw) {
              try {
                // Try to parse DD/MM/YYYY or DD-MM-YYYY format
                const parsed = lastUpdatedRaw.replace(/\//g, '-');
                const parts = parsed.split('-');
                
                if (parts.length === 3) {
                  const dd = parts[0].padStart(2, '0');
                  const mm = parts[1].padStart(2, '0');
                  const yyyy = parts[2];
                  
                  // Validate numeric parts
                  if (/^\d+$/.test(dd) && /^\d+$/.test(mm) && /^\d{4}$/.test(yyyy)) {
                    lastUpdated = `${dd}-${mm}-${yyyy}`;
                  } else {
                    errors.push(`Row ${index + 1}: Invalid Last Updated date format`);
                  }
                } else {
                  // Fallback to native Date parsing for other formats
                  const d = new Date(lastUpdatedRaw);
                  if (!isNaN(d.getTime())) {
                    const dd = String(d.getDate()).padStart(2, '0');
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const y = d.getFullYear();
                    lastUpdated = `${dd}-${m}-${y}`;
                  } else {
                    errors.push(`Row ${index + 1}: Invalid Last Updated date`);
                  }
                }
              } catch (error) {
                errors.push(`Row ${index + 1}: Error parsing Last Updated date`);
              }
            }

            data.push({ title: safeTitle, url, group, contentType, lastUpdated });
          } catch (error) {
            errors.push(`Row ${index + 1}: Error parsing data`);
          }
        });

        console.log(`CSV parsed: ${data.length} valid rows, ${errors.length} errors out of ${results.data.length} total rows`);
        resolve({ data, errors });
      },
      error: (error) => {
        resolve({ data: [], errors: [`Failed to parse CSV: ${error.message}`] });
      }
    });
  });
}