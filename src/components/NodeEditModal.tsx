import { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { PageNode } from '../utils/urlAnalyzer';

interface NodeEditModalProps {
  node: PageNode | null;
  onSave: (nodeId: string, updates: Partial<PageNode>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeEditModal({ node, onSave, onDelete, onClose }: NodeEditModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    category: '',
  });

  useEffect(() => {
    if (node) {
      setFormData({
        title: node.title,
        url: node.url,
        category: node.category,
      });
    }
  }, [node]);

  const handleSave = () => {
    if (!node) return;
    
    onSave(node.id, {
      title: formData.title,
      url: formData.url,
      category: formData.category,
    });
    onClose();
  };

  const handleDelete = () => {
    if (!node) return;
    
    if (window.confirm(`Are you sure you want to delete "${node.title}"?`)) {
      onDelete(node.id);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!node) return null;

  const categories = [
    'root',
    'content', 
    'products',
    'company',
    'support',
    'technical',
    'users',
    'general'
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-md border border-gray-300 rounded-lg shadow-lg">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit Node</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
        
        <div className="p-6 space-y-4" onKeyDown={handleKeyDown}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Page Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900"
              placeholder="Enter page title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              URL
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900 font-mono"
              placeholder="https://example.com/page"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <div>• Depth: {node.depth}</div>
            <div>• Children: {node.children.length}</div>
            <div>• Parent: {node.parent || 'None'}</div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-between">
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
            Delete
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-gray-300 hover:border-gray-400 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" strokeWidth={1.5} />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
