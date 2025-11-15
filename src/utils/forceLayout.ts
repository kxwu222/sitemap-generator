import { PageNode } from './urlAnalyzer';
// --- helpers for improved spacing ---
function estimateNodeSize(n: PageNode) {
  const titleLen = (n.title || '').length;
  const urlLen = (n.url || '').length;
  const content = Math.max(titleLen, Math.min(60, urlLen));
  const width = Math.max(150, Math.min(360, 16 * Math.ceil(content / 8))); // 3:2 ratio - width
  const height = 100; // 3:2 ratio - height (150:100 = 3:2)
  return { width, height };
}

function relaxOverlaps(
  nodes: PageNode[],
  opts: { padding?: number; iterations?: number; strength?: number } = {}
): PageNode[] {
  const padding = opts.padding ?? 24;
  const iterations = opts.iterations ?? 3;
  const strength = opts.strength ?? 0.5;

  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.x === undefined || a.y === undefined) continue;
      const sa = estimateNodeSize(a);

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (b.x === undefined || b.y === undefined) continue;
        const sb = estimateNodeSize(b);

        const ax1 = a.x - sa.width / 2, ax2 = a.x + sa.width / 2;
        const ay1 = a.y - sa.height / 2, ay2 = a.y + sa.height / 2;
        const bx1 = b.x - sb.width / 2, bx2 = b.x + sb.width / 2;
        const by1 = b.y - sb.height / 2, by2 = b.y + sb.height / 2;

        const overlapX = Math.min(ax2 + padding, bx2 + padding) - Math.max(ax1 - padding, bx1 - padding);
        const overlapY = Math.min(ay2 + padding, by2 + padding) - Math.max(ay1 - padding, by1 - padding);

        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const move = (overlapX / 2) * strength;
            if (a.x < b.x) { a.x -= move; b.x += move; } else { a.x += move; b.x -= move; }
          } else {
            const move = (overlapY / 2) * strength;
            if (a.y < b.y) { a.y -= move; b.y += move; } else { a.y += move; b.y -= move; }
          }
          a.fx = a.x; a.fy = a.y; b.fx = b.x; b.fy = b.y;
        }
      }
    }
  }
  return nodes;
}

interface ForceLayoutConfig {
  width: number;
  height: number;
  nodeRadius: number;
  linkDistance: number;
  linkStrength: number;
  chargeStrength: number;
  centerStrength: number;
  collisionRadius: number;
  velocityDecay: number;
  iterations: number;
}

const DEFAULT_CONFIG: ForceLayoutConfig = {
  width: 1200,
  height: 800,
  nodeRadius: 50, // Increased for better spacing
  linkDistance: 250, // Increased for better visual separation
  linkStrength: 0.7, // Stronger links for cleaner hierarchy
  chargeStrength: -800, // Stronger repulsion for better spacing
  centerStrength: 0.02, // Reduced to allow more natural spread
  collisionRadius: 100, // Larger collision radius for better spacing
  velocityDecay: 0.25, // Slower decay for smoother animation
  iterations: 500, // More iterations for better convergence
};

function applyForceDirectedLayout(
  nodes: PageNode[],
  config: Partial<ForceLayoutConfig> = {}
): PageNode[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const nodeMap = new Map<string, PageNode>();
  nodes.forEach(node => {
    const nodeCopy = { ...node };
    // Only set random position if node doesn't already have a position
    if (nodeCopy.x === undefined) {
      nodeCopy.x = Math.random() * cfg.width;
    }
    if (nodeCopy.y === undefined) {
      nodeCopy.y = Math.random() * cfg.height;
    }
    nodeCopy.vx = 0;
    nodeCopy.vy = 0;
    nodeMap.set(node.id, nodeCopy);
  });

  const links = nodes
    .filter(node => node.parent)
    .map(node => ({
      source: node.parent!,
      target: node.id,
    }));

  for (let i = 0; i < cfg.iterations; i++) {
    const alpha = 1 - i / cfg.iterations;

    nodeMap.forEach(node => {
      node.vx = (node.vx ?? 0) * cfg.velocityDecay;
      node.vy = (node.vy ?? 0) * cfg.velocityDecay;
    });

    applyLinkForce(nodeMap, links, cfg, alpha);
    applyChargeForce(nodeMap, cfg, alpha);
    applyCenterForce(nodeMap, cfg, alpha);
    applyCollisionForce(nodeMap, cfg, alpha);

    nodeMap.forEach(node => {
      node.x = (node.x ?? 0) + (node.vx ?? 0);
      node.y = (node.y ?? 0) + (node.vy ?? 0);

      if (node.fx !== undefined && node.fx !== null) {
        node.x = node.fx;
        node.vx = 0;
      }
      if (node.fy !== undefined && node.fy !== null) {
        node.y = node.fy;
        node.vy = 0;
      }

      const padding = cfg.nodeRadius;
      node.x = Math.max(padding, Math.min(cfg.width - padding, node.x!));
      node.y = Math.max(padding, Math.min(cfg.height - padding, node.y!));
    });
  }

  return Array.from(nodeMap.values());
}

