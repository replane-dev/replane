'use client';

import Editor from '@monaco-editor/react';
import {useTheme} from 'next-themes';

interface CodeSnippetProps {
  code: string;
  language: 'typescript' | 'javascript' | 'shell' | 'json' | 'python';
}

export function CodeSnippet({code, language}: CodeSnippetProps) {
  const {resolvedTheme} = useTheme();
  const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';

  // Calculate editor height based on number of lines (line height ~19px + padding)
  const calculateHeight = (text: string) => {
    const lines = text.split('\n').length;
    return lines * 19 + 16; // 19px per line + 16px total padding (8px top + 8px bottom)
  };

  return (
    <div className="rounded-lg border bg-card/50 overflow-hidden">
      <Editor
        value={code}
        language={language}
        theme={editorTheme}
        height={calculateHeight(code)}
        options={{
          readOnly: true,
          minimap: {enabled: false},
          scrollBeyondLastLine: false,
          scrollbar: {alwaysConsumeMouseWheel: false},
          lineNumbers: 'off',
          folding: false,
          glyphMargin: false,
          renderLineHighlight: 'none',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          wordWrap: 'on',
          fontSize: 12,
          padding: {top: 8, bottom: 8},
        }}
      />
    </div>
  );
}

