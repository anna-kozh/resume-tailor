// HighlightExtension.js
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

/** Effect to push new keywords into the decoration field */
export const setHighlights = StateEffect.define();

/** Tailwind green bg for matches (works because Tailwind classes are global) */
const decoMark = Decoration.mark({ class: "bg-green-200" });

/** Build a DecorationSet for all keyword matches in the document */
const buildDecorations = (doc, keywords) => {
  if (!keywords || !keywords.length) return Decoration.none;

  const escaped = keywords
    .filter(Boolean)
    .map((k) =>
      (typeof k === "string" ? k : k.keyword || "")
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .filter(Boolean);

  if (!escaped.length) return Decoration.none;

  // Word-boundary match, case-insensitive
  const rx = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const text = doc.toString();
  const ranges = [];
  let m;
  while ((m = rx.exec(text))) {
    ranges.push(decoMark.range(m.index, m.index + m[0].length));
  }
  return ranges.length ? Decoration.set(ranges) : Decoration.none;
};

/** StateField that holds and updates the highlight decorations */
export const highlightField = (initialKeywords = []) =>
  StateField.define({
    create(state) {
      return buildDecorations(state.doc, initialKeywords);
    },
    update(deco, tr) {
      // Map existing decorations through document changes
      deco = deco.map(tr.changes);

      // If keywords are updated externally, rebuild
      for (const e of tr.effects) {
        if (e.is(setHighlights)) {
          return buildDecorations(tr.state.doc, e.value || []);
        }
      }

      // If document changed (user typed), recompute using current initialKeywords
      if (tr.docChanged) {
        return buildDecorations(tr.state.doc, initialKeywords);
      }

      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
