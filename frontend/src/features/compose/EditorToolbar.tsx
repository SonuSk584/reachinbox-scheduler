import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, IndentDecrease, IndentIncrease, Italic, List, ListOrdered,
  Quote, Redo2, Strikethrough, Underline, Undo2,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface ToolButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

function ToolButton({ label, onClick, active, disabled, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-7 place-items-center rounded-md text-ink-soft transition-colors hover:bg-field disabled:opacity-35',
        active && 'bg-brand-soft text-brand',
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px bg-line" />;

const ALIGN_CYCLE = ['left', 'center', 'right'] as const;
const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight };

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const run = () => editor.chain().focus();

  const heading = [1, 2, 3].find((level) => editor.isActive('heading', { level })) ?? 0;
  const align = ALIGN_CYCLE.find((a) => editor.isActive({ textAlign: a })) ?? 'left';
  const nextAlign = ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(align) + 1) % ALIGN_CYCLE.length];
  const AlignIcon = ALIGN_ICON[align];

  const setHeading = (value: string) => {
    const level = Number(value);
    if (level === 0) run().setParagraph().run();
    else run().setHeading({ level: level as 1 | 2 | 3 }).run();
  };

  return (
    <div role="toolbar" aria-label="Text formatting" className="mx-5 flex flex-wrap items-center gap-0.5 rounded-full bg-white px-3 py-1.5">
      <ToolButton label="Undo" onClick={() => run().undo().run()} disabled={!editor.can().undo()}><Undo2 aria-hidden className="size-4" /></ToolButton>
      <ToolButton label="Redo" onClick={() => run().redo().run()} disabled={!editor.can().redo()}><Redo2 aria-hidden className="size-4" /></ToolButton>
      <Divider />
      <select
        aria-label="Text style"
        value={heading}
        onChange={(e) => setHeading(e.target.value)}
        className="h-7 rounded-md bg-transparent px-1 text-xs text-ink-soft hover:bg-field focus:outline-none"
      >
        <option value={0}>Normal</option>
        <option value={1}>Heading 1</option>
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
      </select>
      <Divider />
      <ToolButton label="Bold" active={editor.isActive('bold')} onClick={() => run().toggleBold().run()}><Bold aria-hidden className="size-4" /></ToolButton>
      <ToolButton label="Italic" active={editor.isActive('italic')} onClick={() => run().toggleItalic().run()}><Italic aria-hidden className="size-4" /></ToolButton>
      <ToolButton label="Underline" active={editor.isActive('underline')} onClick={() => run().toggleUnderline().run()}><Underline aria-hidden className="size-4" /></ToolButton>
      <ToolButton label="Strikethrough" active={editor.isActive('strike')} onClick={() => run().toggleStrike().run()}><Strikethrough aria-hidden className="size-4" /></ToolButton>
      <Divider />
      <ToolButton label={`Align ${nextAlign}`} onClick={() => run().setTextAlign(nextAlign).run()}><AlignIcon aria-hidden className="size-4" /></ToolButton>
      <ToolButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => run().toggleOrderedList().run()}><ListOrdered aria-hidden className="size-4" /></ToolButton>
      <ToolButton label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => run().toggleBulletList().run()}><List aria-hidden className="size-4" /></ToolButton>
      <ToolButton label="Decrease indent" onClick={() => run().liftListItem('listItem').run()} disabled={!editor.can().liftListItem('listItem')}><IndentDecrease aria-hidden className="size-4" /></ToolButton>
      <ToolButton label="Increase indent" onClick={() => run().sinkListItem('listItem').run()} disabled={!editor.can().sinkListItem('listItem')}><IndentIncrease aria-hidden className="size-4" /></ToolButton>
      <ToolButton label="Quote" active={editor.isActive('blockquote')} onClick={() => run().toggleBlockquote().run()}><Quote aria-hidden className="size-4" /></ToolButton>
    </div>
  );
}