function applyLinkForce(
  nodeMap: Map<string, PageNode>,
  links: Array<{ source: string; target: string }>,
  cfg: ForceLayoutConfig,
  alpha: number
): void {
  links.forEach(link => {
    const source = nodeMap.get(link.source);
    const target = nodeMap.get(link.target);

    if (!source || !target) return;

    const dx = (target.x ?? 0) - (source.x ?? 0);
    const dy = (target.y ?? 0) - (source.y ?? 0);
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

    const force = ((distance - cfg.linkDistance) / distance) * cfg.linkStrength * alpha;

    const fx = dx * force;
    const fy = dy * force;

    source.vx = (source.vx ?? 0) + fx;
    source.vy = (source.vy ?? 0) + fy;
    target.vx = (target.vx ?? 0) - fx;
    target.vy = (target.vy ?? 0) - fy;
  });
}

function applyChargeForce(
  nodeMap: Map<string, PageNode>,
  cfg: ForceLayoutConfig,
  alpha: number
): void {
  const nodes = Array.from(nodeMap.values());

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];

      const dx = (nodeB.x ?? 0) - (nodeA.x ?? 0);
      const dy = (nodeB.y ?? 0) - (nodeA.y ?? 0);
      const distanceSquared = dx * dx + dy * dy || 1;
      const distance = Math.sqrt(distanceSquared);

      const force = (cfg.chargeStrength * alpha) / distanceSquared;

      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      nodeA.vx = (nodeA.vx ?? 0) + fx;
      nodeA.vy = (nodeA.vy ?? 0) + fy;
      nodeB.vx = (nodeB.vx ?? 0) - fx;
      nodeB.vy = (nodeB.vy ?? 0) - fy;
    }
  }
}

function applyCenterForce(
  nodeMap: Map<string, PageNode>,
  cfg: ForceLayoutConfig,
  alpha: number
): void {
  const centerX = cfg.width / 2;
  const centerY = cfg.height / 2;

  nodeMap.forEach(node => {
    const dx = centerX - (node.x ?? 0);
    const dy = centerY - (node.y ?? 0);

    node.vx = (node.vx ?? 0) + dx * cfg.centerStrength * alpha;
    node.vy = (node.vy ?? 0) + dy * cfg.centerStrength * alpha;
  });
}

function applyCollisionForce(
  nodeMap: Map<string, PageNode>,
  cfg: ForceLayoutConfig,
  alpha: number
): void {
  const nodes = Array.from(nodeMap.values());

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];

      const dx = (nodeB.x ?? 0) - (nodeA.x ?? 0);
      const dy = (nodeB.y ?? 0) - (nodeA.y ?? 0);
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;

      const minDistance = cfg.collisionRadius * 2;

      if (distance < minDistance) {
        const force = ((minDistance - distance) / distance) * 0.5 * alpha;

        const fx = dx * force;
        const fy = dy * force;

        nodeA.vx = (nodeA.vx ?? 0) - fx;
        nodeA.vy = (nodeA.vy ?? 0) - fy;
        nodeB.vx = (nodeB.vx ?? 0) + fx;
        nodeB.vy = (nodeB.vy ?? 0) + fy;
      }
    }
  }
}

