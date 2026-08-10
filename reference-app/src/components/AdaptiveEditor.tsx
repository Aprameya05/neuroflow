/**
 * AdaptiveEditor -- core adaptive CodeMirror editor component.
 * Grounded in cognitive load theory (Sweller 1988, Paas & van Merrienboer 1994, Lavie 2005).
 */
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion } from "@codemirror/autocomplete";
import { useState } from "react";
import type { UIState } from "../hooks/useNeuroFlow";
import { getLoadColor, getLoadColorRgba } from "../utils/theme";

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

// Adaptation values derived from cognitive load score -- UNCHANGED logic & thresholds
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
      padding: "16px 20px",
      opacity: 1,
      animationDuration: "0.4s",
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
      padding: "16px 20px",
      opacity: 1,
      animationDuration: "0.4s",
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
      padding: "20px 28px",
      opacity: 0.96,
      animationDuration: "0.5s",
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
      padding: "28px 40px",
      opacity: 0.92,
      animationDuration: "0.6s",
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
  const loadColor = getLoadColor(score);
  const loadGlowLow = getLoadColorRgba(score, 0.12);
  const loadGlowHigh = getLoadColorRgba(score, 0.35);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: "100%",
      background: "#0a0d14",
      position: "relative",
      overflow: "hidden",
      transition: `background ${adapt.animationDuration} cubic-bezier(0.16, 1, 0.3, 1)`,
    }}>
      {/* File Tab bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        background: "rgba(12, 16, 26, 0.9)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        padding: "0 8px",
        height: 38,
        flexShrink: 0,
        position: "relative",
        zIndex: 5,
        transition: `all ${adapt.animationDuration} ease`,
      }}>
        <div style={{ display: "flex", alignItems: "center", height: "100%", gap: 2 }}>
          {FILES.map(file => {
            const isActive = activeFile === file.name;
            return (
              <button
                key={file.name}
                onClick={() => setActiveFile(file.name)}
                style={{
                  height: "100%",
                  padding: "0 16px",
                  background: isActive ? "#0a0d14" : "transparent",
                  color: isActive ? "#f8fafc" : "#64748b",
                  border: "none",
                  borderBottom: isActive ? `2px solid ${loadColor}` : "2px solid transparent",
                  boxShadow: isActive ? `inset 0 -8px 12px ${loadGlowLow}` : "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: isActive ? 600 : 400,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  position: "relative",
                }}
              >
                <span style={{
                  fontSize: 12,
                  opacity: isActive ? 1 : 0.6,
                }}>
                  {file.lang === "python" ? "🐍" : "⚡"}
                </span>
                <span>{file.name}</span>
                {isActive && (
                  <div style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: loadColor,
                    boxShadow: `0 0 10px ${loadColor}`,
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Load indicator progress bar bleeding across the top/bottom of tab bar */}
        <div style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingRight: 12,
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "3px 10px",
            borderRadius: 14,
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
          }}>
            <div style={{
              width: 90,
              height: 5,
              background: "rgba(255, 255, 255, 0.08)",
              borderRadius: 3,
              overflow: "hidden",
              position: "relative",
            }}>
              <div style={{
                width: `${pct}%`,
                height: "100%",
                background: `linear-gradient(90deg, #6366f1 0%, #f59e0b 50%, #ef4444 100%)`,
                borderRadius: 3,
                boxShadow: `0 0 10px ${loadColor}`,
                transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
              }} />
            </div>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: loadColor,
              fontFamily: "'JetBrains Mono', monospace",
              minWidth: 32,
              textAlign: "right",
            }}>
              {pct}%
            </span>
          </div>
        </div>
      </div>

      {/* Main editor area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Animated sliding File tree sidebar */}
        <div style={{
          width: adapt.showSidebar ? adapt.sidebarWidth : 0,
          opacity: adapt.showSidebar ? 1 : 0,
          transform: adapt.showSidebar ? "translateX(0)" : "translateX(-20px)",
          background: "rgba(12, 16, 26, 0.85)",
          borderRight: adapt.showSidebar ? "1px solid rgba(255, 255, 255, 0.06)" : "none",
          flexShrink: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          transition: `width ${adapt.animationDuration} cubic-bezier(0.16, 1, 0.3, 1), opacity ${adapt.animationDuration} ease, transform ${adapt.animationDuration} cubic-bezier(0.16, 1, 0.3, 1)`,
          position: "relative",
        }}>
          {/* Cyber grid / particle background in Rich mode */}
          {uiState === "rich" && (
            <div style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `
                radial-gradient(circle at 50% 30%, ${loadGlowHigh} 0%, transparent 65%),
                linear-gradient(to bottom, rgba(99, 102, 241, 0.04) 1px, transparent 1px)
              `,
              backgroundSize: "100% 100%, 100% 16px",
              pointerEvents: "none",
              zIndex: 0,
            }} />
          )}

          <div style={{ position: "relative", zIndex: 1, padding: "12px 0" }}>
            <div style={{
              padding: "4px 16px 8px",
              fontSize: 10,
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}>
              Explorer
            </div>
            {FILES.map(file => {
              const isActive = activeFile === file.name;
              return (
                <div
                  key={file.name}
                  onClick={() => setActiveFile(file.name)}
                  style={{
                    padding: "7px 16px",
                    fontSize: 13,
                    color: isActive ? "#f8fafc" : "#94a3b8",
                    background: isActive ? getLoadColorRgba(score, 0.12) : "transparent",
                    borderLeft: isActive ? `3px solid ${loadColor}` : "3px solid transparent",
                    cursor: "pointer",
                    fontFamily: "'JetBrains Mono', monospace",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.2s ease",
                  }}
                >
                  <span style={{ fontSize: 12 }}>
                    {file.lang === "python" ? "🐍" : "⚡"}
                  </span>
                  <span>{file.name}</span>
                </div>
              );
            })}

            {/* Git panel -- only visible in rich/normal mode */}
            {adapt.showFileTree && (
              <div style={{ marginTop: 24, borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: 16 }}>
                <div style={{
                  padding: "4px 16px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <span>Source Control</span>
                  <span style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 8,
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "#6366f1",
                  }}>main*</span>
                </div>
                {[
                  { file: "M main.py", color: "#f59e0b" },
                  { file: "? utils.py", color: "#34d399" },
                ].map(item => (
                  <div
                    key={item.file}
                    style={{
                      padding: "6px 16px",
                      fontSize: 12,
                      color: "#94a3b8",
                      fontFamily: "'JetBrains Mono', monospace",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ color: item.color, fontWeight: 700, fontSize: 11 }}>
                      {item.file.substring(0, 1)}
                    </span>
                    <span>{item.file.substring(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CodeMirror Editor canvas container */}
        <div style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: adapt.padding,
          opacity: adapt.opacity,
          transition: `all ${adapt.animationDuration} cubic-bezier(0.16, 1, 0.3, 1)`,
          background: "#0a0d14",
        }}>
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
              lineHeight: adapt.lineHeight,
              flex: 1,
              height: "100%",
              borderRadius: 8,
              overflow: "hidden",
            }}
          />
        </div>
      </div>

      {/* Sleek status bar */}
      <div style={{
        height: adapt.showStatusBar ? 26 : 0,
        opacity: adapt.showStatusBar ? 1 : 0,
        background: "rgba(10, 13, 20, 0.95)",
        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 11,
        color: "#64748b",
        fontFamily: "'JetBrains Mono', monospace",
        flexShrink: 0,
        transition: `all ${adapt.animationDuration} cubic-bezier(0.16, 1, 0.3, 1)`,
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ color: "#94a3b8" }}>{activeFile}</span>
          <span style={{ color: "#475569" }}>•</span>
          <span>Python 3.11</span>
          <span style={{ color: "#475569" }}>•</span>
          <span>UTF-8</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{
            color: loadColor,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: loadColor, boxShadow: `0 0 8px ${loadColor}`,
            }} />
            NeuroFlow: {uiState} mode
          </span>
          <span>Ln 1, Col 1</span>
        </div>
      </div>
    </div>
  );
}
