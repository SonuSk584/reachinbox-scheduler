import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { EditorToolbar } from './EditorToolbar';

interface RichTextEditorProps {
  /** Called on every change with the HTML and whether the document is empty. */
  onChange: (html: string, isEmpty: boolean) => void;
}

export function RichTextEditor({ onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, Underline, TextAlign.configure({ types: ['heading', 'paragraph'] })],
    editorProps: { attributes: { class: 'rich-content tiptap', 'aria-label': 'Email body', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML(), ed.isEmpty),
  });

  return (
    <div className="mt-3 rounded-2xl bg-[#fafafa] pt-4">
      <p aria-hidden className={`px-5 pb-3 text-xs text-muted ${editor && !editor.isEmpty ? 'invisible' : ''}`}>
        Type Your Reply...
      </p>
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
