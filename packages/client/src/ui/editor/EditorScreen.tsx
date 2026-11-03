import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { confirmLeave, type EditorStore } from '../../editor/editor-store.ts';
import { EditorTestScreen } from '../screens/EditorTestScreen.tsx';
import { useUi, useUiStore } from '../UiStoreContext.tsx';
import { EditorDialogs } from './EditorDialogs.tsx';
import { EditorToolbar, type EditorDialog } from './EditorToolbar.tsx';

/**
 * Entry point of the lazily loaded editor chunk: the toolbar and dialogs over the editor scene, or
 * the HUD and banner while testing. It stays mounted for both, so the unsaved-changes warning on
 * closing the tab holds throughout.
 */
export function EditorScreen() {
  const editor = useUi((s) => s.editor);
  return editor ? <EditorOverlay editor={editor} /> : null;
}

function EditorOverlay({ editor }: { editor: EditorStore }) {
  const ui = useUiStore();
  const [dialog, setDialog] = useState<EditorDialog>(null);
  const name = useStore(editor, (s) => s.name);
  const unsaved = useStore(editor, (s) => s.saveState !== 'saved');
  const testing = useUi((s) => s.screen === 'editorTest');

  // Closing or reloading the tab asks first while anything is unsaved.
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);

  if (testing) return <EditorTestScreen />;
  return (
    <div className="screen editor-screen">
      <EditorToolbar
        editor={editor}
        onTest={() => ui.getState().setEditorScreen('editorTest')}
        onBack={() => {
          if (confirmLeave(editor.getState()) === 'ask') setDialog('leave');
          else ui.getState().closeEditor();
        }}
        onDialog={setDialog}
      />
      <EditorDialogs
        open={dialog}
        name={name}
        onClose={() => setDialog(null)}
        onRename={(next) => editor.getState().rename(next)}
        onDelete={() => {
          setDialog(null);
          void editor
            .getState()
            .remove()
            .then((removed) => {
              if (removed) ui.getState().closeEditor();
            });
        }}
        onLeave={() => {
          setDialog(null);
          ui.getState().closeEditor();
        }}
      />
    </div>
  );
}