function applyHierarchicalLayout(
  nodes: PageNode[],
  config: Partial<ForceLayoutConfig> = {}
): PageNode[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const nodeMap = createNodeMap(nodes);
  const levelMap = buildLevelMap(nodes, nodeMap);
  const maxLevel = Math.max(...Array.from(levelMap.keys()));

  const levelSpacing = 180; // space between levels
  const nodeSpacing = 300; // Much increased horizontal spacing for clear distinction
  const startY = 120; // top margin
  const subRowSpacing = 110; // spacing between wrapped rows inside same level

  for (let level = 0; level <= maxLevel; level++) {
    const nodesAtLevel = (levelMap.get(level) || []).slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    const yBase = startY + (level * levelSpacing);
    const maxPerRow = Math.max(1, Math.floor((cfg.width - 200) / nodeSpacing));
    const numRows = Math.max(1, Math.ceil(nodesAtLevel.length / maxPerRow));

    for (let r = 0; r < numRows; r++) {
      const rowItems = nodesAtLevel.slice(r * maxPerRow, (r + 1) * maxPerRow);
      const totalWidth = (Math.max(0, rowItems.length - 1)) * nodeSpacing;
      const startX = (cfg.width - totalWidth) / 2;
      const y = yBase + r * subRowSpacing;
      rowItems.forEach((node, idx) => {
        if (node.x === undefined) node.x = startX + idx * nodeSpacing;
        if (node.y === undefined) node.y = y;
      });
    }
  }

  return Array.from(nodeMap.values());
}

function applyFlowchartLayout(
  nodes: PageNode[],
  config: Partial<ForceLayoutConfig> = {}
): PageNode[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const nodeMap = createNodeMap(nodes);
  const levelMap = buildLevelMap(nodes, nodeMap);
  const maxLevel = Math.max(...Array.from(levelMap.keys()));
  
  const nodeWidth = 200;
  const nodeHeight = 80;
  const horizontalSpacing = nodeWidth + 220; // Much increased spacing for clear distinction
  const verticalSpacing = nodeHeight + 160;
  const startY = 140;
  const subRowSpacing = 110;

  for (let level = 0; level <= maxLevel; level++) {
    const nodesAtLevel = (levelMap.get(level) || []).slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    const yBase = startY + (level * verticalSpacing);
    const maxPerRow = Math.max(1, Math.floor((cfg.width - 200) / horizontalSpacing));
    const numRows = Math.max(1, Math.ceil(nodesAtLevel.length / maxPerRow));
    for (let r = 0; r < numRows; r++) {
      const rowItems = nodesAtLevel.slice(r * maxPerRow, (r + 1) * maxPerRow);
      const totalWidth = rowItems.length * horizontalSpacing;
      const startX = Math.max(50, (cfg.width - totalWidth) / 2);
      const y = yBase + r * subRowSpacing;
      rowItems.forEach((node, index) => {
        if (node.x === undefined) node.x = startX + (index * horizontalSpacing);
        if (node.y === undefined) node.y = y;
      });
    }
  }

  const adjusted = applyFlowchartForceAdjustment(Array.from(nodeMap.values()), cfg);
  return relaxOverlaps(adjusted, { padding: 50, iterations: 4, strength: 0.8 });
}

