import type { Root, Element } from 'hast';
import { visit } from 'unist-util-visit';

/** The only part of rehype's VFile this plugin needs. Typed structurally rather
 *  than imported from `vfile`, which is not a direct dependency of this project. */
interface HasPath {
	path?: string;
}

/**
 * Rehype plugin: demotes every heading by one level inside the SKILL.md files
 * that /skills/[id] renders.
 *
 * Those files legitimately open with `# <Skill name>` — each one is a standalone
 * document written for the agent. But the skill page already renders that name
 * as its own <h1>, so embedding the file verbatim puts two <h1>s on the page and
 * restarts the heading outline halfway down it. Demoting h1→h2 … h5→h6 keeps the
 * file readable in place while leaving the page with exactly one <h1> and one
 * uninterrupted outline.
 *
 * Scoped by path: editorial markdown under src/content is deliberately
 * untouched, because there the file's own <h1> *is* the page title.
 */
export function rehypeDemoteSkillHeadings() {
	return (tree: Root, file: HasPath) => {
		const path = (file.path ?? '').replace(/\\/g, '/');
		if (!path.includes('/src/mastra/skills/')) return;

		visit(tree, 'element', (node: Element) => {
			const level = /^h([1-5])$/.exec(node.tagName);
			if (level) node.tagName = `h${Number(level[1]) + 1}`;
		});
	};
}
