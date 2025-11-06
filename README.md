# Sitemap Generator

A powerful, interactive sitemap visualization tool built with React, TypeScript, and D3.js.

## Features

- 📊 **Visual Sitemap Creation**: Create interactive, hierarchical sitemaps with drag-and-drop
- 📁 **CSV Import**: Import sitemaps from CSV files with automatic hierarchy detection
- 🎨 **Customization**: Color nodes, style connections, and organize by groups/categories
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
2. **Create Sitemaps**: Use "Create New Sitemap" to start a new sitemap
3. **Edit Nodes**: Click on nodes to edit titles, URLs, and styling
4. **Add Connections**: Use the connection tool to link nodes
5. **Export**: Use the Export menu to save as PNG, CSV, or XML

## Keyboard Shortcuts

- `V` - Select mode
- `A` - Add child node (requires selection)
- `C` - Change color (requires selection)
- `L` - Connection line tool
- `Ctrl/Cmd + F` - Search
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` - Redo

## Tech Stack

- React 18
- TypeScript
- Vite
- D3.js (for force-directed layout)
- Tailwind CSS
- Supabase (optional, for cloud storage)

## License

MIT
