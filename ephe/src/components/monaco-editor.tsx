"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "../hooks/use-local-storage";
import { useDebouncedCallback } from "../hooks/use-debounce";
import type * as monaco from "monaco-editor";
import { Editor } from "@monaco-editor/react";
import type { EditorProps } from "@monaco-editor/react";
import type React from "react";
import { isTaskListLine, getTaskListIndentation, getCheckboxEndPosition, isEmptyTaskListLine, isCheckedTask } from "./task-list-utils";
import { useTheme } from "../hooks/use-theme";

const EDITOR_CONTENT_KEY = "editor-content";

const WRITING_QUOTES = [
    "The scariest moment is always just before you start.",
    "Fill your paper with the breathings of your heart.",
    "The pen is mightier than the sword.",
    "The best way to predict the future is to invent it.",
    "The only way to do great work is to love what you do.",
    "A word after a word after a word is power.",
    "Get things done.",
    "Later equals never.",
    "Divide and conquer.",
];

// Helper functions
const getRandomQuote = (): string => {
    return WRITING_QUOTES[Math.floor(Math.random() * WRITING_QUOTES.length)];
};

type MonacoEditorProps = {
    editorRef?: React.RefObject<{ focus: () => void } | undefined>;
};

export const MonacoEditor = ({ editorRef }: MonacoEditorProps): React.ReactElement => {
    const [content, setContent] = useLocalStorage<string>(EDITOR_CONTENT_KEY, "");
    const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const [placeholder, setPlaceholder] = useState<string>(getRandomQuote());
    const { theme } = useTheme();
    const isDarkMode = theme === "dark";

    const debouncedSetContent = useDebouncedCallback(
        (newContent: string) => {
            setContent(newContent);
        },
        400
    );

    // Handle editor mounting
    const handleEditorDidMount = (
        editor: monaco.editor.IStandaloneCodeEditor,
        monaco: typeof import("monaco-editor")
    ) => {
        monacoRef.current = editor;

        // Set up placeholder when editor is empty
        const updatePlaceholder = () => {
            const contentValue = editor.getValue();
            const placeholderElement = document.querySelector('.monaco-placeholder');

            if (placeholderElement) {
                if (!contentValue.trim()) {
                    placeholderElement.classList.remove('hidden');
                } else {
                    placeholderElement.classList.add('hidden');
                }
            }
        };

        // Handle auto-complete for task list syntax
        const handleTaskListAutoComplete = (e: monaco.IKeyboardEvent, model: monaco.editor.ITextModel, position: monaco.Position): boolean => {
            if (e.keyCode !== monaco.KeyCode.BracketLeft) return false;

            const lineContent = model.getLineContent(position.lineNumber);
            const textBeforeCursor = lineContent.substring(0, position.column - 1);

            // Check if the user just typed "-["
            if (textBeforeCursor.endsWith("-")) {
                e.preventDefault();
                editor.executeEdits('', [{
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column - 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    },
                    text: "- [ ] "
                }]);
                return true;
            }

            // Check if the user just typed "- ["
            if (textBeforeCursor.endsWith("- ")) {
                e.preventDefault();
                editor.executeEdits('', [{
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    },
                    text: "[ ] "
                }]);
                return true;
            }

            return false;
        };

        // Handle empty list item removal
        const handleEmptyListItemRemoval = (
            e: monaco.IKeyboardEvent,
            model: monaco.editor.ITextModel,
            position: monaco.Position,
            lineContent: string
        ): boolean => {
            // For task lists
            if (isTaskListLine(lineContent) && isEmptyTaskListLine(lineContent)) {
                e.preventDefault();
                editor.executeEdits('', [{
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: lineContent.length + 1
                    },
                    text: ''
                }]);
                return true;
            }

            // For regular lists
            const listItemRegex = /^(\s*)(-|\*|\d+\.)\s+(.*)$/;
            const listMatch = lineContent.match(listItemRegex);

            if (listMatch) {
                const [, , , content] = listMatch;

                // If the line is empty (just the list marker), remove the marker
                if (!content.trim()) {
                    e.preventDefault();
                    editor.executeEdits('', [{
                        range: {
                            startLineNumber: position.lineNumber,
                            startColumn: 1,
                            endLineNumber: position.lineNumber,
                            endColumn: lineContent.length + 1
                        },
                        text: ''
                    }]);
                    return true;
                }
            }

            return false;
        };

        // Handle task list continuation
        const handleTaskListContinuation = (
            e: monaco.IKeyboardEvent,
            model: monaco.editor.ITextModel,
            position: monaco.Position,
            lineContent: string
        ): boolean => {
            if (!isTaskListLine(lineContent)) return false;

            const indentation = getTaskListIndentation(lineContent);
            const checkboxEndPos = getCheckboxEndPosition(lineContent);

            // If the cursor is after the checkbox
            if (position.column > checkboxEndPos) {
                // If the cursor is at the end of the line, add a new task list item
                if (position.column > lineContent.length) {
                    e.preventDefault();
                    editor.executeEdits('', [{
                        range: {
                            startLineNumber: position.lineNumber,
                            startColumn: position.column,
                            endLineNumber: position.lineNumber,
                            endColumn: position.column
                        },
                        text: `\n${indentation}- [ ] `
                    }]);
                } else {
                    // If the cursor is in the middle of the line, just split the line
                    e.preventDefault();
                    const textBeforeCursor = lineContent.substring(0, position.column - 1);
                    const textAfterCursor = lineContent.substring(position.column - 1);

                    editor.executeEdits('', [{
                        range: {
                            startLineNumber: position.lineNumber,
                            startColumn: 1,
                            endLineNumber: position.lineNumber,
                            endColumn: lineContent.length + 1
                        },
                        text: `${textBeforeCursor}\n${textAfterCursor}`
                    }]);
                }
                return true;
            }

            return false;
        };

        // Handle regular list continuation
        const handleRegularListContinuation = (
            e: monaco.IKeyboardEvent,
            model: monaco.editor.ITextModel,
            position: monaco.Position,
            lineContent: string
        ): boolean => {
            const listItemRegex = /^(\s*)(-|\*|\d+\.)\s+(.*)$/;
            const listMatch = lineContent.match(listItemRegex);

            if (!listMatch) return false;

            const [, indentation, listMarker, content] = listMatch;

            // If the cursor is at the end of the line, add a new list item
            if (position.column > lineContent.length) {
                e.preventDefault();

                // For numbered lists, increment the number
                let nextMarker = listMarker;
                if (/^\d+\.$/.test(listMarker)) {
                    const currentNumber = Number.parseInt(listMarker.replace('.', ''));
                    nextMarker = `${currentNumber + 1}.`;
                }

                editor.executeEdits('', [{
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    },
                    text: `\n${indentation}${nextMarker} `
                }]);
            } else {
                // If the cursor is in the middle of the line, just split the line
                e.preventDefault();
                const textBeforeCursor = lineContent.substring(0, position.column - 1);
                const textAfterCursor = lineContent.substring(position.column - 1);

                editor.executeEdits('', [{
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: lineContent.length + 1
                    },
                    text: `${textBeforeCursor}\n${textAfterCursor}`
                }]);
            }

            return true;
        };

        // Handle keyboard events
        const handleKeyDown = (e: monaco.IKeyboardEvent): void => {
            const model = editor.getModel();
            if (!model) return;

            const position = editor.getPosition();
            if (!position) return;

            // Auto-complete task list syntax
            if (handleTaskListAutoComplete(e, model, position)) return;

            // Handle Enter key for list continuation
            if (e.keyCode === monaco.KeyCode.Enter) {
                const lineContent = model.getLineContent(position.lineNumber);

                // Handle empty list item removal
                if (handleEmptyListItemRemoval(e, model, position, lineContent)) return;

                // Handle task list continuation
                if (handleTaskListContinuation(e, model, position, lineContent)) return;

                // Handle regular list continuation
                if (handleRegularListContinuation(e, model, position, lineContent)) return;
            }
        };

        // Handle task checkbox toggle on click
        const handleTaskCheckboxToggle = (e: monaco.editor.IEditorMouseEvent): boolean | undefined => {
            if (e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT) {
                return;
            }

            const model = editor.getModel();
            if (!model) return;

            const position = e.target.position;
            if (!position) return;

            const lineContent = model.getLineContent(position.lineNumber);

            if (!isTaskListLine(lineContent)) return;

            // Find the exact position of the checkbox in the line
            const checkboxStartIndex = lineContent.indexOf('- [');
            if (checkboxStartIndex === -1) return;

            // Calculate the column positions (Monaco columns start at 1, not 0)
            const checkboxColumn = checkboxStartIndex + 3 + 1; // +3 for "- [", +1 for Monaco's 1-based columns

            // Expand the click area slightly around the checkbox
            const clickAreaStart = checkboxColumn - 1;
            const clickAreaEnd = checkboxColumn + 1;

            // Check if click is within the checkbox area
            if (position.column >= clickAreaStart && position.column <= clickAreaEnd) {
                // Get the current state of the checkbox
                const isChecked = isCheckedTask(lineContent);

                // Toggle checkbox state
                const newState = isChecked ? ' ' : 'x';

                // Apply the edit to toggle checkbox - only change the checkbox character
                editor.executeEdits('', [{
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: checkboxColumn,
                        endLineNumber: position.lineNumber,
                        endColumn: checkboxColumn + 1
                    },
                    text: newState
                }]);

                // モデル変更イベントで自動的にデコレーションが更新されるため、
                // ここでは明示的に呼び出さない

                // Return false to prevent default handling
                return false;
            }
        };

        // Add decorations for checked tasks
        const updateDecorations = () => {
            const model = editor.getModel();
            if (!model) return;

            // 既存のデコレーションを保持する変数
            const oldDecorations = editor.getModel()?.getAllDecorations() || [];
            const decorations: monaco.editor.IModelDeltaDecoration[] = [];

            for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
                const lineContent = model.getLineContent(lineNumber);

                if (isCheckedTask(lineContent)) {
                    // チェック済みタスクにデコレーションを追加
                    decorations.push({
                        range: new monaco.Range(
                            lineNumber,
                            1, // Start from beginning of line
                            lineNumber,
                            lineContent.length + 1 // To the end of the line
                        ),
                        options: {
                            inlineClassName: 'task-completed-line',
                            isWholeLine: true,
                            stickiness: monaco.editor.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore
                        }
                    });
                }
            }

            // すべてのデコレーションを一度削除し、新しいデコレーションを適用
            const oldIds = oldDecorations
                .filter(d => d.options.inlineClassName === 'task-completed-line')
                .map(d => d.id);

            // 古いデコレーションを削除し、新しいデコレーションを適用
            editor.deltaDecorations(oldIds, decorations);
        };

        // Add event handlers
        editor.onKeyDown(handleKeyDown);
        editor.onMouseDown(handleTaskCheckboxToggle);

        // Update placeholder and decorations on content change
        editor.onDidChangeModelContent(() => {
            updatePlaceholder();
            updateDecorations();
            debouncedSetContent(editor.getValue());
        });

        // Initial setup
        updatePlaceholder();
        updateDecorations();

        // Focus editor on mount
        editor.focus();

        // Define custom themes
        monaco.editor.defineTheme('ephe-light', {
            base: "vs",
            inherit: true,
            rules: [],
            colors: {
                'editor.background': "#ffffff",
                'editor.foreground': '#000000',
                'editorCursor.foreground': '#000000',
                'editor.lineHighlightBackground': '#f5f5f5',
                'editorLineNumber.foreground': '#999999',
                'editor.selectionBackground': '#b3d4fc',
                'editor.inactiveSelectionBackground': '#d1e4fd'
            }
        });

        monaco.editor.defineTheme('ephe-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'editor.background': '#1e1e1e',
                'editor.foreground': '#d4d4d4',
                'editorCursor.foreground': '#ffffff',
                'editor.lineHighlightBackground': '#2a2a2a',
                'editorLineNumber.foreground': '#858585',
                'editor.selectionBackground': '#264f78',
                'editor.inactiveSelectionBackground': '#3a3d41'
            }
        });

        // Apply custom theme
        monaco.editor.setTheme(isDarkMode ? 'ephe-dark' : 'ephe-light');
    };

    // Expose focus method to parent component through ref
    useEffect(() => {
        if (editorRef && monacoRef.current) {
            editorRef.current = {
                focus: () => monacoRef.current?.focus(),
            };
        }
    }, [editorRef]);

    // Configure editor options
    const editorOptions: EditorProps["options"] = {
        minimap: { enabled: false },
        lineNumbers: "off",
        wordWrap: "on",
        wrappingIndent: "same",
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        glyphMargin: false,
        folding: false,
        renderLineHighlight: "none",
        scrollBeyondLastLine: false,
        renderWhitespace: "none",
        fontFamily: "monospace",
        fontSize: 14,
        contextmenu: false,
        scrollbar: {
            vertical: "auto",
            horizontal: "auto",
            verticalScrollbarSize: 0,
            horizontalScrollbarSize: 0,
            verticalSliderSize: 0,
            horizontalSliderSize: 0,
            alwaysConsumeMouseWheel: false
        },
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        renderValidationDecorations: "off",
        quickSuggestions: true,
        suggestOnTriggerCharacters: false,
        acceptSuggestionOnEnter: "off",
        tabCompletion: "off",
        wordBasedSuggestions: "off",
        parameterHints: { enabled: false },
    };

    return (
        // Container wrapper - controls the width constraints and horizontal centering
        <div className="w-full max-w-2xl mx-auto relative h-full rounded-md overflow-hidden">
            {/* Placeholder element that shows when editor is empty */}
            <div className="monaco-placeholder text-md absolute left-0.5 text-gray-400 dark:text-gray-500 pointer-events-none z-[1]">
                {placeholder}
            </div>

            {/* Monaco Editor wrapper */}
            <Editor
                height="100%"
                width="100%"
                defaultLanguage="markdown"
                defaultValue={content}
                options={editorOptions}
                onMount={handleEditorDidMount}
                className="overflow-hidden"
                loading=""
                theme={isDarkMode ? "ephe-dark" : "ephe-light"}
            />
        </div>
    );
};

// Need to use default export since this is a CSR component loaded with dynamic import
export default MonacoEditor; 