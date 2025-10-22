import { useState, useEffect } from 'react';
import { FileText, Download, Settings, Plus, Trash2 } from 'lucide-react';
import { SitemapCanvas } from './components/SitemapCanvas';
import { analyzeURLStructure, PageNode, groupByCategory } from './utils/urlAnalyzer';
import { applyForceDirectedLayout, applyHierarchicalLayout } from './utils/forceLayout';
import { exportToPNG, exportToSVG, exportToCSV, exportToHTML } from './utils/exportUtils';

type LayoutType = 'force' | 'hierarchical';

function App() {
  const [urlInput, setUrlInput] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [nodes, setNodes] = useState<PageNode[]>([]);
  const [layoutType, setLayoutType] = useState<LayoutType>('force');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedNode, setSelectedNode] = useState<PageNode | null>(null);

  useEffect(() => {
    if (urls.length > 0) {
      const hierarchy = analyzeURLStructure(urls);
      let layoutNodes: PageNode[];

      if (layoutType === 'force') {
        layoutNodes = applyForceDirectedLayout(hierarchy.nodes, {
          width: 1200,
          height: 800,
        });
      } else {
        layoutNodes = applyHierarchicalLayout(hierarchy.nodes, {
          width: 1200,
          height: 800,
        });
      }

      setNodes(layoutNodes);
    }
  }, [urls, layoutType]);

  const handleAddUrls = () => {
    const newUrls = urlInput
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);

    if (newUrls.length > 0) {
      setUrls(prev => [...prev, ...newUrls]);
      setUrlInput('');
    }
  };

  const handleClearAll = () => {
    setUrls([]);
    setNodes([]);
    setSelectedNode(null);
  };

  const handleLoadSample = () => {
    const sampleUrls = [
      'https://example.com',
      'https://example.com/about',
      'https://example.com/about/team',
      'https://example.com/about/careers',
      'https://example.com/blog',
      'https://example.com/blog/post-1',
      'https://example.com/blog/post-2',
      'https://example.com/blog/post-3',
      'https://example.com/products',
      'https://example.com/products/item-1',
      'https://example.com/products/item-2',
      'https://example.com/products/item-3',
      'https://example.com/products/item-1/reviews',
      'https://example.com/products/item-1/specifications',
      'https://example.com/support',
      'https://example.com/support/faq',
      'https://example.com/support/contact',
      'https://example.com/docs',
      'https://example.com/docs/getting-started',
      'https://example.com/docs/api',
      'https://example.com/docs/api/authentication',
      'https://example.com/docs/api/endpoints',
    ];
    setUrls(sampleUrls);
  };

  const handleExport = async (format: 'png' | 'svg' | 'csv' | 'html') => {
    switch (format) {
      case 'png':
        await exportToPNG(nodes);
        break;
      case 'svg':
        exportToSVG(nodes);
        break;
      case 'csv':
        exportToCSV(nodes);
        break;
      case 'html':
        exportToHTML(nodes);
        break;
    }
  };

  const categoryGroups = groupByCategory(nodes);
  const stats = {
    total: nodes.length,
    categories: categoryGroups.size,
    maxDepth: Math.max(...nodes.map(n => n.depth), 0),
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-screen-2xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-7 h-7" strokeWidth={1.5} />
              <h1 className="text-2xl font-semibold tracking-tight">Sitemap Generator</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="px-4 py-2 text-sm font-medium border border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
              >
                <Settings className="w-4 h-4" strokeWidth={1.5} />
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        <aside className="w-80 border-r border-gray-200 bg-white flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-4">
              Add URLs
            </h2>
            <textarea
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Paste URLs (one per line)&#10;https://example.com&#10;https://example.com/about&#10;https://example.com/products"
              className="w-full h-32 px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900 resize-none font-mono"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAddUrls}
                disabled={!urlInput.trim()}
                className="flex-1 px-4 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Add
              </button>
              <button
                onClick={handleLoadSample}
                className="px-4 py-2 border border-gray-300 text-sm font-medium hover:border-gray-400 transition-colors"
              >
                Sample
              </button>
            </div>
          </div>

          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900">
                URLs ({urls.length})
              </h2>
              {urls.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Clear
                </button>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {urls.length === 0 ? (
                <p className="text-sm text-gray-400">No URLs added yet</p>
              ) : (
                urls.map((url, index) => (
                  <div key={index} className="text-xs font-mono text-gray-600 truncate">
                    {url}
                  </div>
                ))
              )}
            </div>
          </div>

          {nodes.length > 0 && (
            <>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-4">
                  Statistics
                </h2>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Pages</span>
                    <span className="font-medium">{stats.total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Categories</span>
                    <span className="font-medium">{stats.categories}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Max Depth</span>
                    <span className="font-medium">{stats.maxDepth}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 border-b border-gray-200">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-4">
                  Layout
                </h2>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="layout"
                      value="force"
                      checked={layoutType === 'force'}
                      onChange={e => setLayoutType(e.target.value as LayoutType)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Force-Directed</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="layout"
                      value="hierarchical"
                      checked={layoutType === 'hierarchical'}
                      onChange={e => setLayoutType(e.target.value as LayoutType)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Hierarchical Tree</span>
                  </label>
                </div>
              </div>

              <div className="p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-4">
                  Export
                </h2>
                <div className="space-y-2">
                  <button
                    onClick={() => handleExport('png')}
                    className="w-full px-4 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    PNG (High-Res)
                  </button>
                  <button
                    onClick={() => handleExport('svg')}
                    className="w-full px-4 py-2 border border-gray-300 text-sm font-medium hover:border-gray-400 transition-colors"
                  >
                    SVG (Vector)
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full px-4 py-2 border border-gray-300 text-sm font-medium hover:border-gray-400 transition-colors"
                  >
                    CSV (Data)
                  </button>
                  <button
                    onClick={() => handleExport('html')}
                    className="w-full px-4 py-2 border border-gray-300 text-sm font-medium hover:border-gray-400 transition-colors"
                  >
                    HTML (Interactive)
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>

        <main className="flex-1 bg-gray-50 flex flex-col">
          {nodes.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" strokeWidth={1} />
                <h2 className="text-xl font-semibold mb-2">No Sitemap Yet</h2>
                <p className="text-gray-500 mb-6">
                  Add URLs to generate an intelligent, auto-layout sitemap with hierarchy detection
                  and professional export formats.
                </p>
                <button
                  onClick={handleLoadSample}
                  className="px-6 py-3 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  Load Sample Data
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 relative">
              <SitemapCanvas
                nodes={nodes}
                layoutType={layoutType}
                onNodeClick={node => setSelectedNode(node)}
              />
            </div>
          )}

          {selectedNode && (
            <div className="border-t border-gray-200 bg-white p-6">
              <div className="max-w-4xl">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold">{selectedNode.title}</h3>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-gray-400 hover:text-gray-900"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex">
                    <span className="w-24 text-gray-500">URL:</span>
                    <span className="font-mono text-gray-900">{selectedNode.url}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 text-gray-500">Category:</span>
                    <span className="font-medium">{selectedNode.category}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 text-gray-500">Depth:</span>
                    <span>{selectedNode.depth}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 text-gray-500">Children:</span>
                    <span>{selectedNode.children.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg border border-gray-300">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-900"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-3">
                    Categories
                  </h3>
                  <div className="space-y-2">
                    {Array.from(categoryGroups.entries()).map(([category, categoryNodes]) => (
                      <div key={category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 border border-gray-300"
                            style={{
                              background:
                                category === 'root'
                                  ? '#000000'
                                  : category === 'content'
                                  ? '#1a1a1a'
                                  : category === 'products'
                                  ? '#333333'
                                  : category === 'company'
                                  ? '#4d4d4d'
                                  : category === 'support'
                                  ? '#666666'
                                  : category === 'technical'
                                  ? '#808080'
                                  : category === 'users'
                                  ? '#999999'
                                  : '#b3b3b3',
                            }}
                          />
                          <span className="capitalize">{category}</span>
                        </div>
                        <span className="text-gray-500">{categoryNodes.length} pages</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-6 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
