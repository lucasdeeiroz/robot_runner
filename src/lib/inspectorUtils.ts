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
    if (xmlRootWidth === 0 || xmlRootHeight === 0) return bounds;

    // Calculate normalized positions (0-1) relative to the original XML resolution
    const nx = bounds.x / xmlRootWidth;
    const ny = bounds.y / xmlRootHeight;
    const nw = bounds.w / xmlRootWidth;
    const nh = bounds.h / xmlRootHeight;

    // Project onto actual image dimensions (which might be resized/compressed)
    // This handles scaling and orientation alignment by mapping normalized coordinates.
    return {
        x: nx * actualImgWidth,
        y: ny * actualImgHeight,
        w: nw * actualImgWidth,
        h: nh * actualImgHeight
    };
}

/**
 * Recursively converts the raw fast-xml-parser object into a cleaner InspectorNode tree.
 * Adds computed bounds and parent references.
 */
/**
 * Recursively converts the raw fast-xml-parser object into a cleaner InspectorNode tree.
 * Agnostic to tag names (handles node, hierarchy, or class-based tags).
 */
export function transformXmlToTree(rawNode: any, parent?: InspectorNode, keyName: string = 'node', isRoot: boolean = true): InspectorNode {
    const attributes: Record<string, string> = {};
    const children: InspectorNode[] = [];

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

    // Iterate over all keys to find children and attributes
    Object.keys(rawNode).forEach(key => {
        const value = rawNode[key];
        
        if (key === '_text') {
            attributes['text'] = decodeHtmlEntities(String(value));
        } else if (Array.isArray(value)) {
            value.forEach((v: any) => {
                if (typeof v === 'object' && v !== null) {
                    children.push(transformXmlToTree(v, undefined, key, false));
                }
            });
        } else if (typeof value === 'object' && value !== null) {
            children.push(transformXmlToTree(value, undefined, key, false));
        } else {
            attributes[key] = decodeHtmlEntities(String(value));
        }
    });

    // Normalize tagName to class name if generic 'node' is used
    let tagName = keyName;
    if (tagName === 'node' && attributes['class']) {
        const fullClass = attributes['class'];
        tagName = fullClass.includes('.') ? fullClass.split('.').pop()! : fullClass;
    }

    const node: InspectorNode = {
        id: Math.random().toString(36).substr(2, 9),
        tagName: tagName,
        attributes: attributes,
        children: children,
        parent: parent
    };

    if (attributes['bounds']) {
        node.bounds = parseBounds(attributes['bounds']);
    } else if (attributes['width'] && attributes['height']) {
        const w = parseInt(attributes['width'], 10);
        const h = parseInt(attributes['height'], 10);
        if (!isNaN(w) && !isNaN(h)) {
            node.bounds = { x: 0, y: 0, w, h };
        }
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

    if (isRoot) {
        // Calculate the bounding box of the entire tree to find the maximum extent of all elements.
        // Android UI Automator coordinates are absolute physical screen coordinates.
        // If the dump only contains a modal/dialog (common on payment terminals or secure screens),
        // the root node bounds may be restricted to the modal, causing viewport scaling mismatch
        // and clipping the modal elements outside the viewport container.
        // Forcing the root bounds to start at (0, 0) and cover all elements' max extent solves this.
        let maxX = 0;
        let maxY = 0;

        const traverseForMax = (n: InspectorNode) => {
            if (n.bounds) {
                maxX = Math.max(maxX, n.bounds.x + n.bounds.w);
                maxY = Math.max(maxY, n.bounds.y + n.bounds.h);
            }
            n.children.forEach(traverseForMax);
        };

        traverseForMax(node);

        const currentBounds = node.bounds;
        if (!currentBounds || currentBounds.x !== 0 || currentBounds.y !== 0 || currentBounds.w < maxX || currentBounds.h < maxY) {
            if (maxX > 0 && maxY > 0) {
                const finalW = currentBounds && currentBounds.x === 0 ? Math.max(currentBounds.w, maxX) : maxX;
                const finalH = currentBounds && currentBounds.y === 0 ? Math.max(currentBounds.h, maxY) : maxY;

                node.bounds = {
                    x: 0,
                    y: 0,
                    w: finalW,
                    h: finalH
                };
            }
        }

        assignInstances(node);
    }

    return node;
}

/**
 * Calculates element occurrence index for its class and sets it on each node as the 'instance' attribute.
 */
export function assignInstances(root: InspectorNode): void {
    const classCounts: Record<string, number> = {};
    function traverse(node: InspectorNode) {
        const className = node.attributes['class'] || node.tagName;
        if (className) {
            if (classCounts[className] === undefined) {
                classCounts[className] = 0;
            }
            node.attributes['instance'] = String(classCounts[className]);
            classCounts[className]++;
        }
        node.children.forEach(traverse);
    }
    traverse(root);
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
export function findNodesByText(root: InspectorNode, query: string): InspectorNode[] {
    const results: InspectorNode[] = [];
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return results;

    function traverse(node: InspectorNode) {
        const text = (node.attributes['text'] || "").toLowerCase();
        const desc = (node.attributes['content-desc'] || "").toLowerCase();
        
        if (text.includes(normalizedQuery) || desc.includes(normalizedQuery) || normalizedQuery.includes(text && text.length > 3 ? text : "___never___")) {
            results.push(node);
        }
        for (const child of node.children) {
            traverse(child);
        }
    }

    traverse(root);
    return results;
}

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

    // 2.1 Support childSelector: parent.childSelector(child)
    if (trimmed.includes('.childSelector')) {
        const parts = trimmed.split('.childSelector');
        if (parts.length === 2) {
            const parentLocator = parts[0].trim();
            const childLocator = parts[1].replace(/^\s*\(\s*new\s+/, '').replace(/\s*\)\s*$/, '').trim();
            const parentNodes = findNodesByLocator(root, parentLocator);
            const finalResults: InspectorNode[] = [];
            parentNodes.forEach(pn => {
                const childNodes = findNodesByLocator(pn, childLocator);
                childNodes.forEach(cn => {
                    if (cn.parent?.id === pn.id && !finalResults.some(r => r.id === cn.id)) {
                        finalResults.push(cn);
                    }
                });
            });
            return finalResults;
        }
    }

    // 2.2 Support fromParent: reference.fromParent(sibling)
    if (trimmed.includes('.fromParent')) {
        const parts = trimmed.split('.fromParent');
        if (parts.length === 2) {
            const refLocator = parts[0].trim();
            const siblingLocator = parts[1].replace(/^\s*\(\s*new\s+/, '').replace(/\s*\)\s*$/, '').trim();
            const refNodes = findNodesByLocator(root, refLocator);
            const finalResults: InspectorNode[] = [];
            refNodes.forEach(rn => {
                if (rn.parent) {
                    const siblingNodes = findNodesByLocator(rn.parent, siblingLocator);
                    siblingNodes.forEach(sn => {
                        if (sn.parent?.id === rn.parent?.id && sn.id !== rn.id && !finalResults.some(r => r.id === sn.id)) {
                            finalResults.push(sn);
                        }
                    });
                }
            });
            return finalResults;
        }
    }

    // 3. UiAutomator Support: new UiSelector().text("...")
    if (trimmed.includes('UiSelector()')) {
        const methodMatch = trimmed.match(/\.\w+\s*\([^)]*\)/g);
        if (methodMatch) {
            const search = (node: InspectorNode) => {
                let matchesAll = true;
                methodMatch.forEach(m => {
                    if (m.startsWith('.instance') || m.startsWith('.childSelector') || m.startsWith('.fromParent')) return;

                    const parts = m.match(/\.(\w+)\s*\(\s*([\s\S]*?)\s*\)/);
                    if (parts) {
                        const [, method, rawVal] = parts;
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

                        // Clean rawVal (could be "string", 'string', true, false, 3)
                        let val: string | boolean | number = rawVal.trim();
                        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                            val = val.slice(1, -1);
                        } else if (val === 'true') {
                            val = true;
                        } else if (val === 'false') {
                            val = false;
                        } else if (/^\d+$/.test(val)) {
                            val = parseInt(val, 10);
                        }

                        const attrMap: Record<string, string> = {
                            'resourceId': 'resource-id',
                            'description': 'content-desc',
                            'text': 'text',
                            'className': 'class',
                            'longClickable': 'long-clickable'
                        };
                        const attr = attrMap[baseMethod] || baseMethod.replace(/([A-Z])/g, '-$1').toLowerCase();
                        const nodeVal = node.attributes[attr];

                        // If it's a boolean check
                        if (typeof val === 'boolean') {
                            const nodeBool = nodeVal === 'true';
                            if (nodeBool !== val) matchesAll = false;
                        }
                        // If it's an integer check
                        else if (typeof val === 'number') {
                            if (baseMethod === 'index') {
                                const nodeInt = parseInt(nodeVal || "0", 10);
                                if (nodeInt !== val) matchesAll = false;
                            }
                        }
                        // String checks
                        else {
                            const nodeString = nodeVal || "";
                            switch (op) {
                                case 'contains': if (!nodeString.includes(val)) matchesAll = false; break;
                                case 'startsWith': if (!nodeString.startsWith(val)) matchesAll = false; break;
                                case 'endsWith': if (!nodeString.endsWith(val)) matchesAll = false; break;
                                case 'matches':
                                    try {
                                        const re = new RegExp(val);
                                        if (!re.test(nodeString)) matchesAll = false;
                                    } catch { matchesAll = false; }
                                    break;
                                default: if (nodeString !== val) matchesAll = false;
                            }
                        }
                    }
                });
                if (matchesAll) results.push(node);
                node.children.forEach(search);
            };
            search(root);

            // Handle instance filter
            const instanceMatch = trimmed.match(/\.instance\s*\(\s*(\d+)\s*\)/);
            if (instanceMatch && results.length > 0) {
                const instanceIndex = parseInt(instanceMatch[1], 10);
                return results[instanceIndex] ? [results[instanceIndex]] : [];
            }

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

    // 5. XPath Support (Robust Evaluator)
    if (trimmed.startsWith('/') || trimmed.startsWith('//')) {
        let path = trimmed;
        // Strip redundancy
        if (path.startsWith('/hierarchy')) path = path.substring(10);
        if (path === '') return [root];

        const checkMatch = (node: InspectorNode, tag: string, predicate: string | null): boolean => {
            // 1. Tag Match
            const matchesTag = tag === '*' || tag === "" || tag === 'node' || 
                             node.tagName === tag || 
                             node.tagName.endsWith('.' + tag) || 
                             node.attributes['class'] === tag ||
                             node.attributes['class']?.endsWith('.' + tag);
            
            if (!matchesTag) return false;

            // 2. Predicate Match
            if (!predicate) return true;

            // Handle numeric index: node[1]
            if (/^\d+$/.test(predicate)) {
                const index = parseInt(predicate, 10);
                if (!node.parent) return index === 1;

                // Standard XPath rule: count siblings that match the SAME tag/criteria
                const matchingSiblings = node.parent.children.filter(c => 
                    tag === '*' || tag === "" || tag === 'node' || 
                    c.tagName === tag || 
                    c.tagName.endsWith('.' + tag) || 
                    c.attributes['class'] === tag ||
                    c.attributes['class']?.endsWith('.' + tag)
                );

                return (matchingSiblings.indexOf(node) + 1) === index;
            }

            // Handle attribute predicates: @attr='val', contains(@attr, 'val'), etc.
            const andConds = predicate.split(/\s+AND\s+/i);
            for (const cond of andConds) {
                const c = cond.trim();
                let match = false;

                const simpleMatch = c.match(/^@(.*?)\s*=\s*['"]([\s\S]*?)['"]$/);
                const containsMatch = c.match(/^contains\s*\(\s*@(.*?)\s*,\s*['"]([\s\S]*?)['"]\s*\)$/);
                const startsWithMatch = c.match(/^starts-with\s*\(\s*@(.*?)\s*,\s*['"]([\s\S]*?)['"]\s*\)$/);
                const endsWithMatch = c.match(/^(?:ends-with|substring)\s*\(\s*@(.*?)\s*,\s*.*?['"]([\s\S]*?)['"]\s*\)$/) ||
                    c.match(/^ends-with\s*\(\s*@([\s\S]*?)\s*,\s*['"]([\s\S]*?)['"]\s*\)$/);

                if (simpleMatch) {
                    const [, attr, val] = simpleMatch;
                    if (node.attributes[attr] === val) match = true;
                } else if (containsMatch) {
                    const [, attr, val] = containsMatch;
                    if (node.attributes[attr]?.includes(val)) match = true;
                } else if (startsWithMatch) {
                    const [, attr, val] = startsWithMatch;
                    if (node.attributes[attr]?.startsWith(val)) match = true;
                } else if (endsWithMatch) {
                    const [, attr, val] = endsWithMatch;
                    if (node.attributes[attr]?.endsWith(val)) match = true;
                }
                if (!match) return false;
            }

            return true;
        };

        const evaluatePart = (nodes: InspectorNode[], segments: string[]): InspectorNode[] => {
            if (segments.length === 0) return nodes;
            const segment = segments[0];
            const remaining = segments.slice(1);
            const isDescendant = segment === ""; // happens if we have "//"

            if (isDescendant) {
                const actualSegmentStr = remaining.shift();
                if (!actualSegmentStr) return nodes;

                const matchInfo = actualSegmentStr.match(/^(.*?)(?:\[(.*?)\])?$/);
                const tag = matchInfo ? matchInfo[1] : actualSegmentStr;
                const predicate = matchInfo ? (matchInfo[2] || null) : null;

                const candidates: InspectorNode[] = [];
                const searchDescendants = (n: InspectorNode) => {
                    if (checkMatch(n, tag, predicate)) candidates.push(n);
                    n.children.forEach(searchDescendants);
                };
                nodes.forEach(searchDescendants);
                return evaluatePart(candidates, remaining);
            } else {
                const matchInfo = segment.match(/^(.*?)(?:\[(.*?)\])?$/);
                const tag = matchInfo ? matchInfo[1] : segment;
                const predicate = matchInfo ? (matchInfo[2] || null) : null;

                const candidates: InspectorNode[] = [];
                nodes.forEach(n => {
                    n.children.forEach(child => {
                        if (checkMatch(child, tag, predicate)) candidates.push(child);
                    });
                });
                return evaluatePart(candidates, remaining);
            }
        };

        const splitXPath = (xpath: string): string[] => {
            const segmentsList: string[] = [];
            let current = "";
            let inBracket = 0;
            let inSingleQuote = false;
            let inDoubleQuote = false;

            for (let i = 0; i < xpath.length; i++) {
                const char = xpath[i];
                if (char === "'" && !inDoubleQuote) {
                    inSingleQuote = !inSingleQuote;
                    current += char;
                } else if (char === '"' && !inSingleQuote) {
                    inDoubleQuote = !inDoubleQuote;
                    current += char;
                } else if (char === '[' && !inSingleQuote && !inDoubleQuote) {
                    inBracket++;
                    current += char;
                } else if (char === ']' && !inSingleQuote && !inDoubleQuote) {
                    inBracket--;
                    current += char;
                } else if (char === '/' && !inSingleQuote && !inDoubleQuote && inBracket === 0) {
                    segmentsList.push(current);
                    current = "";
                } else {
                    current += char;
                }
            }
            segmentsList.push(current);
            return segmentsList;
        };

        const segments = splitXPath(path);
        // If it was absolute (/node), the first segment is ""
        // If it was relative (//node), the first two segments are ""
        if (segments[0] === "") {
            // Check if it's a descendant search (//)
            if (segments[1] === "") {
                // Preserve one empty segment so evaluatePart() treats this as a descendant search
                return evaluatePart([root], segments.slice(1));
            }

            // It's an absolute path (/node/...)
            const firstSegment = segments[1];
            const matchInfo = firstSegment ? firstSegment.match(/^(.*?)(?:\[(.*?)\])?$/) : null;
            const tag = matchInfo ? matchInfo[1] : (firstSegment || "");
            const predicate = matchInfo ? (matchInfo[2] || null) : null;
            const isExplicitRoot = tag === 'hierarchy' || tag === root.tagName;

            if (firstSegment && isExplicitRoot && checkMatch(root, tag, predicate)) {
                // Root is explicitly matched (e.g. /hierarchy or /android.widget.FrameLayout matching root)
                // We proceed to evaluate children against the remaining segments
                return evaluatePart([root], segments.slice(2));
            }

            // Fallback: assume the path starts looking from the root's children
            return evaluatePart([root], segments.slice(1));
        } else {
            return evaluatePart([root], segments);
        }
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
/**
 * Safely escapes an attribute value for use in an XPath string.
 * XPath 1.0 does not have an escape character, so we use single quotes if the value
 * contains double quotes, or vice versa. If it contains both, it uses concat().
 */
export function escapeXPath(val: string): string {
    if (!val.includes('"')) return `"${val}"`;
    if (!val.includes("'")) return `'${val}'`;
    
    // Both quotes exist: use XPath concat()
    const parts = val.split('"');
    const result = parts.map(p => `"${p}"`).join(', \'"\', ');
    return `concat(${result})`;
}

export function generateXPath(
    node: InspectorNode,
    attr?: string,
    type: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' = 'equals',
    kinship: 'none' | 'childSelector' | 'fromParent' = 'none',
    addons: string[] = []
): string {
    if (!node.parent) return '/*';

    if (kinship === 'childSelector' && node.parent) {
        const parentClass = node.parent.attributes['class'] || '*';
        const parentPrefAttr = node.parent.attributes['resource-id'] ? 'resource-id' : node.parent.attributes['text'] ? 'text' : node.parent.attributes['content-desc'] ? 'content-desc' : undefined;
        let parentSelector = `//${parentClass}`;
        if (parentPrefAttr && node.parent.attributes[parentPrefAttr]) {
            parentSelector += `[@${parentPrefAttr}=${escapeXPath(node.parent.attributes[parentPrefAttr])}]`;
        }

        const childXPath = generateXPath(node, attr, type, 'none', addons);
        const relativeChild = childXPath.startsWith('//') ? childXPath.substring(2) : childXPath;
        return `${parentSelector}/${relativeChild}`;
    }

    if (kinship === 'fromParent' && node.parent) {
        const sibling = node.parent.children.find(c => c.id !== node.id && (c.attributes['text'] || c.attributes['resource-id'] || c.attributes['content-desc'])) || node.parent.children.find(c => c.id !== node.id);
        if (sibling) {
            const siblingClass = sibling.attributes['class'] || '*';
            const siblingPrefAttr = sibling.attributes['resource-id'] ? 'resource-id' : sibling.attributes['text'] ? 'text' : sibling.attributes['content-desc'] ? 'content-desc' : undefined;
            let siblingSelector = `//${siblingClass}`;
            if (siblingPrefAttr && sibling.attributes[siblingPrefAttr]) {
                siblingSelector += `[@${siblingPrefAttr}=${escapeXPath(sibling.attributes[siblingPrefAttr])}]`;
            }

            const targetXPath = generateXPath(node, attr, type, 'none', addons);
            const relativeTarget = targetXPath.startsWith('//') ? targetXPath.substring(2) : targetXPath;
            return `${siblingSelector}/../${relativeTarget}`;
        }
    }

    const attributes = node.attributes;
    const className = attributes['class'] || '*';
    
    // For input fields, the 'text' attribute is highly volatile because it holds the user input.
    // Using it in the XPath breaks element tracking as soon as text is typed.
    const isInput = className.includes('EditText');
    
    let defaultPreferredAttr: string | undefined = undefined;
    if (attributes['resource-id']) {
        defaultPreferredAttr = 'resource-id';
    } else if (attributes['content-desc']) {
        defaultPreferredAttr = 'content-desc';
    } else if (!isInput && attributes['text']) {
        defaultPreferredAttr = 'text';
    }

    const preferredAttr = attr || defaultPreferredAttr;

    if (preferredAttr && attributes[preferredAttr]) {
        const val = attributes[preferredAttr];
        const escaped = escapeXPath(val);
        let base = "";
        switch (type) {
            case 'contains': base = `//${className}[contains(@${preferredAttr}, ${escaped})]`; break;
            case 'startsWith': base = `//${className}[starts-with(@${preferredAttr}, ${escaped})]`; break;
            case 'endsWith': base = `//${className}[ends-with(@${preferredAttr}, ${escaped})]`; break;
            case 'matches': base = `//${className}[matches(@${preferredAttr}, ${escaped})]`; break;
            default: base = `//${className}[@${preferredAttr}=${escaped}]`;
        }

        if (addons.length > 0) {
            const extra = addons
                .filter(a => attributes[a] !== undefined && attributes[a] !== null && attributes[a] !== '')
                .map(a => `@${a}=${escapeXPath(attributes[a])}`)
                .join(' and ');
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
 * Recursively assigns a positional short ID to each node in the tree.
 * Format: "0", "0.1", "0.1.2", etc.
 */
export function assignShortIds(node: InspectorNode, prefix: string = "0"): void {
    node.attributes['short_id'] = prefix;
    if (node.children) {
        node.children.forEach((child, index) => {
            assignShortIds(child, `${prefix}.${index}`);
        });
    }
}

/**
 * Searches for a node by its assigned short_id.
 */
export function findNodeByShortId(node: InspectorNode, shortId: string): InspectorNode | null {
    if (node.attributes['short_id'] === shortId) return node;
    for (const child of node.children) {
        const found = findNodeByShortId(child, shortId);
        if (found) return found;
    }
    return null;
}

/**
 * Generates a simplified XML string for AI consumption, including the short_id.
 */
export function generateSimplifiedXml(node: InspectorNode): string {
    // Heuristic: Ensure ScrollView is always marked as scrollable for the AI
    const effectiveAttributes = { ...node.attributes };
    if (node.tagName.includes('ScrollView')) {
        effectiveAttributes['scrollable'] = 'true';
    }

    const attrStr = Object.entries(effectiveAttributes)
        .filter(([k]) => ['short_id', 'text', 'resource-id', 'content-desc', 'class', 'clickable', 'enabled', 'scrollable', 'focusable', 'long-clickable', 'checkable', 'selected'].includes(k))
        .filter(([k, v]) => v || (['clickable', 'scrollable', 'focusable'].includes(k) && v === "false")) // Include false for crucial QA flags
        .map(([k, v]) => `${k}="${(v || '').toString().replace(/"/g, '&quot;')}"`)
        .join(' ');

    const tagName = node.tagName.split('.').pop() || 'node'; // Use short class name
    let xml = `<${tagName} ${attrStr}>`;

    if (node.children && node.children.length > 0) {
        xml += '\n' + node.children.map(c => generateSimplifiedXml(c)).join('\n');
        xml += `\n</${tagName}>`;
    } else {
        xml += `</${tagName}>`;
    }

    return xml;
}

/**
 * Generates a UiAutomator selector string.
 */
export function generateUiSelector(node: InspectorNode, options: {
    attr?: 'resource-id' | 'content-desc' | 'text' | 'class' | 'auto',
    type: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches',
    kinship?: 'none' | 'childSelector' | 'fromParent',
    useUiSelectorWrapper: boolean,
    addons?: string[]
}): string {
    if (options.kinship === 'childSelector' && node.parent) {
        const parentSel = generateUiSelector(node.parent, {
            attr: 'auto',
            type: 'equals',
            kinship: 'none',
            useUiSelectorWrapper: false
        });
        const childSel = generateUiSelector(node, {
            ...options,
            kinship: 'none',
            useUiSelectorWrapper: false
        });
        const full = `${parentSel}.childSelector(new UiSelector().${childSel})`;
        return options.useUiSelectorWrapper ? `new UiSelector().${full}` : full;
    }

    if (options.kinship === 'fromParent' && node.parent) {
        const sibling = node.parent.children.find(c => c.id !== node.id && (c.attributes['text'] || c.attributes['resource-id'] || c.attributes['content-desc'])) || node.parent.children.find(c => c.id !== node.id);
        if (sibling) {
            const siblingSel = generateUiSelector(sibling, {
                attr: 'auto',
                type: 'equals',
                kinship: 'none',
                useUiSelectorWrapper: false
            });
            const targetSel = generateUiSelector(node, {
                ...options,
                kinship: 'none',
                useUiSelectorWrapper: false
            });
            const full = `${siblingSel}.fromParent(new UiSelector().${targetSel})`;
            return options.useUiSelectorWrapper ? `new UiSelector().${full}` : full;
        }
    }

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
            if (['checkable', 'checked', 'clickable', 'long-clickable', 'longClickable', 'enabled', 'focusable', 'focused', 'scrollable', 'selected'].includes(a)) {
                selectorArr.push(`${m}(${attrValue === 'true'})`);
            } else if (a === 'index' || a === 'instance') {
                selectorArr.push(`${m}(${parseInt(attrValue, 10) || 0})`);
            } else {
                selectorArr.push(`${m}("${attrValue}")`);
            }
        });
    }

    const fullSelector = selectorArr.join('.');
    return options.useUiSelectorWrapper ? `new UiSelector().${fullSelector}` : fullSelector;
}

/**
 * Calculates the absolute position and size for a highlighter overlay based on node bounds and image layout.
 */
export function getHighlighterStyle(
    node: InspectorNode | null,
    color: string,
    imgLayout?: { width: number, height: number, naturalWidth: number, naturalHeight: number } | null
): React.CSSProperties {
    if (!node?.bounds || !imgLayout) return { display: 'none' };

    let transformedBounds = node.bounds;
    let root: InspectorNode | undefined = node;
    while (root?.parent) {
        root = root.parent;
    }
    if (root?.bounds?.w && root.bounds.h) {
        transformedBounds = transformBounds(
            node.bounds,
            root.bounds.w,
            root.bounds.h,
            imgLayout.naturalWidth,
            imgLayout.naturalHeight
        );
    }

    const scaleX = imgLayout.width / imgLayout.naturalWidth;
    const scaleY = imgLayout.height / imgLayout.naturalHeight;

    return {
        left: transformedBounds.x * scaleX,
        top: transformedBounds.y * scaleY,
        width: transformedBounds.w * scaleX,
        height: transformedBounds.h * scaleY,
        borderColor: color,
        backgroundColor: `${color}15` // 15 is ~8% opacity in hex
    };
}
