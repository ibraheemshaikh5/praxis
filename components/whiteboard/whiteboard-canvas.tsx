"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Tldraw,
  getSnapshot,
  loadSnapshot,
  type Editor,
  type TLStoreSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";

import type { WhiteboardDocument } from "@/lib/api/types";

const SAVE_DELAY_MS = 900;

/**
 * One tldraw editor for one stored board. The parent keys this component by
 * whiteboard id, so `initialDocument` is read once per board and later saves
 * never feed a snapshot back into the editor that produced it.
 */
export function WhiteboardCanvas({
  initialDocument,
  onDocumentChange,
}: {
  initialDocument: WhiteboardDocument;
  onDocumentChange: (document: WhiteboardDocument) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const loaded = React.useRef(initialDocument);
  const save = React.useRef(onDocumentChange);

  React.useEffect(() => {
    save.current = onDocumentChange;
  }, [onDocumentChange]);

  const handleMount = React.useCallback((mounted: Editor) => {
    setEditor(mounted);

    // A board created but never drawn on has an empty document; tldraw's own
    // defaults are the right starting state for it.
    if (Object.keys(loaded.current).length > 0) {
      loadSnapshot(mounted.store, {
        document: loaded.current as unknown as TLStoreSnapshot,
      });
    }

    let timer = 0;
    const flush = () => {
      timer = 0;
      save.current(
        getSnapshot(mounted.store).document as unknown as WhiteboardDocument,
      );
    };

    const stopListening = mounted.store.listen(
      () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(flush, SAVE_DELAY_MS);
      },
      { scope: "document", source: "user" },
    );

    return () => {
      stopListening();
      // Closing the dialog unmounts the editor; the last strokes are still
      // pending, so write them before the store goes away.
      if (timer) {
        window.clearTimeout(timer);
        flush();
      }
    };
  }, []);

  React.useEffect(() => {
    editor?.user.updateUserPreferences({
      colorScheme: resolvedTheme === "dark" ? "dark" : "light",
    });
  }, [editor, resolvedTheme]);

  return <Tldraw onMount={handleMount} />;
}
