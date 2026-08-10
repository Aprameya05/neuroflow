/**
 * AdaptiveEditor -- the core demo component.
 *
 * A CodeMirror editor that adapts based on cognitive load:
 *
 * rich     (< 21%)  -- full feature set: file tree, minimap, all panels visible
 * normal   (< 35%)  -- standard editor with sidebar
 * reduced  (< 65%)  -- sidebar collapsed, fewer distractions, larger font
 * minimal  (> 65%)  -- pure editor, everything else hidden, focus mode
 *
 * Each adaptation is grounded in cognitive load research:
 * - Reduced information density under high load (Sweller, 1988)
 * - Larger text reduces perceptual load (Paas & van Merrienboer, 1994)
 * - Suppressing irrelevant stimuli improves task performance (Lavie, 2005)
 */
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion } from "@codemirror/autocomplete";
import { useState, useEffect } from "react";
import type { UIState } from "../hooks/useNeuroFlow";

interface AdaptiveEditorProps {
  uiState: UIState;
  score: number;
  onCodeChange?: (code: string) => void;
}

const STARTER_CODE = `# Welcome to NeuroFlow Editor
# This editor adapts to your cognitive load in real time.
# Try typing quickly with errors vs slowly and carefully.
# Watch the interface change.

def fibonacci(n: int) -> int:
    """
    Return the nth Fibonacci number.
    
    Args:
        n: The position in the sequence (0-indexed)
    
    Returns:
        The nth Fibonacci number
    """
    if n < 0:
        raise ValueError("n must be non-negative")
    if n <= 1:
        return n
    
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b


def is_prime(n: int) -> bool:
    """Check if a number is prime."""
    if n < 2:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    for i in range(3, int(n ** 0.5) + 1, 2):
        if n % i == 0:
            return False
    return True


# Try editing this code -- your cognitive load updates in real time
result = [fibonacci(i) for i in range(10)]
primes = [x for x in range(100) if is_prime(x)]
print(f"First 10 Fibonacci numbers: {result}")
print(f"Primes under 100: {primes}")
`;

// Adaptation values derived from cognitive load score
function getAdaptations(uiState: UIState, score: number) {
  const adaptations = {
    rich: {
      fontSize: 13,
      lineHeight: 1.5,
      showMinimap: true,
      showLineNumbers: true,
      showSidebar: true,
      sidebarWidth: 220,
      showStatusBar: true,
      showFileTree: true,
      autocompleteDelay: 200,
      padding: "12px 16px",
      opacity: 1,
      animationDuration: "0.15s",
      showProblems: true,
    },
    normal: {
      fontSize: 14,
      lineHeight: 1.55,
      showMinimap: false,
      showLineNumbers: true,
      showSidebar: true,
      sidebarWidth: 200,
      showStatusBar: true,
      showFileTree: true,
      autocompleteDelay: 300,
      padding: "12px 16px",
      opacity: 1,
      animationDuration: "0.2s",
      showProblems: true,
    },
    reduced: {
      fontSize: 15,
      lineHeight: 1.6,
      showMinimap: false,
      showLineNumbers: true,
      showSidebar: false,
      sidebarWidth: 0,
      showStatusBar: false,
      showFileTree: false,
      autocompleteDelay: 100,  // more aggressive: help the user
      padding: "16px 24px",
      opacity: 0.95,
      animationDuration: "0.3s",
      showProblems: false,     // hide distracting error markers
    },
    minimal: {
      fontSize: 16,
      lineHeight: 1.7,
      showMinimap: false,
      showLineNumbers: false,  // remove visual noise
      showSidebar: false,
      sidebarWidth: 0,
      showStatusBar: false,
      showFileTree: false,
      autocompleteDelay: 50,   // maximum assistance
      padding: "24px 32px",
      opacity: 0.9,
      animationDuration: "0.4s",
      showProblems: false,
    },
  };
  return adaptations[uiState];
}

const FILES = [
  { name: "main.py", lang: "python", active: true },
  { name: "utils.py", lang: "python", active: false },
  { name: "tests.py", lang: "python", active: false },
  { name: "config.js", lang: "javascript", active: false },
];

