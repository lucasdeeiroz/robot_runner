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

    } else {

    }

    // Link parent for children
    node.children.forEach(c => c.parent = node);

    return node;
}

/**
 * Finds all nodes that contain the given coordinates.
 * Returns an array sorted by area (ascending).
 */
export function findNodesAtCoords(node: InspectorNode, x: number, y: number): InspectorNode[] {
    const candidates: InspectorNode[] = [];

    function traverse(currentNode: InspectorNode) {
        // If node has bounds, check intersection
        if (currentNode.bounds) {
            const { x: bx, y: by, w, h } = currentNode.bounds;
            if (x >= bx && x <= bx + w && y >= by && y <= by + h) {
                candidates.push(currentNode);
            }
        }

        // Always verify children
        if (currentNode.children) {
            currentNode.children.forEach(traverse);
        }
    }

    traverse(node);

    // Sort by area (ascending)
    candidates.sort((a, b) => {
        const areaA = (a.bounds?.w || 0) * (a.bounds?.h || 0);
        const areaB = (b.bounds?.w || 0) * (b.bounds?.h || 0);

        return areaA - areaB;
    });

    return candidates;
}

/**
 * Finds all nodes matching a given locator string.
 * Supports XPath, ID, Accessibility ID, Name, or ClassName.
 */