export function applyGroupedFlowLayout(
  nodes: PageNode[],
  config: Partial<ForceLayoutConfig> = {}
): PageNode[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // --- Group nodes by category ---
  const byGroup = new Map<string, PageNode[]>();
  nodes.forEach(n => {
    const key = n.category || 'general';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(n);
  });

  const groupKeys = Array.from(byGroup.keys());
  if (groupKeys.length === 0) {
    return nodes;
  }

  // --- Horizontal group columns with global depth alignment ---

  // Column configuration – tuned for clear separation between groups
  const outerMarginX = 180;
  const betweenGroups = 280;
  const groupCount = groupKeys.length;

  const availableWidth = Math.max(
    400,
    cfg.width - 2 * outerMarginX - (groupCount - 1) * betweenGroups
  );
  const groupColumnWidth = Math.max(300, availableWidth / groupCount);
  const totalUsedWidth =
    groupCount * groupColumnWidth + (groupCount - 1) * betweenGroups;
  const firstColumnX = Math.max(
    outerMarginX,
    (cfg.width - totalUsedWidth) / 2
  );

  // Global vertical parameters – use global depth for alignment across all groups
  const startY = 160;
  const levelSpacing = 220;
  const columnInnerPadding = 100;

  // Build global depth map to understand depth distribution
  const globalDepthMap = buildGlobalDepthMap(nodes);
  const allDepths = Array.from(globalDepthMap.keys()).sort((a, b) => a - b);

  // Track per-node horizontal bounds so we can keep groups distinct after relaxOverlaps
  const columnBoundsById = new Map<
    string,
    { left: number; right: number }
  >();

  // Create a node map for quick lookups
  const nodeMap = new Map<string, PageNode>();
  nodes.forEach(n => nodeMap.set(n.id, n));

  // For each group, arrange nodes using global depth for Y positioning
  groupKeys.forEach((g, idx) => {
    const groupNodes = byGroup.get(g)!;
    
    const columnLeft = firstColumnX + idx * (groupColumnWidth + betweenGroups);
    const columnRight = columnLeft + groupColumnWidth;
    const innerLeft = columnLeft + columnInnerPadding;
    const innerRight = columnRight - columnInnerPadding;
    const usableWidth = Math.max(innerRight - innerLeft, 1);

    // Group nodes by their global depth within this group
    const nodesByDepth = new Map<number, PageNode[]>();
    groupNodes.forEach(n => {
      const depth = n.depth ?? 0;
      if (!nodesByDepth.has(depth)) {
        nodesByDepth.set(depth, []);
      }
      nodesByDepth.get(depth)!.push(n);
    });

    // Build parent-child relationship map for this group
    const parentToChildren = new Map<string, PageNode[]>();
    const rootNodes: PageNode[] = [];
    
    groupNodes.forEach(n => {
      if (n.parent && nodeMap.has(n.parent) && groupNodes.some(gn => gn.id === n.parent)) {
        // Parent is in the same group
        if (!parentToChildren.has(n.parent)) {
          parentToChildren.set(n.parent, []);
        }
        parentToChildren.get(n.parent)!.push(n);
      } else {
        // Root node (no parent or parent is in different group)
        rootNodes.push(n);
      }
    });

    // Helper function to arrange nodes respecting parent-child relationships
    const arrangeNodesAtDepth = (depth: number, nodesAtDepth: PageNode[]) => {
      if (nodesAtDepth.length === 0) return;

      const y = startY + depth * levelSpacing;

      // Sort nodes to maintain parent-child visual order
      // Group siblings (nodes with same parent) together
      nodesAtDepth.sort((a, b) => {
        // First, sort by parent (siblings should be together)
        if (a.parent && b.parent) {
          if (a.parent !== b.parent) {
            return a.parent.localeCompare(b.parent);
          }
        } else if (a.parent) return 1;
        else if (b.parent) return -1;
        // Then by title for consistent ordering
        return (a.title || '').localeCompare(b.title || '');
      });

      if (nodesAtDepth.length === 1) {
        const n = nodesAtDepth[0];
        const x = innerLeft + usableWidth / 2;
        if (n.x === undefined) n.x = x;
        if (n.y === undefined) n.y = y;
        columnBoundsById.set(n.id, { left: innerLeft, right: innerRight });
      } else {
        // Spread nodes evenly across the column width
        const step = usableWidth / (nodesAtDepth.length - 1);
        nodesAtDepth.forEach((n, i) => {
          const x = innerLeft + step * i;
          if (n.x === undefined) n.x = x;
          if (n.y === undefined) n.y = y;
          columnBoundsById.set(n.id, { left: innerLeft, right: innerRight });
        });
      }
    };

    // For each depth level, arrange nodes horizontally within the group column
    allDepths.forEach(depth => {
      const nodesAtDepth = nodesByDepth.get(depth) || [];
      arrangeNodesAtDepth(depth, nodesAtDepth);
    });
  });

  // Gently resolve remaining overlaps while keeping groups distinct
  const relaxed = relaxOverlaps(nodes, {
    padding: 80,
    iterations: 4,
    strength: 0.6,
  });

  // Clamp nodes back into their original column bounds to prevent group drift
  // Also ensure Y positions respect global depth alignment
  relaxed.forEach(n => {
    const bounds = columnBoundsById.get(n.id);
    if (!bounds || n.x === undefined) return;
    n.x = Math.max(bounds.left, Math.min(bounds.right, n.x));
    
    // Ensure Y position aligns with global depth
    const depth = n.depth ?? 0;
    const expectedY = startY + depth * levelSpacing;
    if (n.y !== undefined) {
      // Allow slight Y adjustment for parent-child visual flow, but keep close to depth-aligned Y
      const maxYOffset = levelSpacing * 0.3; // Allow up to 30% of level spacing for adjustment
      n.y = Math.max(expectedY - maxYOffset, Math.min(expectedY + maxYOffset, n.y));
    }
  });

  return relaxed;
}

