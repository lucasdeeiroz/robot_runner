import { LogNode } from "./robotParser";

export interface FlatLogNode {
    id: string;
    node: LogNode;
    depth: number;
    parentType?: string;
    isLast: boolean;
    hasChildren: boolean;
    hasVisibleChildren: boolean;
}

/**
 * Recursively flattens a tree of LogNodes into a visible flat list.
 */
export function flattenLogNodes(
    nodes: LogNode[],
    expandedIds: Set<string>,
    depth: number = 0,
    parentType?: string
): FlatLogNode[] {
    const flattened: FlatLogNode[] = [];
    
    const processNodes = (currentNodes: LogNode[], currentDepth: number, currentParentType?: string) => {
        const len = currentNodes.length;
        for (let i = 0; i < len; i++) {
            const node = currentNodes[i];
            const isExpanded = expandedIds.has(node.id);
            
            const nodeWithChildren = node as any;
            const children = nodeWithChildren.children as LogNode[] | undefined;
            const hasChildren = (children && children.length > 0) || (node as any).hasChildren;

            flattened.push({
                id: node.id,
                node,
                depth: currentDepth,
                parentType: currentParentType,
                isLast: i === len - 1,
                hasChildren,
                hasVisibleChildren: isExpanded && !!children
            });

            if (isExpanded && children) {
                processNodes(children, currentDepth + 1, node.type);
            }
        }
    };

    processNodes(nodes, depth, parentType);
    return flattened;
}
