// src/components/ResumeEditor.js
import React, { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { highlightField, setHighlights } from "./HighlightExtension";

function ResumeEditor({
  value,
  onChange,
  keywords = [],
  className = "",
}) {
  const viewRef = useRef(null);

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      highlightField(keywords),
      EditorView.updateListener.of((v) => {
        if (v.docChanged) onChange(v.state.doc.toString());
      }),
      // Minimal theme to keep look close to your textarea without styling changes
      EditorView.theme({
        "&": {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "0.875rem",
          borderRadius: "0.5rem",
        },
        ".cm-content": { padding: "12px" },
        ".cm-scroller": { overflow: "auto", minHeight: "600px" },
        ".cm-line": { whiteSpace: "pre-wrap" },
      }),
    ],
    [onChange, keywords]
  );

  // Push new keywords when prop changes
  useEffect(() => {
    const view = viewRef.current?.view;
    if (!view) return;
    view.dispatch({ effects: setHighlights.of(keywords || []) });
  }, [keywords]);

  return (
    <div className={className}>
      <CodeMirror
        ref={viewRef}
        value={value}
        basicSetup={{ lineNumbers: false, highlightActiveLine: false }}
        autoFocus={false}
        editable={true}
        height="600px"
        extensions={extensions}
        onChange={(val) => onChange(val)}
      />
    </div>
  );
}

export default ResumeEditor;