function applyFlowchartForceAdjustment(nodes: PageNode[], cfg: ForceLayoutConfig): PageNode[] {
  const iterations = 50; // Fewer iterations for subtle adjustments

  for (let i = 0; i < iterations; i++) {
    const alpha = 1 - i / iterations;

    // Apply subtle repulsion between nodes at the same level
    const levelGroups = new Map<number, PageNode[]>();
    nodes.forEach(node => {
      const level = Math.round((node.y || 0) / 140); // Approximate level
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level)!.push(node);
    });

    levelGroups.forEach(levelNodes => {
      for (let j = 0; j < levelNodes.length; j++) {
        for (let k = j + 1; k < levelNodes.length; k++) {
          const nodeA = levelNodes[j];
          const nodeB = levelNodes[k];

          const dx = (nodeB.x || 0) - (nodeA.x || 0);
          const dy = (nodeB.y || 0) - (nodeA.y || 0);
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

          const minDistance = 280; // Increased minimum distance for better distinction
          if (distance < minDistance) {
            const force = ((minDistance - distance) / distance) * 0.3 * alpha;
            const fx = dx * force;
            const fy = dy * force;

            // Only adjust position if nodes don't have fixed positions
            if (nodeA.fx === undefined || nodeA.fx === null) {
              nodeA.x = (nodeA.x || 0) - fx;
            }
            if (nodeA.fy === undefined || nodeA.fy === null) {
              nodeA.y = (nodeA.y || 0) - fy;
            }
            if (nodeB.fx === undefined || nodeB.fx === null) {
              nodeB.x = (nodeB.x || 0) + fx;
            }
            if (nodeB.fy === undefined || nodeB.fy === null) {
              nodeB.y = (nodeB.y || 0) + fy;
            }
          }
        }
      }
    });

    // Keep nodes within bounds
    nodes.forEach(node => {
      const padding = 50;
      node.x = Math.max(padding, Math.min(cfg.width - padding, node.x || 0));
      node.y = Math.max(padding, Math.min(cfg.height - padding, node.y || 0));
    });
  }

  return nodes;
}

// --- Shared utilities for layout functions ---

function createNodeMap(nodes: PageNode[]): Map<string, PageNode> {
  const nodeMap = new Map<string, PageNode>();
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node });
  });
  return nodeMap;
}

function buildLevelMap(nodes: PageNode[], nodeMap: Map<string, PageNode>): Map<number, PageNode[]> {
  const rootNodes = nodes.filter(node => !node.parent);
  const levelMap = new Map<number, PageNode[]>();

  // Always traverse using the nodeMap copies so positioned nodes are returned
  rootNodes.forEach(root => {
    const rootCopy = nodeMap.get(root.id);
    if (rootCopy) assignLevels(rootCopy, 0, nodeMap, levelMap);
  });
  
  // Ensure all nodes are included, even if no valid roots exist or links are broken
  const visitedIds = new Set<string>();
  levelMap.forEach(list => list.forEach(n => visitedIds.add(n.id)));
  if (visitedIds.size < nodes.length) {
    const missing = nodes.filter(n => !visitedIds.has(n.id)).map(n => nodeMap.get(n.id)!).filter(Boolean) as PageNode[];
    if (!levelMap.has(0)) levelMap.set(0, []);
    levelMap.get(0)!.push(...missing);
  }
  
  return levelMap;
}

// Octopus.do-inspired layout with optimal spacing and clear hierarchy
function applyOctopusStyleLayout(
  nodes: PageNode[],
  config: Partial<ForceLayoutConfig> = {}
): PageNode[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const nodeMap = createNodeMap(nodes);
  const levelMap = buildLevelMap(nodes, nodeMap);
  const maxLevel = Math.max(...Array.from(levelMap.keys()));

  // Octopus.do-style spacing parameters - optimized based on reference image
  const levelSpacing = 200; // Increased vertical spacing to match reference
  const nodeSpacing = 500; // Increased horizontal spacing for better clarity
  const startY = 150; // More generous top margin
  const sideMargin = 120; // Increased side margins for better framing

  for (let level = 0; level <= maxLevel; level++) {
    const nodesAtLevel = levelMap.get(level) || [];
    const y = startY + (level * levelSpacing);

    if (nodesAtLevel.length === 1) {
      // Center single nodes
      const node = nodesAtLevel[0];
      if (node.x === undefined) node.x = cfg.width / 2;
      if (node.y === undefined) node.y = y;
    } else {
      // Distribute multiple nodes with optimal spacing
      const totalWidth = (nodesAtLevel.length - 1) * nodeSpacing;
      const startX = Math.max(sideMargin, (cfg.width - totalWidth) / 2);
      
      nodesAtLevel.forEach((node, index) => {
        if (node.x === undefined) {
          node.x = startX + (index * nodeSpacing);
        }
        if (node.y === undefined) {
          node.y = y;
        }
      });
    }
  }

  // Apply subtle force adjustment for perfect positioning
  const adjusted = applyOctopusForceAdjustment(Array.from(nodeMap.values()), cfg);
  return relaxOverlaps(adjusted, { padding: 60, iterations: 6, strength: 0.9 });
}