export function AdaptiveEditor({ uiState, score, onCodeChange }: AdaptiveEditorProps) {
  const [code, setCode] = useState(STARTER_CODE);
  const [activeFile, setActiveFile] = useState("main.py");
  const adapt = getAdaptations(uiState, score);

  const pct = Math.round(score * 100);
  const loadColor = score < 0.35 ? "#22c55e" : score < 0.65 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "#0f1117",
      transition: `all ${adapt.animationDuration} ease`,
    }}>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        background: "#161b22",
        borderBottom: "1px solid #21262d",
        padding: "0 8px",
        gap: 2,
        flexShrink: 0,
        transition: `all ${adapt.animationDuration} ease`,
      }}>
        {FILES.map(file => (
          <button
            key={file.name}
            onClick={() => setActiveFile(file.name)}
            style={{
              padding: "8px 16px",
              background: activeFile === file.name ? "#0f1117" : "transparent",
              color: activeFile === file.name ? "#e2e8f0" : "#8b949e",
              border: "none",
              borderTop: activeFile === file.name ? `2px solid ${loadColor}` : "2px solid transparent",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "monospace",
              transition: "all 0.2s",
            }}
          >
            {file.name}
          </button>
        ))}

        {/* Load indicator in tab bar */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, paddingRight: 8 }}>
          <div style={{
            width: 60, height: 4, background: "#21262d", borderRadius: 2,
          }}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: loadColor, borderRadius: 2,
              transition: "width 0.5s ease, background 0.5s ease",
            }} />
          </div>
          <span style={{ fontSize: 11, color: "#8b949e", fontFamily: "monospace" }}>
            {pct}%
          </span>
        </div>
      </div>

      {/* Main area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* File tree sidebar */}
        {adapt.showSidebar && (
          <div style={{
            width: adapt.sidebarWidth,
            background: "#161b22",
            borderRight: "1px solid #21262d",
            padding: "8px 0",
            flexShrink: 0,
            overflow: "hidden",
            transition: `width ${adapt.animationDuration} ease`,
          }}>
            <div style={{ padding: "4px 12px 8px", fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Explorer
            </div>
            {FILES.map(file => (
              <div
                key={file.name}
                onClick={() => setActiveFile(file.name)}
                style={{
                  padding: "5px 16px",
                  fontSize: 13,
                  color: activeFile === file.name ? "#e2e8f0" : "#8b949e",
                  background: activeFile === file.name ? "#1f2937" : "transparent",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 11 }}>
                  {file.lang === "python" ? "🐍" : "⚡"}
                </span>
                {file.name}
              </div>
            ))}

            {/* Git panel -- only visible in rich/normal mode */}
            {adapt.showFileTree && (
              <div style={{ marginTop: 16 }}>
                <div style={{ padding: "4px 12px 8px", fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Source Control
                </div>
                {["M main.py", "? utils.py"].map(item => (
                  <div key={item} style={{ padding: "4px 16px", fontSize: 12, color: "#8b949e", fontFamily: "monospace" }}>
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Editor */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <CodeMirror
            value={code}
            height="100%"
            theme={oneDark}
            extensions={[
              activeFile.endsWith(".py") ? python() : javascript(),
              autocompletion({ activateOnTyping: true }),
            ]}
            onChange={(val) => {
              setCode(val);
              onCodeChange?.(val);
            }}
            basicSetup={{
              lineNumbers: adapt.showLineNumbers,
              foldGutter: adapt.showSidebar,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
              autocompletion: true,
            }}
            style={{
              fontSize: adapt.fontSize,
              flex: 1,
              height: "100%",
            }}
          />
        </div>
      </div>

      {/* Status bar */}
      {adapt.showStatusBar && (
        <div style={{
          background: "#161b22",
          borderTop: "1px solid #21262d",
          padding: "4px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#8b949e",
          flexShrink: 0,
          transition: `opacity ${adapt.animationDuration} ease`,
        }}>
          <div style={{ display: "flex", gap: 16 }}>
            <span>{activeFile}</span>
            <span>Python 3.11</span>
            <span>UTF-8</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: loadColor }}>
              NeuroFlow: {uiState} mode
            </span>
            <span>Ln 1, Col 1</span>
          </div>
        </div>
      )}
    </div>
  );
}
