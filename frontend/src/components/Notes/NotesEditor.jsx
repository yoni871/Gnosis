import { useEffect, useImperativeHandle, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ScriptureReferenceMark from "./ScriptureReferenceMark";
import { sanitizeNoteHtml } from "./noteRichText";

const EMPTY_BOOKS = [];

export default function NotesEditor({
    value, onChange, placeholder, disabled = false, autoFocus = false,
    ariaLabel, inputRef, className = "", books = EMPTY_BOOKS, onReferenceClick,
}) {
    const onChangeRef = useRef(onChange);
    const onReferenceClickRef = useRef(onReferenceClick);
    const lastEmitted = useRef(null);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    useEffect(() => { onReferenceClickRef.current = onReferenceClick; }, [onReferenceClick]);
    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
            ScriptureReferenceMark.configure({ books }),
        ],
        content: sanitizeNoteHtml(value),
        editable: !disabled,
        autofocus: autoFocus,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                role: "textbox", "aria-multiline": "true", "aria-label": ariaLabel || "Note content",
                "data-placeholder": placeholder || "", class: `notes-tiptap-editor text-base ${className}`,
            },
            handleDOMEvents: {
                click(_view, event) {
                    const link = event.target.closest?.("a[data-scripture]");
                    if (!link) return false;
                    event.preventDefault();
                    try { onReferenceClickRef.current?.(JSON.parse(link.dataset.target)); } catch { /* malformed legacy mark */ }
                    return true;
                },
            },
            transformPastedHTML: sanitizeNoteHtml,
        },
        onUpdate: ({ editor: current }) => {
            const html = current.getHTML();
            lastEmitted.current = html;
            onChangeRef.current(html);
        },
    }, [books]);

    useEffect(() => {
        if (editor && !editor.isDestroyed && editor.isEditable === disabled) editor.setEditable(!disabled, false);
    }, [editor, disabled]);
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        if (value === lastEmitted.current) return;
        const safe = sanitizeNoteHtml(value);
        if (sanitizeNoteHtml(editor.getHTML()) !== safe) editor.commands.setContent(safe, { emitUpdate: false });
    }, [editor, value]);

    useImperativeHandle(inputRef, () => ({
        focus: () => editor?.commands.focus(),
        format: (action) => {
            const chain = editor?.chain().focus();
            const commands = {
                bold: () => chain?.toggleBold().run(), italic: () => chain?.toggleItalic().run(),
                underline: () => chain?.toggleUnderline().run(), list: () => chain?.toggleBulletList().run(),
                orderedList: () => chain?.toggleOrderedList().run(), heading: () => chain?.toggleHeading({ level: 2 }).run(),
                undo: () => chain?.undo().run(), redo: () => chain?.redo().run(),
            };
            commands[action]?.();
        },
    }), [editor]);

    return <EditorContent editor={editor} className="h-full min-h-0" />;
}