function applyOctopusForceAdjustment(nodes: PageNode[], cfg: ForceLayoutConfig): PageNode[] {
  const iterations = 60; // More iterations for precise positioning

  for (let i = 0; i < iterations; i++) {
    const alpha = 1 - i / iterations;

    // Apply gentle repulsion between nodes at the same level
    const levelGroups = new Map<number, PageNode[]>();
    nodes.forEach(node => {
      const level = Math.round((node.y || 0) / 200); // Match levelSpacing
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level)!.push(node);
    });

    levelGroups.forEach(levelNodes => {
      for (let j = 0; j < levelNodes.length; j++) {
        for (let k = j + 1; k < levelNodes.length; k++) {
          const nodeA = levelNodes[j];
          const nodeB = levelNodes[k];

          const dx = (nodeB.x || 0) - (nodeA.x || 0);
          const dy = (nodeB.y || 0) - (nodeA.y || 0);
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

          const minDistance = 280; // Match increased nodeSpacing
          if (distance < minDistance) {
            const force = ((minDistance - distance) / distance) * 0.2 * alpha;
            const fx = dx * force;
            const fy = dy * force;

            // Only adjust position if nodes don't have fixed positions
            if (nodeA.fx === undefined || nodeA.fx === null) {
              nodeA.x = (nodeA.x || 0) - fx;
            }
            if (nodeA.fy === undefined || nodeA.fy === null) {
              nodeA.y = (nodeA.y || 0) - fy;
            }
            if (nodeB.fx === undefined || nodeB.fx === null) {
              nodeB.x = (nodeB.x || 0) + fx;
            }
            if (nodeB.fy === undefined || nodeB.fy === null) {
              nodeB.y = (nodeB.y || 0) + fy;
            }
          }
        }
      }
    });

    // Keep nodes within bounds with generous padding
    nodes.forEach(node => {
      const padding = 80;
      node.x = Math.max(padding, Math.min(cfg.width - padding, node.x || 0));
      node.y = Math.max(padding, Math.min(cfg.height - padding, node.y || 0));
    });
  }

  return nodes;
}

function assignLevels(
  node: PageNode,
  level: number,
  nodeMap: Map<string, PageNode>,
  levelMap: Map<number, PageNode[]>
): void {
  if (!levelMap.has(level)) {
    levelMap.set(level, []);
  }
  levelMap.get(level)!.push(node);

  node.children.forEach(childId => {
    const child = nodeMap.get(childId);
    if (child) {
      assignLevels(child, level + 1, nodeMap, levelMap);
    }
  });
}

function buildGroupLevelMap(groupNodes: PageNode[], groupMap: Map<string, PageNode>): Map<number, PageNode[]> {
  const roots = groupNodes.filter(n => !n.parent || !groupMap.has(n.parent));
  const levelMap = new Map<number, PageNode[]>();
  const queue: Array<{ id: string; lvl: number }> = roots.map(r => ({ id: r.id, lvl: 0 }));
  const visited = new Set<string>();
  
  while (queue.length) {
    const { id, lvl } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const n = groupMap.get(id);
    if (!n) continue;
    if (!levelMap.has(lvl)) levelMap.set(lvl, []);
    levelMap.get(lvl)!.push(n);
    n.children.forEach(c => {
      if (groupMap.has(c)) queue.push({ id: c, lvl: lvl + 1 });
    });
  }
  
  return levelMap;
}

/**
 * Build a global depth map using node.depth property.
 * Groups all nodes by their global depth (0, 1, 2, etc.) regardless of category.
 * This ensures depth-0 nodes align at the top across all groups.
 */
function buildGlobalDepthMap(nodes: PageNode[]): Map<number, PageNode[]> {
  const depthMap = new Map<number, PageNode[]>();
  nodes.forEach(node => {
    const depth = node.depth ?? 0;
    if (!depthMap.has(depth)) {
      depthMap.set(depth, []);
    }
    depthMap.get(depth)!.push(node);
  });
  return depthMap;
}
