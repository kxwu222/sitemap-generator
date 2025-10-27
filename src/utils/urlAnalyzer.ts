export interface PageNode {
  id: string;
  url: string;
  title: string;
  depth: number;
  parent: string | null;
  children: string[];
  category: string;
  customTitle?: boolean; // Flag to indicate if title is user-provided
  customColor?: string; // Custom color for the node
  textColor?: string; // Custom text color for the node
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface URLHierarchy {
  nodes: PageNode[];
  categories: string[];
}

export function createNodesFromCsvData(csvData: Array<{title: string, url: string, group?: string}>): URLHierarchy {
  const nodeMap = new Map<string, PageNode>();
  const categories = new Set<string>();

  csvData.forEach((row, index) => {
    const cleanUrl = row.url.trim();
    if (!cleanUrl) return;

    const urlObj = parseURL(cleanUrl);
    const pathSegments = urlObj.segments;
    const depth = pathSegments.length;
    const category = row.group?.trim() || determineCategory(pathSegments);

    categories.add(category);

    const node: PageNode = {
      id: `node-${index}`,
      url: cleanUrl,
      title: row.title.trim(),
      depth,
      parent: null,
      children: [],
      category,
      customTitle: true, // Mark as custom title from CSV
    };

    nodeMap.set(cleanUrl, node);
  });


  const sortedUrls = Array.from(nodeMap.keys()).sort((a, b) => {
    const depthA = parseURL(a).segments.length;
    const depthB = parseURL(b).segments.length;
    return depthA - depthB;
  });

  sortedUrls.forEach(url => {
    const node = nodeMap.get(url)!;
    const parentUrl = findParentURL(url, nodeMap);

    if (parentUrl) {
      const parentNode = nodeMap.get(parentUrl);
      if (parentNode) {
        node.parent = parentNode.id;
        parentNode.children.push(node.id);
      }
    }
  });

  return {
    nodes: Array.from(nodeMap.values()),
    categories: Array.from(categories),
  };
}

export function analyzeURLStructure(urls: string[]): URLHierarchy {
  const nodeMap = new Map<string, PageNode>();
  const categories = new Set<string>();

  urls.forEach((url, index) => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    const urlObj = parseURL(cleanUrl);
    const pathSegments = urlObj.segments;
    const depth = pathSegments.length;
    const category = determineCategory(pathSegments);

    categories.add(category);

    const node: PageNode = {
      id: `node-${index}`,
      url: cleanUrl,
      title: extractTitle(pathSegments),
      depth,
      parent: null,
      children: [],
      category,
    };

    nodeMap.set(cleanUrl, node);
  });


  const sortedUrls = Array.from(nodeMap.keys()).sort((a, b) => {
    const depthA = parseURL(a).segments.length;
    const depthB = parseURL(b).segments.length;
    return depthA - depthB;
  });

  sortedUrls.forEach(url => {
    const node = nodeMap.get(url)!;
    const parentUrl = findParentURL(url, nodeMap);

    if (parentUrl) {
      const parentNode = nodeMap.get(parentUrl);
      if (parentNode) {
        node.parent = parentNode.id;
        parentNode.children.push(node.id);
      }
    }
  });

  return {
    nodes: Array.from(nodeMap.values()),
    categories: Array.from(categories),
  };
}

function parseURL(url: string): { segments: string[]; domain: string } {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const segments = urlObj.pathname
      .split('/')
      .filter(segment => segment.length > 0);
    return { segments, domain: urlObj.hostname };
  } catch {
    const segments = url.split('/').filter(segment => segment.length > 0);
    return { segments, domain: '' };
  }
}


function findParentURL(url: string, nodeMap: Map<string, PageNode>): string | null {
  const segments = parseURL(url).segments;

  if (segments.length === 0) return null;

  for (let i = segments.length - 1; i > 0; i--) {
    const parentSegments = segments.slice(0, i);

    for (const [candidateUrl] of nodeMap) {
      const candidateSegments = parseURL(candidateUrl).segments;

      if (arraysEqual(candidateSegments, parentSegments)) {
        return candidateUrl;
      }
    }
  }

  if (segments.length > 1) {
    for (const [candidateUrl] of nodeMap) {
      const candidateSegments = parseURL(candidateUrl).segments;
      if (candidateSegments.length === 0 ||
          (candidateSegments.length === 1 && candidateSegments[0] === segments[0])) {
        return candidateUrl;
      }
    }
  }

  return null;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, index) => val === b[index]);
}

function determineCategory(segments: string[]): string {
  if (segments.length === 0) return 'root';

  const firstSegment = segments[0].toLowerCase();

  const categoryMap: Record<string, string> = {
    'blog': 'content',
    'post': 'content',
    'posts': 'content',
    'article': 'content',
    'articles': 'content',
    'news': 'content',
    'product': 'products',
    'products': 'products',
    'item': 'products',
    'shop': 'products',
    'about': 'company',
    'contact': 'company',
    'team': 'company',
    'careers': 'company',
    'help': 'support',
    'support': 'support',
    'faq': 'support',
    'docs': 'support',
    'documentation': 'support',
    'api': 'technical',
    'developer': 'technical',
    'user': 'users',
    'profile': 'users',
    'account': 'users',
  };

  return categoryMap[firstSegment] || 'general';
}

function extractTitle(segments: string[]): string {
  if (segments.length === 0) return 'Home';

  const lastSegment = segments[segments.length - 1];
  return lastSegment
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function groupByCategory(nodes: PageNode[]): Map<string, PageNode[]> {
  const groups = new Map<string, PageNode[]>();

  nodes.forEach(node => {
    if (!groups.has(node.category)) {
      groups.set(node.category, []);
    }
    groups.get(node.category)!.push(node);
  });

  return groups;
}
