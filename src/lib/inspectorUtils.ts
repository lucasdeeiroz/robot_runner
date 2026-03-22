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
 * Transforms coordinates if there is an orientation mismatch between the UI dump and the screenshot.
 * Handles the case where the screenshot might be rotated relative to the XML bounds.
 */
export function transformBounds(
    bounds: { x: number; y: number; w: number; h: number },
    xmlRootWidth: number,
    xmlRootHeight: number,
    actualImgWidth: number,
    actualImgHeight: number
): { x: number; y: number; w: number; h: number } {
    // Detect if we need to swap/rotate
    const xmlIsPortrait = xmlRootHeight > xmlRootWidth;
    const imgIsPortrait = actualImgHeight > actualImgWidth;

    if (xmlIsPortrait !== imgIsPortrait) {
        // Simple swap for orientation mismatch (Landscape screenshot vs Portrait XML)
        // This assumes the coordinates are relative to the top-left in the current orientation
        // but the bounds themselves might need swapping if it's a 90deg rotation.

        // Usually, Android dumps in portrait (e.g. 1080x2400) even if rotated,
        // but some systems might dump in the current orientation (2400x1080).
        // If we have a mismatch, we likely need to "project" the portrait coordinates onto a landscape canvas.

        // Calculate normalized positions (0-1)
        const nx = bounds.x / xmlRootWidth;
        const ny = bounds.y / xmlRootHeight;
        const nw = bounds.w / xmlRootWidth;
        const nh = bounds.h / xmlRootHeight;

        // Project onto landscape
        // Note: Simple scaling might be enough if the "stretched" look is just a scaling bug,
        // but sometimes the axes are swapped.
        return {
            x: nx * actualImgWidth,
            y: ny * actualImgHeight,
            w: nw * actualImgWidth,
            h: nh * actualImgHeight
        };
    }

    return bounds;
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

    // If node has no bounds but has children, compute a bounding box
    if (!node.bounds && node.children.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasValidChild = false;
        node.children.forEach(c => {
            if (c.bounds) {
                hasValidChild = true;
                minX = Math.min(minX, c.bounds.x);
                minY = Math.min(minY, c.bounds.y);
                maxX = Math.max(maxX, c.bounds.x + c.bounds.w);
                maxY = Math.max(maxY, c.bounds.y + c.bounds.h);
            }
        });
        if (hasValidChild) {
            node.bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
    }

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
/**
 * Finds all nodes matching a given locator string.
 * Supports XPath, ID, Accessibility ID, Name, or ClassName.
 * Now supports top-level AND and OR logic (e.g. "id=foo OR text=bar").
 */
export function findNodesByLocator(root: InspectorNode, locator: string): InspectorNode[] {
    const results: InspectorNode[] = [];
    if (!locator) return results;

    const trimmed = locator.trim().replace(/\\n/g, '\n').replace(/\\t/g, '\t');

    // 1. Top-level OR Support
    if (trimmed.includes(' OR ')) {
        const parts = trimmed.split(/\s+OR\s+/);
        const resultSet = new Set<string>();
        const finalResults: InspectorNode[] = [];

        parts.forEach(p => {
            const subResults = findNodesByLocator(root, p.trim());
            subResults.forEach(node => {
                if (!resultSet.has(node.id)) {
                    resultSet.add(node.id);
                    finalResults.push(node);
                }
            });
        });
        return finalResults;
    }

    // 2. Top-level AND Support
    if (trimmed.includes(' AND ')) {
        const parts = trimmed.split(/\s+AND\s+/);
        let currentResults: InspectorNode[] = [];

        parts.forEach((p, idx) => {
            const subResults = findNodesByLocator(root, p.trim());
            if (idx === 0) {
                currentResults = subResults;
            } else {
                currentResults = currentResults.filter(node => subResults.some(sn => sn.id === node.id));
            }
        });
        return currentResults;
    }

    // 3. UiAutomator Support: new UiSelector().text("...")
    if (trimmed.includes('UiSelector()')) {
        const methodMatch = trimmed.match(/\.\w+\s*\((\s*["'][\s\S]*?["']\s*)\)/g);
        if (methodMatch) {
            const search = (node: InspectorNode) => {
                let matchesAll = true;
                methodMatch.forEach(m => {
                    const parts = m.match(/\.(\w+)\s*\(\s*["']([\s\S]*?)["']\s*\)/);
                    if (parts) {
                        const [, method, val] = parts;
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
                    }
                });
                if (matchesAll) results.push(node);
                node.children.forEach(search);
            };
            search(root);
            if (results.length > 0) return results;
        }
    }

    // 4. Regex Support: regex:.*button.*
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
        } catch (e) { }
    }

    // 5. XPath Support
    if (trimmed.startsWith('/') || trimmed.startsWith('//')) {
        const searchByXPath = (node: InspectorNode) => {
            const xpathParts = trimmed.match(/^\/\/(.*?)\s*\[([\s\S]*)\]$/);
            if (!xpathParts) {
                const simpleTagMatch = trimmed.match(/^\/\/(.*?)$/);
                if (simpleTagMatch) {
                    const [, tag] = simpleTagMatch;
                    const matchesTag = tag === '*' || tag === node.tagName || node.tagName.endsWith('.' + tag) || node.attributes['class'] === tag;
                    if (matchesTag) results.push(node);
                }
                node.children.forEach(searchByXPath);
                return;
            }

            const [_, tag, predicates] = xpathParts;
            const matchesTag = tag === '*' || tag === node.tagName || node.tagName.endsWith('.' + tag) || node.attributes['class'] === tag;
            if (!matchesTag) {
                node.children.forEach(searchByXPath);
                return;
            }

            // Enhanced Predicate logic: supports ' and ' & ' or '
            // This is a naive split/evaluator
            const parts = predicates.split(/\s+OR\s+/i);
            let anyOrMatch = false;

            for (const OrPart of parts) {
                const andConds = OrPart.split(/\s+AND\s+/i);
                let allAndMatch = true;

                for (const cond of andConds) {
                    const c = cond.trim();
                    let match = false;

                    const simpleMatch = c.match(/^@(.*?)\s*=\s*['"]([\s\S]*?)['"]$/);
                    const containsMatch = c.match(/^contains\s*\(\s*@(.*?)\s*,\s*['"]([\s\S]*?)['"]\s*\)$/);
                    const startsWithMatch = c.match(/^starts-with\s*\(\s*@(.*?)\s*,\s*['"]([\s\S]*?)['"]\s*\)$/);
                    const endsWithMatch = c.match(/^(?:ends-with|substring)\s*\(\s*@(.*?)\s*,\s*.*?['"]([\s\S]*?)['"]\s*\)$/) ||
                        c.match(/^ends-with\s*\(\s*@([\s\S]*?)\s*,\s*['"]([\s\S]*?)['"]\s*\)$/);
                    const regexMatch = c.match(/^matches\s*\(\s*@(.*?)\s*,\s*['"]([\s\S]*?)['"]\s*\)$/);

                    if (simpleMatch) {
                        const [_, attr, val] = simpleMatch;
                        if (node.attributes[attr] === val) match = true;
                    } else if (containsMatch) {
                        const [_, attr, val] = containsMatch;
                        if (node.attributes[attr]?.includes(val)) match = true;
                    } else if (startsWithMatch) {
                        const [_, attr, val] = startsWithMatch;
                        if (node.attributes[attr]?.startsWith(val)) match = true;
                    } else if (endsWithMatch) {
                        const [_, attr, val] = endsWithMatch;
                        if (node.attributes[attr]?.endsWith(val)) match = true;
                    } else if (regexMatch) {
                        const [_, attr, val] = regexMatch;
                        try {
                            const re = new RegExp(val);
                            if (re.test(node.attributes[attr] || "")) match = true;
                        } catch { }
                    }

                    if (!match) { allAndMatch = false; break; }
                }

                if (allAndMatch) { anyOrMatch = true; break; }
            }

            if (anyOrMatch) results.push(node);
            node.children.forEach(searchByXPath);
        };

        searchByXPath(root);
        return results;
    }

    // 6. Default Fallback
    function search(node: InspectorNode) {
        const attr = node.attributes;
        const locatorLower = locator.toLowerCase();
        const matches =
            (attr['resource-id'] && attr['resource-id'].toLowerCase().includes(locatorLower)) ||
            (attr['content-desc'] && attr['content-desc'].toLowerCase().includes(locatorLower)) ||
            (attr['text'] && attr['text'].toLowerCase().includes(locatorLower)) ||
            (attr['class'] && attr['class'].toLowerCase().includes(locatorLower)) ||
            (node.tagName && node.tagName.toLowerCase().includes(locatorLower));

        if (matches) results.push(node);
        node.children.forEach(search);
    }
    search(root);
    return results;
}

/**
 * Generates an optimized XPath for the given node.
 * Priorities: resource-id > text > content-desc > class + index
 */
export function generateXPath(node: InspectorNode, attr?: string, type: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' = 'equals', addons: string[] = []): string {
    if (!node.parent) return '/*';

    const attributes = node.attributes;
    const className = attributes['class'] || '*';
    const preferredAttr = attr || (attributes['resource-id'] ? 'resource-id' : attributes['text'] ? 'text' : attributes['content-desc'] ? 'content-desc' : undefined);

    if (preferredAttr && attributes[preferredAttr]) {
        const val = attributes[preferredAttr];
        let base = "";
        switch (type) {
            case 'contains': base = `//${className}[contains(@${preferredAttr}, "${val}")]`; break;
            case 'startsWith': base = `//${className}[starts-with(@${preferredAttr}, "${val}")]`; break;
            case 'endsWith': base = `//${className}[ends-with(@${preferredAttr}, "${val}")]`; break;
            case 'matches': base = `//${className}[matches(@${preferredAttr}, "${val}")]`; break;
            default: base = `//${className}[@${preferredAttr}="${val}"]`;
        }

        if (addons.length > 0) {
            const extra = addons.filter(a => attributes[a] !== undefined && attributes[a] !== null && attributes[a] !== '').map(a => `@${a}="${attributes[a]}"`).join(' and ');
            base = base.replace(/\]$/, ` and ${extra}]`);
        }
        return base;
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
    attr?: 'resource-id' | 'content-desc' | 'text' | 'class' | 'auto',
    type: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches',
    useUiSelectorWrapper: boolean,
    addons?: string[]
}): string {
    const attributes = node.attributes;
    const preferredAttr = (options.attr === 'auto' || !options.attr)
        ? (attributes['resource-id'] ? 'resource-id' : attributes['content-desc'] ? 'content-desc' : attributes['text'] ? 'text' : 'class')
        : options.attr;
    const value = attributes[preferredAttr] || "";

    let method = "";
    switch (preferredAttr) {
        case 'resource-id': method = "resourceId"; break;
        case 'content-desc': method = "description"; break;
        case 'text': method = "text"; break;
        case 'class': method = "className"; break;
        default: method = "text"; break;
    }

    let op = "";
    switch (options.type) {
        case 'equals': op = ""; break;
        case 'contains': op = "Contains"; break;
        case 'startsWith': op = "StartsWith"; break;
        case 'endsWith': op = "EndsWith"; break;
        case 'matches': op = "Matches"; break;
    }

    let selectorArr = [`${method}${op}("${value}")`];

    if (options.addons && options.addons.length > 0) {
        options.addons.forEach(a => {
            let m = "";
            switch (a) {
                case 'resource-id': m = "resourceId"; break;
                case 'content-desc': m = "description"; break;
                case 'text': m = "text"; break;
                case 'class': m = "className"; break;
                default: m = a.replace(/-([a-z])/g, g => g[1].toUpperCase());
            }
            const attrValue = node.attributes[a];
            if (attrValue === undefined || attrValue === null || attrValue === "") {
                return;
            }
            selectorArr.push(`${m}("${attrValue}")`);
        });
    }

    const fullSelector = selectorArr.join('.');
    return options.useUiSelectorWrapper ? `new UiSelector().${fullSelector}` : fullSelector;
}
