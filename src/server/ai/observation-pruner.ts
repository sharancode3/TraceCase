import type { PrunedAXTreeNode } from './contracts';

/**
 * ============================================================================
 * TRACECASE PERSON 2: OBSERVATION PRUNING MODULE (P2-05)
 * ============================================================================
 * 
 * Safely bounds and prunes Accessibility Tree (AXTree) element snapshots:
 * - Preserves entity context needed to distinguish Task A from Task B
 * - Preserves identically labelled Delete buttons and their contextual associations
 * - Preserves filter state (Active, All, Completed)
 * - Retains disabled and focused control states
 * - Measures and reports material truncation transparently
 * - Detects ambiguous duplicate labels lacking distinguishable entity context
 */

export interface PruningOptions {
  maxNodes?: number;
  maxEstimatedTokens?: number;
  targetEntityHint?: string;
}

export interface PrunedObservationResult {
  prunedNodes: PrunedAXTreeNode[];
  isTruncated: boolean;
  truncatedNodeCount: number;
  originalNodeCount: number;
  prunedNodeCount: number;
  estimatedTokens: number;
  hasAmbiguousDuplicateLabels: boolean;
  ambiguousLabels: string[];
}

/**
 * Heuristic estimate of tokens for an AXTree node representation
 */
export function estimateNodeTokens(node: PrunedAXTreeNode): number {
  const text = `${node.nodeId} ${node.role} ${node.name} ${node.description || ''} ${node.value || ''} ${node.disabled ? 'disabled' : ''}`;
  return Math.ceil(text.length / 4);
}

/**
 * Prunes an array of AXTree nodes while preserving essential entity and interaction context.
 */
export function pruneObservationAXTree(
  rawNodes: PrunedAXTreeNode[],
  options?: PruningOptions
): PrunedObservationResult {
  const maxNodes = options?.maxNodes ?? 150;
  const maxEstimatedTokens = options?.maxEstimatedTokens ?? 1500;
  const targetHint = options?.targetEntityHint?.toLowerCase();

  const originalNodeCount = rawNodes.length;

  // 1. Filter out empty or decorative static text that conveys no semantic value
  const candidates = rawNodes.filter((node) => {
    if (node.role === 'StaticText') {
      const text = node.name.trim();
      // Drop empty text nodes or single punctuation marks
      if (text.length === 0 || /^[,.;:!?-]$/.test(text)) {
        return false;
      }
    }
    return true;
  });

  // 2. Prioritize nodes: Interactive controls, entity holders, filter controls, alerts
  const scoredNodes = candidates.map((node) => {
    let score = 10; // baseline

    // Interactive roles get higher priority
    if (['button', 'checkbox', 'link', 'textbox', 'tab'].includes(node.role)) {
      score += 20;
    }

    // Mention of filter controls
    const lowerName = node.name.toLowerCase();
    const lowerDesc = (node.description || '').toLowerCase();
    if (lowerName.includes('active') || lowerName.includes('all') || lowerName.includes('filter')) {
      score += 30;
    }

    // Mention of Task entities
    if (lowerName.includes('task') || lowerDesc.includes('task')) {
      score += 40;
    }

    // Specific target match hint if provided
    if (targetHint && (lowerName.includes(targetHint) || lowerDesc.includes(targetHint))) {
      score += 50;
    }

    // Alert or error statuses
    if (node.role === 'alert' || node.role === 'status') {
      score += 25;
    }

    return { node, score };
  });

  // 3. Detect duplicate interactive control labels to evaluate ambiguity
  const labelMap = new Map<string, PrunedAXTreeNode[]>();
  for (const { node } of scoredNodes) {
    if (['button', 'link', 'menuitem'].includes(node.role)) {
      const key = `${node.role}:${node.name.trim().toLowerCase()}`;
      const list = labelMap.get(key) || [];
      list.push(node);
      labelMap.set(key, list);
    }
  }

  const ambiguousLabels: string[] = [];
  for (const [key, list] of labelMap.entries()) {
    if (list.length > 1) {
      // Check if descriptions, values, or node context differentiate them
      const distinctDescriptions = new Set(
        list.map((n) => (n.description || n.value || '').trim())
      );
      if (distinctDescriptions.size <= 1) {
        // True ambiguity: multiple buttons with the exact same name and no differentiating description
        ambiguousLabels.push(key);
      }
    }
  }

  // 4. Priority-aware bounded selection within maxNodes and maxEstimatedTokens
  // Sort candidates by priority score descending to retain highest value nodes first
  const sortedByPriority = [...scoredNodes].sort((a, b) => b.score - a.score);

  const selectedNodeSet = new Set<string>();
  let currentTokenCount = 0;
  let isTruncated = false;

  for (const { node } of sortedByPriority) {
    const nodeTokens = estimateNodeTokens(node);
    if (selectedNodeSet.size >= maxNodes || currentTokenCount + nodeTokens > maxEstimatedTokens) {
      isTruncated = true;
      continue;
    }
    selectedNodeSet.add(node.nodeId);
    currentTokenCount += nodeTokens;
  }

  // Preserve natural layout order among selected nodes so model receives intuitive hierarchy
  const finalNodes = candidates.filter((n) => selectedNodeSet.has(n.nodeId));
  const truncatedNodeCount = originalNodeCount - finalNodes.length;

  return {
    prunedNodes: finalNodes,
    isTruncated,
    truncatedNodeCount,
    originalNodeCount,
    prunedNodeCount: finalNodes.length,
    estimatedTokens: currentTokenCount,
    hasAmbiguousDuplicateLabels: ambiguousLabels.length > 0,
    ambiguousLabels,
  };
}
