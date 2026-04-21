import { flattenLogNodes } from "./logTreeFlattening";
import { LogNode } from "./robotParser";

function generateLargeFlatTree(count: number): LogNode[] {
    const root: LogNode[] = [];
    for (let i = 0; i < count; i++) {
        const childrenCount = i % 100 === 0 ? 50 : 0; // Every 100th node has 50 children
        const children: LogNode[] = [];
        for (let j = 0; j < childrenCount; j++) {
            children.push({
                id: `child-${i}-${j}`,
                name: `Child ${i}-${j}`,
                type: 'keyword',
                status: 'PASS',
                duration: '0.01s'
            } as any);
        }
        root.push({
            id: `node-${i}`,
            name: `Top Node ${i}`,
            type: 'test',
            status: 'PASS',
            duration: '0.1s',
            children: children
        } as any);
    }
    return root;
}

export function runFlatteningStressTest(totalTopNodes: number = 35000) {
    console.log(`Generating tree with ${totalTopNodes} top nodes...`);
    const tree = generateLargeFlatTree(totalTopNodes);

    const expandedIds = new Set<string>();
    function collectIds(nodes: LogNode[]) {
        nodes.forEach(n => {
            expandedIds.add(n.id);
            if ((n as any).children) collectIds((n as any).children);
        });
    }
    collectIds(tree);

    console.log(`Running flattenLogNodes for ${expandedIds.size} nodes...`);
    const start = performance.now();
    const flattened = flattenLogNodes(tree, expandedIds);
    const end = performance.now();

    console.log(`Result: ${flattened.length} flat rows`);
    console.log(`Time taken: ${(end - start).toFixed(2)}ms`);

    if (end - start > 16) {
        console.warn("⚠️ Performance Warning: Flattening took more than 16ms (one frame)!");
    } else {
        console.log("✅ Performance OK: Flattening completed within one frame.");
    }
}

if (import.meta.env.DEV && (globalThis as any).__RUN_FLATTENING_STRESS_TEST__) {
    runFlatteningStressTest();
}