export function findNodesByLocator(root: InspectorNode, locator: string): InspectorNode[] {
    const results: InspectorNode[] = [];
    if (!locator) return results;

    const trimmed = locator.trim();

    // 1. UiAutomator Support: new UiSelector().text("...")
    if (trimmed.includes('UiSelector()')) {
        // Simple parser for common methods
        const methodMatch = trimmed.match(/\.\w+\s*\(.*?\)/g);
        if (methodMatch) {
            const search = (node: InspectorNode) => {
                let matchesAll = true;
                methodMatch.forEach(m => {
                    const parts = m.match(/\.(\w+)\s*\(\s*["'](.*?)["']\s*\)/);
                    if (parts) {
                        const [, method, val] = parts;

                        // Extract base method and operator
                        let baseMethod = method;
                        let op: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' = 'equals';

                        if (method.endsWith('Contains')) {
                            baseMethod = method.replace('Contains', '');
                            op = 'contains';
                        } else if (method.endsWith('StartsWith')) {
                            baseMethod = method.replace('StartsWith', '');
                            op = 'startsWith';
                        } else if (method.endsWith('EndsWith')) {
                            baseMethod = method.replace('EndsWith', '');
                            op = 'endsWith';
                        } else if (method.endsWith('Matches')) {
                            baseMethod = method.replace('Matches', '');
                            op = 'matches';
                        }

                        const attrMap: Record<string, string> = {
                            'resourceId': 'resource-id',
                            'description': 'content-desc',
                            'text': 'text',
                            'className': 'class'
                        };
                        const attr = attrMap[baseMethod] || baseMethod;
                        const nodeVal = node.attributes[attr] || "";

                        switch (op) {
                            case 'contains': if (!nodeVal.includes(val)) matchesAll = false; break;
                            case 'startsWith': if (!nodeVal.startsWith(val)) matchesAll = false; break;
                            case 'endsWith': if (!nodeVal.endsWith(val)) matchesAll = false; break;
                            case 'matches':
                                try {
                                    const re = new RegExp(val);
                                    if (!re.test(nodeVal)) matchesAll = false;
                                } catch { matchesAll = false; }
                                break;
                            default: if (nodeVal !== val) matchesAll = false;
                        }
                    } else if (m.includes('index(')) {
                        // Handle numeric indexes if needed, but primary focus is attribute methods
                    }
                });
                if (matchesAll) results.push(node);
                node.children.forEach(search);
            };
            search(root);
            if (results.length > 0) return results;
        }
    }

    // 2. Regex Support: regex:.*button.*
    if (trimmed.startsWith('regex:')) {
        const pattern = trimmed.substring(6);
        try {
            const re = new RegExp(pattern, 'i');
            const search = (node: InspectorNode) => {
                const matches = Object.values(node.attributes).some(v => re.test(String(v))) || re.test(node.tagName);
                if (matches) results.push(node);
                node.children.forEach(search);
            };
            search(root);
            return results;
        } catch (e) { /* invalid regex fallback */ }
    }

    // 3. XPath Support
    if (trimmed.startsWith('/') || trimmed.startsWith('//')) {
        // Precise Match with generateXPath
        const findByExactXPath = (node: InspectorNode) => {
            if (generateXPath(node) === trimmed) results.push(node);
            node.children.forEach(findByExactXPath);
        };
        findByExactXPath(root);
        if (results.length > 0) return results;

        // Attribute Match: //tag[@attr="value"]
        const attrMatch = trimmed.match(/^\/\/(.*?)\s*\[\s*@(.*?)\s*=\s*['"](.*?)['"]\s*\]$/);
        if (attrMatch) {
            const [, tag, attr, val] = attrMatch;
            const search = (node: InspectorNode) => {
                const nodeTag = node.tagName.split('.').pop() || '*';
                const matchesTag = tag === '*' || tag === node.tagName || nodeTag === tag || node.attributes['class'] === tag;
                const matchesAttr = node.attributes[attr] === val;
                if (matchesTag && matchesAttr) results.push(node);
                node.children.forEach(search);
            };
            search(root);
            if (results.length > 0) return results;
        }

        // Starts-with Match: //tag[starts-with(@attr, "value")]
        const startsWithMatch = trimmed.match(/^\/\/(.*?)\s*\[\s*starts-with\s*\(\s*@(.*?)\s*,\s*['"](.*?)['"]\s*\)\s*\]$/);
        if (startsWithMatch) {
            const [, tag, attr, val] = startsWithMatch;
            const search = (node: InspectorNode) => {
                const nodeTag = node.tagName.split('.').pop() || '*';
                const matchesTag = tag === '*' || tag === node.tagName || nodeTag === tag || node.attributes['class'] === tag;
                const matchesAttr = node.attributes[attr]?.startsWith(val);
                if (matchesTag && matchesAttr) results.push(node);
                node.children.forEach(search);
            };
            search(root);
            if (results.length > 0) return results;
        }

        // Ends-with Match: //tag[ends-with(@attr, "value")]
        const endsWithMatch = trimmed.match(/^\/\/(.*?)\s*\[\s*ends-with\s*\(\s*@(.*?)\s*,\s*['"](.*?)['"]\s*\)\s*\]$/) ||
            trimmed.match(/^\/\/(.*?)\s*\[\s*substring\s*\(\s*@(.*?)\s*,\s*string-length\s*\(\s*@.*?\s*\)\s*-\s*string-length\s*\(\s*['"](.*?)['"]\s*\)\s*\+\s*1\s*\)\s*=\s*['"].*?['"]\s*\]$/);
        if (endsWithMatch) {
            const [, tag, attr, val] = endsWithMatch;
            const search = (node: InspectorNode) => {
                const nodeTag = node.tagName.split('.').pop() || '*';
                const matchesTag = tag === '*' || tag === node.tagName || nodeTag === tag || node.attributes['class'] === tag;
                const matchesAttr = node.attributes[attr]?.endsWith(val);
                if (matchesTag && matchesAttr) results.push(node);
                node.children.forEach(search);
            };
            search(root);
            if (results.length > 0) return results;
        }

        // Matches Match: //tag[matches(@attr, "value")]
        const matchesMatch = trimmed.match(/^\/\/(.*?)\s*\[\s*matches\s*\(\s*@(.*?)\s*,\s*['"](.*?)['"]\s*\)\s*\]$/);
        if (matchesMatch) {
            const [, tag, attr, val] = matchesMatch;
            const search = (node: InspectorNode) => {
                const nodeTag = node.tagName.split('.').pop() || '*';
                const matchesTag = tag === '*' || tag === node.tagName || nodeTag === tag || node.attributes['class'] === tag;
                try {
                    const re = new RegExp(val);
                    const matchesAttr = re.test(node.attributes[attr] || "");
                    if (matchesTag && matchesAttr) results.push(node);
                } catch { }
                node.children.forEach(search);
            };
            search(root);
            if (results.length > 0) return results;
        }

        // Contains Match: //tag[contains(@attr, "value")]
        const containsMatch = trimmed.match(/^\/\/(.*?)\s*\[\s*contains\s*\(\s*@(.*?)\s*,\s*['"](.*?)['"]\s*\)\s*\]$/);
        if (containsMatch) {
            const [, tag, attr, val] = containsMatch;
            const search = (node: InspectorNode) => {
                const nodeTag = node.tagName.split('.').pop() || '*';
                const matchesTag = tag === '*' || tag === node.tagName || nodeTag === tag || node.attributes['class'] === tag;
                const matchesAttr = node.attributes[attr]?.includes(val);
                if (matchesTag && matchesAttr) results.push(node);
                node.children.forEach(search);
            };
            search(root);
            if (results.length > 0) return results;
        }
    }

    // 4. Default Fallback Search
    function search(node: InspectorNode) {
        const attr = node.attributes;
        const matches =
            (attr['resource-id'] && attr['resource-id'].includes(locator)) ||
            (attr['content-desc'] && attr['content-desc'].includes(locator)) ||
            (attr['text'] && attr['text'].includes(locator)) ||
            (attr['class'] && attr['class'].includes(locator)) ||
            (node.tagName && node.tagName.includes(locator));

        if (matches) {
            results.push(node);
        }
        node.children.forEach(search);
    }

    search(root);
    return results;
}

/**
 * Generates an optimized XPath for the given node.
 * Priorities: resource-id > text > content-desc > class + index
 */
export function generateXPath(node: InspectorNode, attr?: string, type: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' = 'equals'): string {
    if (!node.parent) return '/*';

    const attributes = node.attributes;
    const className = attributes['class'] || '*';
    const preferredAttr = attr || (attributes['resource-id'] ? 'resource-id' : attributes['text'] ? 'text' : attributes['content-desc'] ? 'content-desc' : undefined);

    if (preferredAttr && attributes[preferredAttr]) {
        const val = attributes[preferredAttr];
        switch (type) {
            case 'contains': return `//${className}[contains(@${preferredAttr}, "${val}")]`;
            case 'startsWith': return `//${className}[starts-with(@${preferredAttr}, "${val}")]`;
            case 'endsWith': return `//${className}[ends-with(@${preferredAttr}, "${val}")]`;
            case 'matches': return `//${className}[matches(@${preferredAttr}, "${val}")]`;
            default: return `//${className}[@${preferredAttr}="${val}"]`;
        }
    }

    let path = '';
    let current: InspectorNode | undefined = node;

    while (current && current.parent) {
        const parentNode: InspectorNode = current.parent;
        const siblings = parentNode.children.filter(c => c.attributes['class'] === current?.attributes['class']);
        const index = siblings.indexOf(current) + 1;

        path = `/${current.attributes['class']}[${index}]` + path;
        current = parentNode;
    }

    return '/' + path;
}

/**
 * Generates a UiAutomator selector string.
 */
export function generateUiSelector(node: InspectorNode, options: {
    attr: 'resource-id' | 'content-desc' | 'text',
    type: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches',
    useUiSelectorWrapper: boolean
}): string {
    const value = node.attributes[options.attr] || "";
    let method = "";

    switch (options.attr) {
        case 'resource-id': method = "resourceId"; break;
        case 'content-desc': method = "description"; break;
        case 'text': method = "text"; break;
    }

    let op = "";
    switch (options.type) {
        case 'equals': op = ""; break;
        case 'contains': op = "Contains"; break;
        case 'startsWith': op = "StartsWith"; break;
        case 'endsWith': op = "EndsWith"; break;
        case 'matches': op = "Matches"; break;
    }

    const selector = `new UiSelector().${method}${op}("${value}")`;
    return options.useUiSelectorWrapper ? selector : `${method}${op}("${value}")`;
}
