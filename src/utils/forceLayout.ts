import { PageNode } from './urlAnalyzer';

export interface ForceLayoutConfig {
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
  nodeRadius: 40,
  linkDistance: 120,
  linkStrength: 0.5,
  chargeStrength: -300,
  centerStrength: 0.05,
  collisionRadius: 50,
  velocityDecay: 0.4,
  iterations: 300,
};

export function applyForceDirectedLayout(
  nodes: PageNode[],
  config: Partial<ForceLayoutConfig> = {}
): PageNode[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const nodeMap = new Map<string, PageNode>();
  nodes.forEach(node => {
    const nodeCopy = { ...node };
    nodeCopy.x = nodeCopy.x ?? Math.random() * cfg.width;
    nodeCopy.y = nodeCopy.y ?? Math.random() * cfg.height;
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

export function applyHierarchicalLayout(
  nodes: PageNode[],
  config: Partial<ForceLayoutConfig> = {}
): PageNode[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const nodeMap = new Map<string, PageNode>();
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node });
  });

  const rootNodes = nodes.filter(node => !node.parent);
  const levelMap = new Map<number, PageNode[]>();

  rootNodes.forEach(root => {
    assignLevels(root, 0, nodeMap, levelMap);
  });

  const maxLevel = Math.max(...Array.from(levelMap.keys()));

  for (let level = 0; level <= maxLevel; level++) {
    const nodesAtLevel = levelMap.get(level) || [];
    const y = (level + 1) * (cfg.height / (maxLevel + 2));

    nodesAtLevel.forEach((node, index) => {
      const x = ((index + 1) * cfg.width) / (nodesAtLevel.length + 1);
      node.x = x;
      node.y = y;
    });
  }

  return Array.from(nodeMap.values());
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
