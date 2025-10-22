// HighlightExtension.js
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

/** Effect to push new highlights into the decoration field */
export const setHighlights = StateEffect.define();

/** Green background for applied keywords */
const greenMark = Decoration.mark({ class: "bg-green-200" });

/** Yellow background for current suggestion */
const yellowMark = Decoration.mark({ class: "bg-yellow-200" });

/** Build a DecorationSet for all highlights in the document */
const buildDecorations = (doc, appliedKeywords, currentHighlight) => {
  const ranges = [];
  const text = doc.toString();
  const lines = text.split('\n');

  // 1. Add green highlights for all applied keywords
  if (appliedKeywords && appliedKeywords.length > 0) {
    appliedKeywords.forEach(applied => {
      const searchText = applied.text || applied.keyword;
      if (!searchText) return;

      // Escape special regex characters
      const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      
      let match;
      while ((match = regex.exec(text)) !== null) {
        ranges.push(greenMark.range(match.index, match.index + match[0].length));
      }
    });
  }

  // 2. Add yellow highlight for current suggestion line
  if (currentHighlight && currentHighlight.lineIndex >= 0) {
    let charCount = 0;
    for (let i = 0; i < currentHighlight.lineIndex && i < lines.length; i++) {
      charCount += lines[i].length + 1; // +1 for newline
    }
    
    if (currentHighlight.lineIndex < lines.length) {
      const lineLength = lines[currentHighlight.lineIndex].length;
      if (lineLength > 0) {
        ranges.push(yellowMark.range(charCount, charCount + lineLength));
      }
    }
  }

  return ranges.length > 0 ? Decoration.set(ranges) : Decoration.none;
};

/** StateField that holds and updates the highlight decorations */
export const highlightField = (initialAppliedKeywords = [], initialCurrentHighlight = null) =>
  StateField.define({
    create(state) {
      return buildDecorations(state.doc, initialAppliedKeywords, initialCurrentHighlight);
    },
    update(deco, tr) {
      // Map existing decorations through document changes
      deco = deco.map(tr.changes);

      // If highlights are updated externally, rebuild
      for (const e of tr.effects) {
        if (e.is(setHighlights)) {
          return buildDecorations(
            tr.state.doc, 
            e.value?.appliedKeywords || [], 
            e.value?.currentHighlight || null
          );
        }
      }

      // If document changed (user typed), recompute using current values
      if (tr.docChanged) {
        return buildDecorations(tr.state.doc, initialAppliedKeywords, initialCurrentHighlight);
      }

      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
