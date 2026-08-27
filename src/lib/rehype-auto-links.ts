import type { Root, Element, Text } from 'hast';
import { visit, SKIP } from 'unist-util-visit';

/** Entity terms mapped to internal URLs. First occurrence per page is linked. */
const ENTITY_LINKS: [RegExp, string][] = [
	[/\bDoodle Avatar\b/i, '/skills/normal/'],
	[/\bDoodle Collage\b/i, '/skills/collage/'],
	[/\bFull[- ]Body(?: Action)? Collage\b/i, '/skills/full-body/'],
	[/\bSticker Pack\b/i, '/skills/stickers/'],
	[/\bMood Captions?\b/i, '/skills/mood-captions/'],
	[/\bGift Doodle\b/i, '/skills/gift/'],
	[/\bSurprise Me\b/i, '/skills/surprise/'],
];

/**
 * Rehype plugin: auto-links the FIRST mention of each skill entity in prose.
 * Rules:
 * - One link per term per page
 * - Never inside existing <a> or heading elements
 */
export function rehypeAutoLinks() {
	return (tree: Root) => {
		const linked = new Set<string>();

		visit(tree, 'text', (node, index, parent) => {
			if (!parent || !('tagName' in parent)) return;
			const parentEl = parent as Element;

			// Skip inside links and headings
			if (parentEl.tagName === 'a' || /^h[1-6]$/.test(parentEl.tagName)) {
				return SKIP;
			}

			for (const [regex, href] of ENTITY_LINKS) {
				if (linked.has(href)) continue;

				const match = regex.exec(node.value);
				if (!match || typeof index !== 'number') continue;

				linked.add(href);

				const before = node.value.slice(0, match.index);
				const matchText = match[0];
				const after = node.value.slice(match.index + matchText.length);

				const linkNode: Element = {
					type: 'element',
					tagName: 'a',
					properties: { href },
					children: [{ type: 'text', value: matchText }],
				};

				const newNodes: (Element | Text)[] = [];
				if (before) newNodes.push({ type: 'text', value: before });
				newNodes.push(linkNode);
				if (after) newNodes.push({ type: 'text', value: after });

				parentEl.children.splice(index, 1, ...newNodes);
				return SKIP; // Don't revisit the replacement nodes
			}
		});
	};
}
