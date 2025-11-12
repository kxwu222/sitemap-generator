# Sitemap Generator

A powerful, interactive sitemap visualization tool built with React, TypeScript, and D3.js.

## Features

- 📊 **Visual Sitemap Creation**: Create interactive, hierarchical sitemaps with drag-and-drop
- 📁 **CSV Import**: Import sitemaps from CSV files with automatic hierarchy detection
- 🎨 **Customisation**: Color nodes, style connections, and organize by groups/categories
- 💾 **Cloud Sync**: Save sitemaps to Supabase for cross-device access (optional)
- 📤 **Export Options**: Export to PNG, CSV, or XML sitemap formats
- 🔍 **Search**: Quick search to find and navigate to specific nodes
- ✏️ **Drawing Tools**: Add text annotations, shapes, and freehand lines

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Building for Production

```bash
npm run build
```

## Supabase Integration (Optional)

The app can save sitemaps to Supabase for cloud storage and cross-device synchronization. If Supabase is not configured, the app will automatically fall back to localStorage.

To set up Supabase:

1. See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed instructions
2. Create a `.env` file with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

The app works perfectly fine without Supabase - it will use localStorage as a fallback.

## Usage

1. **Upload CSV**: Click "Upload CSV File" and select a CSV with columns: Page Title, Page URL, Group/Category
   - Optional columns: Content Type, Last Updated (YYYY-MM-DD format)
2. **Create Sitemaps**: Use "Create New Sitemap" to start a new sitemap
3. **Edit Nodes**: Click on nodes to edit titles, URLs, and styling
4. **Add Connections**: Use the connection tool to link nodes
5. **Export**: Use the Export menu to save as PNG, CSV, or XML

## Export Formats

### XML Sitemap (Drupal Compatible)

The XML export generates a fully compliant sitemap following the [sitemaps.org protocol](https://www.sitemaps.org/protocol.html) and is compatible with Drupal's sitemap management.

**XML Structure:**
Each URL entry includes:
- `<loc>` - The URL (required)
- `<lastmod>` - Last modification date (YYYY-MM-DD format)
  - Uses the "Last Updated" column from CSV if provided
  - Falls back to current date if not available
- `<changefreq>` - Change frequency indicator (default: "monthly")
- `<priority>` - Priority value (0.1 to 1.0)
  - Calculated based on page depth: `1.0 - (depth × 0.1)`
  - Root pages (depth 0) = 1.0
  - Each level deeper decreases by 0.1
  - Minimum value: 0.1

**Example XML Output:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01-15</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <lastmod>2024-01-10</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
```

**CSV Format:**
The CSV export includes columns: URL, Title, Parent URL, Category, Content Type, Last Updated, Depth Level.

## Keyboard Shortcuts

### Essential
- `V` - Select mode
- `A` - Add child node (requires a node to be selected first)
- `C` - Change color (requires a node to be selected first)
- `L` - Connection line (drag from node to node)

### Selection
- `Shift + Drag` - Multi-select nodes

### Navigation
- `Ctrl/Cmd + Drag` - Move connected nodes (drag selected node with its parent and children)
- `Ctrl/Cmd + Wheel` - Zoom in/out
- `Ctrl/Cmd + F` - Search for URLs

## Tech Stack

- React 18
- TypeScript
- Vite
- D3.js (for force-directed layout)
- Tailwind CSS
- Supabase (optional, for cloud storage)

## License

MIT
