import type { Root } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * Rehype plugin: adds loading="lazy" and decoding="async" to all
 * <img> elements in article markdown prose.
 * The ArticleLayout hero has fetchpriority="high" set directly so it won't conflict.
 */
export function rehypeLazyImages() {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'img') {
        node.properties = node.properties || {};
        if (!node.properties.loading) {
          node.properties.loading = 'lazy';
        }
        if (!node.properties.decoding) {
          node.properties.decoding = 'async';
        }
      }
    });
  };
}
