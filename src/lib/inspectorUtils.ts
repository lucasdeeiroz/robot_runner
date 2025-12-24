export interface InspectorNode {
    id: string; // generated unique id
    tagName: string;
    attributes: Record<string, string>;
    children: InspectorNode[];
    bounds?: { x: number; y: number; w: number; h: number };
    parent?: InspectorNode;
}

/**
 * Parses Android uiautomator bounds string: "[0,0][1080,2400]"
 */
export function parseBounds(boundsStr: string): { x: number; y: number; w: number; h: number } | undefined {
    // Regex matches [x1,y1][x2,y2]
    const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!match) return undefined;

    const x1 = parseInt(match[1], 10);
    const y1 = parseInt(match[2], 10);
    const x2 = parseInt(match[3], 10);
    const y2 = parseInt(match[4], 10);

    return {
        x: x1,
        y: y1,
        w: x2 - x1,
        h: y2 - y1
    };
}

/**
 * Recursively converts the raw fast-xml-parser object into a cleaner InspectorNode tree.
 * Adds computed bounds and parent references.
 */
export function transformXmlToTree(rawNode: any, parent?: InspectorNode): InspectorNode {
    const attributes: Record<string, string> = {};
    const children: InspectorNode[] = [];

    // keys starting with @ are attributes in fast-xml-parser (usually, dependent on config)
    // or if we configured ignoreAttributes: false, they might be direct properties.
    // Based on InspectorPage config: ignoreAttributes: false, attributeNamePrefix: ""

    const decodeHtmlEntities = (str: string): string => {
        if (!str) return str;
        return str
            .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    };

    Object.keys(rawNode).forEach(key => {
        if (key === 'node' || key === 'hierarchy') {
            const kids = Array.isArray(rawNode[key]) ? rawNode[key] : [rawNode[key]];
            kids.forEach((k: any) => {
                children.push(transformXmlToTree(k, undefined));
            });
        } else if (typeof rawNode[key] !== 'object' && key !== '_text') {
            attributes[key] = decodeHtmlEntities(String(rawNode[key]));
        }
    });

    // Android dumps usually strictly respect "node" as the tag name for elements
    // The root might be "hierarchy"
    const tagName = rawNode['class'] || 'node';

    const node: InspectorNode = {
        id: Math.random().toString(36).substr(2, 9),
        tagName: tagName,
        attributes: attributes,
        children: children,
        parent: parent
    };

    if (attributes['bounds']) {
        node.bounds = parseBounds(attributes['bounds']);
        // console.log("Parsed bounds for", node.tagName, attributes['bounds'], node.bounds);
    } else {
        // console.log("No bounds for", node.tagName, attributes);
    }

    // Link parent for children
    node.children.forEach(c => c.parent = node);

    return node;
}

/**
 * Finds the deepest node that contains the given coordinates.
 */
export function findNodeAtCoords(node: InspectorNode, x: number, y: number): InspectorNode | null {
    // Check if point is inside current node (if it has bounds)
    if (node.bounds) {
        if (x < node.bounds.x || x > node.bounds.x + node.bounds.w ||
            y < node.bounds.y || y > node.bounds.y + node.bounds.h) {
            return null;
        }
    }

    // Search children (reverse order for z-index)
    // Even if this node has no bounds (like root hierarchy), we search children
    if (node.children) {
        for (let i = node.children.length - 1; i >= 0; i--) {
            const found = findNodeAtCoords(node.children[i], x, y);
            if (found) return found;
        }
    }

    // If we are here:
    // 1. It matched our bounds (if we had them)
    // 2. None of our children claimed the point
    // So it's us, BUT only if we have bounds (don't return invisible container)
    return node.bounds ? node : null;
}

/**
 * Generates an optimized XPath for the given node.
 * Priorities: resource-id > text > content-desc > class + index
 */
export function generateXPath(node: InspectorNode): string {
    if (!node.parent) return '/*'; // Root

    const attributes = node.attributes;
    const className = attributes['class'] || '*';

    // 1. Resource ID (highly reliable)
    if (attributes['resource-id']) {
        return `//${className}[@resource-id="${attributes['resource-id']}"]`;
    }

    // 2. Text (visible text)
    if (attributes['text']) {
        return `//${className}[@text="${attributes['text']}"]`;
    }

    // 3. Content Description (accessibility)
    if (attributes['content-desc']) {
        return `//${className}[@content-desc="${attributes['content-desc']}"]`;
    }

    // 4. Fallback: hierarchy index
    // Note: This is fragile. Ideally we climb up to find a unique parent.
    // For simplicity V1: absolute path from nearest unique parent or full path.

    // Let's try to build a chain.
    let path = '';
    let current: InspectorNode | undefined = node;

    while (current && current.parent) {
        const parentNode: InspectorNode = current.parent;
        // Find index among siblings with same class
        const siblings = parentNode.children.filter(c => c.attributes['class'] === current?.attributes['class']);
        const index = siblings.indexOf(current) + 1;

        path = `/${current.attributes['class']}[${index}]` + path;
        current = parentNode;
    }

    return '/' + path; // naive full path
}
