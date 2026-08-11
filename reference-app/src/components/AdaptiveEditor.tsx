/**
 * AdaptiveEditor -- core adaptive CodeMirror editor component.
 * Grounded in cognitive load theory (Sweller 1988, Paas & van Merrienboer 1994, Lavie 2005).
 */
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { useState } from "react";
import type { UIState } from "../hooks/useNeuroFlow";
import { getLoadColor, getLoadColorRgba } from "../utils/theme";

interface AdaptiveEditorProps {
  uiState: UIState;
  score: number;
  onCodeChange?: (code: string) => void;
  readOnly?: boolean;
}

// ── Starter file contents ────────────────────────────────────────────────────

const FILE_CONTENTS: Record<string, string> = {
  "main.py": `"""
NeuroFlow Demo — Adaptive Code Editor
Type fast with errors to raise cognitive load. Type slowly and carefully to lower it.
Watch the interface adapt in real time.
"""
from __future__ import annotations
import time
import math
from typing import Iterator, Callable, TypeVar

T = TypeVar("T")


# ── Core data structures ─────────────────────────────────────────────────────

class PriorityQueue:
    """
    Min-heap priority queue for Dijkstra and A* pathfinding.
    O(log n) push and pop, O(n) build from iterable.
    """
    def __init__(self) -> None:
        self._heap: list[tuple[float, object]] = []

    def push(self, priority: float, item: object) -> None:
        self._heap.append((priority, item))
        self._sift_up(len(self._heap) - 1)

    def pop(self) -> tuple[float, object]:
        if not self._heap:
            raise IndexError("pop from empty PriorityQueue")
        self._heap[0], self._heap[-1] = self._heap[-1], self._heap[0]
        val = self._heap.pop()
        if self._heap:
            self._sift_down(0)
        return val

    def __len__(self) -> int:
        return len(self._heap)

    def _sift_up(self, idx: int) -> None:
        while idx > 0:
            parent = (idx - 1) // 2
            if self._heap[parent][0] > self._heap[idx][0]:
                self._heap[parent], self._heap[idx] = self._heap[idx], self._heap[parent]
                idx = parent
            else:
                break

    def _sift_down(self, idx: int) -> None:
        n = len(self._heap)
        while True:
            smallest, left, right = idx, 2 * idx + 1, 2 * idx + 2
            if left < n and self._heap[left][0] < self._heap[smallest][0]:
                smallest = left
            if right < n and self._heap[right][0] < self._heap[smallest][0]:
                smallest = right
            if smallest == idx:
                break
            self._heap[idx], self._heap[smallest] = self._heap[smallest], self._heap[idx]
            idx = smallest


# ── Functional utilities ─────────────────────────────────────────────────────

def compose(*fns: Callable) -> Callable:
    """Right-to-left function composition. compose(f, g)(x) == f(g(x))."""
    def composed(x):
        result = x
        for fn in reversed(fns):
            result = fn(result)
        return result
    return composed


def memoize(fn: Callable[..., T]) -> Callable[..., T]:
    """LRU cache with unbounded size. Handles unhashable args gracefully."""
    cache: dict = {}
    def wrapper(*args):
        if args not in cache:
            cache[args] = fn(*args)
        return cache[args]
    return wrapper


@memoize
def collatz_length(n: int) -> int:
    """Return the number of steps to reach 1 in the Collatz sequence."""
    steps = 0
    while n != 1:
        n = n // 2 if n % 2 == 0 else 3 * n + 1
        steps += 1
    return steps


def sieve_of_eratosthenes(limit: int) -> list[int]:
    """Return all primes up to limit using the Sieve of Eratosthenes."""
    is_prime = [True] * (limit + 1)
    is_prime[0] = is_prime[1] = False
    for i in range(2, int(math.isqrt(limit)) + 1):
        if is_prime[i]:
            for j in range(i * i, limit + 1, i):
                is_prime[j] = False
    return [i for i, p in enumerate(is_prime) if p]


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    primes = sieve_of_eratosthenes(1000)
    print(f"Primes under 1000: {len(primes)} found, largest = {primes[-1]}")

    # Longest Collatz chain under 1000
    champion = max(range(1, 1000), key=collatz_length)
    print(f"Longest Collatz under 1000: starts at {champion}, length {collatz_length(champion)}")

    pq: PriorityQueue = PriorityQueue()
    for p in primes[:10]:
        pq.push(p, f"prime-{p}")
    print(f"PriorityQueue pop: {pq.pop()}")
`,

  "data_analysis.py": `"""
Behavioral Signal Analysis — NeuroFlow Research
Computes descriptive stats and simple correlations over raw signal windows.
Run this after a recording session to inspect what drove your cognitive load.
"""
from __future__ import annotations
import math
import statistics
from dataclasses import dataclass, field
from typing import Sequence


@dataclass
class SignalWindow:
    """
    One analysis window of behavioral signals (default: 3 seconds).
    All values are already normalised to [0, 1] by the backend.
    """
    timestamp_ms: int
    keystroke_iki_ms: float      # inter-key interval (lower → faster typing)
    mouse_velocity: float        # avg mouse speed this window
    mouse_acceleration: float    # change in mouse speed
    mouse_direction_changes: int # number of direction reversals
    scroll_velocity: float       # avg scroll speed
    error_rate: float            # Backspace/Delete / total keys
    pause_duration_ms: float     # ms since last keypress
    tab_switches: int            # tab/window switches
    copy_paste_count: int        # copy + paste events
    ground_truth_load: float = 0.0  # from NASA-TLX (0–1), if available


@dataclass
class AnalysisResult:
    """Summary statistics for a collection of signal windows."""
    n: int
    mean: dict[str, float] = field(default_factory=dict)
    std: dict[str, float] = field(default_factory=dict)
    pearson_with_load: dict[str, float] = field(default_factory=dict)
    top_predictors: list[tuple[str, float]] = field(default_factory=list)


SIGNAL_FIELDS = [
    "keystroke_iki_ms", "mouse_velocity", "mouse_acceleration",
    "mouse_direction_changes", "scroll_velocity", "error_rate",
    "pause_duration_ms", "tab_switches", "copy_paste_count",
]


def pearson(xs: Sequence[float], ys: Sequence[float]) -> float:
    """Pearson correlation coefficient between two sequences."""
    n = len(xs)
    if n < 2:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = math.sqrt(
        sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)
    )
    return num / den if den > 0 else 0.0


def analyse(windows: list[SignalWindow]) -> AnalysisResult:
    """Compute descriptive stats and correlations for a list of signal windows."""
    if not windows:
        return AnalysisResult(n=0)

    result = AnalysisResult(n=len(windows))
    loads = [w.ground_truth_load for w in windows]

    for field_name in SIGNAL_FIELDS:
        vals = [float(getattr(w, field_name)) for w in windows]
        result.mean[field_name] = statistics.mean(vals)
        result.std[field_name] = statistics.stdev(vals) if len(vals) > 1 else 0.0
        result.pearson_with_load[field_name] = pearson(vals, loads)

    # Rank predictors by absolute Pearson |r|
    result.top_predictors = sorted(
        result.pearson_with_load.items(),
        key=lambda kv: abs(kv[1]),
        reverse=True,
    )
    return result


def z_score_normalise(values: list[float]) -> list[float]:
    """Z-score normalise a list of floats. Returns original if std == 0."""
    if len(values) < 2:
        return values
    mu = statistics.mean(values)
    sigma = statistics.stdev(values)
    if sigma == 0:
        return [0.0] * len(values)
    return [(v - mu) / sigma for v in values]


if __name__ == "__main__":
    import random
    rng = random.Random(42)

    # Simulate 60 windows (3 min of data at 3s windows)
    synthetic = [
        SignalWindow(
            timestamp_ms=i * 3000,
            keystroke_iki_ms=rng.gauss(120, 40),
            mouse_velocity=rng.uniform(0, 1),
            mouse_acceleration=rng.uniform(0, 0.5),
            mouse_direction_changes=rng.randint(0, 8),
            scroll_velocity=rng.uniform(0, 0.3),
            error_rate=rng.uniform(0, 0.15),
            pause_duration_ms=rng.gauss(500, 200),
            tab_switches=rng.randint(0, 2),
            copy_paste_count=rng.randint(0, 3),
            ground_truth_load=min(1.0, max(0.0, rng.gauss(0.5, 0.2))),
        )
        for i in range(60)
    ]

    res = analyse(synthetic)
    print(f"Analysis over {res.n} windows")
    print("\\nTop predictors of cognitive load (|Pearson r|):")
    for name, r in res.top_predictors:
        bar = "█" * int(abs(r) * 20)
        print(f"  {name:<30} r={r:+.3f}  {bar}")
`,

  "algorithms.py": `"""
Classic Algorithms — NeuroFlow Demo
Intentionally complex code to keep your cognitive load interesting.
Edit, refactor, or extend — the editor adapts to how you work.
"""
from __future__ import annotations
from typing import TypeVar, Generic, Iterator, Optional

T = TypeVar("T")


# ── Sorting ───────────────────────────────────────────────────────────────────

def merge_sort(arr: list[T]) -> list[T]:
    """Stable O(n log n) merge sort."""
    if len(arr) <= 1:
        return arr[:]
    mid = len(arr) // 2
    left, right = merge_sort(arr[:mid]), merge_sort(arr[mid:])
    return _merge(left, right)


def _merge(a: list[T], b: list[T]) -> list[T]:
    result, i, j = [], 0, 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:  # type: ignore[operator]
            result.append(a[i]); i += 1
        else:
            result.append(b[j]); j += 1
    return result + a[i:] + b[j:]


def quicksort(arr: list[T], lo: int = 0, hi: Optional[int] = None) -> None:
    """In-place randomised quicksort (Lomuto partition scheme)."""
    import random
    if hi is None:
        hi = len(arr) - 1
    if lo < hi:
        pivot_idx = random.randint(lo, hi)
        arr[pivot_idx], arr[hi] = arr[hi], arr[pivot_idx]
        pivot = arr[hi]
        i = lo - 1
        for j in range(lo, hi):
            if arr[j] <= pivot:  # type: ignore[operator]
                i += 1
                arr[i], arr[j] = arr[j], arr[i]
        arr[i + 1], arr[hi] = arr[hi], arr[i + 1]
        p = i + 1
        quicksort(arr, lo, p - 1)
        quicksort(arr, p + 1, hi)


# ── Graph algorithms ─────────────────────────────────────────────────────────

Graph = dict[str, list[tuple[str, float]]]


def dijkstra(graph: Graph, source: str) -> dict[str, float]:
    """
    Single-source shortest paths (non-negative weights).
    Returns distance dict; unreachable nodes map to infinity.
    """
    import heapq
    dist: dict[str, float] = {source: 0.0}
    heap: list[tuple[float, str]] = [(0.0, source)]

    while heap:
        d, u = heapq.heappop(heap)
        if d > dist.get(u, float("inf")):
            continue
        for v, w in graph.get(u, []):
            new_d = d + w
            if new_d < dist.get(v, float("inf")):
                dist[v] = new_d
                heapq.heappush(heap, (new_d, v))
    return dist


def bfs(graph: dict[str, list[str]], start: str) -> Iterator[str]:
    """Breadth-first traversal; yields nodes in BFS order."""
    from collections import deque
    visited = {start}
    queue: deque[str] = deque([start])
    while queue:
        node = queue.popleft()
        yield node
        for neighbour in graph.get(node, []):
            if neighbour not in visited:
                visited.add(neighbour)
                queue.append(neighbour)


# ── Dynamic programming ───────────────────────────────────────────────────────

def longest_common_subsequence(a: str, b: str) -> str:
    """Return the LCS of strings a and b."""
    m, n = len(a), len(b)
    dp = [[""] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + a[i - 1]
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1], key=len)
    return dp[m][n]


def knapsack_01(weights: list[int], values: list[int], capacity: int) -> int:
    """0/1 knapsack — returns the maximum value achievable within capacity."""
    n = len(weights)
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        w, v = weights[i - 1], values[i - 1]
        for c in range(capacity + 1):
            dp[i][c] = dp[i - 1][c]
            if w <= c:
                dp[i][c] = max(dp[i][c], dp[i - 1][c - w] + v)
    return dp[n][capacity]


# ── Generic linked list ───────────────────────────────────────────────────────

class Node(Generic[T]):
    __slots__ = ("val", "next")
    def __init__(self, val: T, nxt: Optional["Node[T]"] = None) -> None:
        self.val = val
        self.next = nxt


class LinkedList(Generic[T]):
    def __init__(self) -> None:
        self._head: Optional[Node[T]] = None
        self._size = 0

    def prepend(self, val: T) -> None:
        self._head = Node(val, self._head)
        self._size += 1

    def reverse(self) -> None:
        prev, curr = None, self._head
        while curr:
            nxt = curr.next
            curr.next = prev
            prev = curr
            curr = nxt
        self._head = prev

    def __iter__(self) -> Iterator[T]:
        node = self._head
        while node:
            yield node.val
            node = node.next

    def __len__(self) -> int:
        return self._size

    def __repr__(self) -> str:
        return " → ".join(str(v) for v in self) or "(empty)"


if __name__ == "__main__":
    # Sorting demo
    data = [5, 2, 9, 1, 7, 3, 8, 4, 6]
    print("Merge sort:", merge_sort(data))

    qs = data[:]
    quicksort(qs)
    print("Quicksort: ", qs)

    # Graph demo
    g: Graph = {
        "A": [("B", 1), ("C", 4)],
        "B": [("C", 2), ("D", 5)],
        "C": [("D", 1)],
        "D": [],
    }
    print("Dijkstra from A:", dijkstra(g, "A"))

    # LCS demo
    print("LCS:", longest_common_subsequence("AGGTAB", "GXTXAYB"))

    # Linked list demo
    ll: LinkedList[int] = LinkedList()
    for x in range(1, 6):
        ll.prepend(x)
    print("Before reverse:", ll)
    ll.reverse()
    print("After reverse: ", ll)
`,

  "config.js": `/**
 * NeuroFlow editor configuration
 * Tweak thresholds and behaviour to match your own cognitive profile.
 */

export const NEUROFLOW_CONFIG = {
  // WebSocket backend URL
  wsUrl: "wss://neuroflow-backend-r6rs.onrender.com/ws/signal",

  // Signal collection
  sampleRateMs: 100,           // how often signals are sent to the backend

  // Warmup: ignore estimates for the first N ms to let the model stabilise
  warmupMs: 5000,

  // Smoothing: EMA alpha (lower = smoother, higher = more reactive)
  emaAlpha: 0.12,

  // UI state thresholds (0–1 load scale)
  thresholds: {
    rich:    0.21,             // below this → rich UI (full feature set)
    normal:  0.35,             // below this → normal UI
    reduced: 0.65,             // below this → reduced UI
    // above 0.65 → minimal (zen) mode
  },

  // Debounce: how many ms the load must be stable before switching state
  stateDebounceMs: 2000,

  // Adaptation settings per state
  adaptations: {
    rich: {
      fontSize: 13,
      lineHeight: 1.5,
      showSidebar: true,
      showStatusBar: true,
      showLineNumbers: true,
      autocompleteDelayMs: 200,
    },
    normal: {
      fontSize: 14,
      lineHeight: 1.55,
      showSidebar: true,
      showStatusBar: true,
      showLineNumbers: true,
      autocompleteDelayMs: 300,
    },
    reduced: {
      fontSize: 15,
      lineHeight: 1.6,
      showSidebar: false,
      showStatusBar: false,
      showLineNumbers: true,
      autocompleteDelayMs: 100,
    },
    minimal: {
      fontSize: 16,
      lineHeight: 1.7,
      showSidebar: false,
      showStatusBar: false,
      showLineNumbers: false,
      autocompleteDelayMs: 50,
    },
  },
};
`,
};

// Adaptation values derived from cognitive load score -- UNCHANGED logic & thresholds
function getAdaptations(uiState: UIState) {
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
  { name: "main.py",          lang: "python",     emoji: "🐍" },
  { name: "data_analysis.py", lang: "python",     emoji: "📊" },
  { name: "algorithms.py",    lang: "python",     emoji: "⚙️" },
  { name: "config.js",        lang: "javascript", emoji: "⚡" },
];

export function AdaptiveEditor({ uiState, score, onCodeChange, readOnly = false }: AdaptiveEditorProps) {
  const [activeFile, setActiveFile] = useState("main.py");
  const [fileContents, setFileContents] = useState<Record<string, string>>(FILE_CONTENTS);

  const adapt = getAdaptations(uiState);
  const code = fileContents[activeFile] ?? "";

  const pct = Math.round(score * 100);
  const loadColor = getLoadColor(score);
  const loadGlowLow = getLoadColorRgba(score, 0.12);
  const loadGlowHigh = getLoadColorRgba(score, 0.35);

  const handleChange = (val: string) => {
    setFileContents(prev => ({ ...prev, [activeFile]: val }));
    onCodeChange?.(val);
  };

  const extensions = [
    activeFile.endsWith(".py") ? python() : javascript(),
    autocompletion({ activateOnTyping: true }),
    ...(readOnly ? [EditorView.editable.of(false)] : []),
  ];

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
                  padding: "0 14px",
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
                  gap: 7,
                  transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 11, opacity: isActive ? 1 : 0.6 }}>{file.emoji}</span>
                <span>{file.name}</span>
                {isActive && (
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    height: 2, background: loadColor, boxShadow: `0 0 10px ${loadColor}`,
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Load indicator + shortcut hint */}
        <div style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingRight: 12,
        }}>
          {/* Shortcut hint */}
          <div style={{
            fontSize: 10,
            color: "#475569",
            fontFamily: "'JetBrains Mono', monospace",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}>
            <span style={{ padding: "1px 4px", background: "rgba(255,255,255,0.05)", borderRadius: 3, border: "1px solid rgba(255,255,255,0.08)" }}>Ctrl</span>
            <span>+</span>
            <span style={{ padding: "1px 4px", background: "rgba(255,255,255,0.05)", borderRadius: 3, border: "1px solid rgba(255,255,255,0.08)" }}>1-4</span>
            <span style={{ marginLeft: 2 }}>demo states</span>
          </div>

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
              width: 90, height: 5,
              background: "rgba(255, 255, 255, 0.08)",
              borderRadius: 3, overflow: "hidden", position: "relative",
            }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: `linear-gradient(90deg, #6366f1 0%, #f59e0b 50%, #ef4444 100%)`,
                borderRadius: 3, boxShadow: `0 0 10px ${loadColor}`,
                transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
              }} />
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, color: loadColor,
              fontFamily: "'JetBrains Mono', monospace",
              minWidth: 32, textAlign: "right",
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
          {uiState === "rich" && (
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: `
                radial-gradient(circle at 50% 30%, ${loadGlowHigh} 0%, transparent 65%),
                linear-gradient(to bottom, rgba(99, 102, 241, 0.04) 1px, transparent 1px)
              `,
              backgroundSize: "100% 100%, 100% 16px",
              pointerEvents: "none", zIndex: 0,
            }} />
          )}

          <div style={{ position: "relative", zIndex: 1, padding: "12px 0" }}>
            <div style={{
              padding: "4px 16px 8px",
              fontSize: 10, fontWeight: 700, color: "#475569",
              textTransform: "uppercase", letterSpacing: "0.12em",
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
                    display: "flex", alignItems: "center", gap: 8,
                    transition: "all 0.2s ease",
                  }}
                >
                  <span style={{ fontSize: 12 }}>{file.emoji}</span>
                  <span>{file.name}</span>
                </div>
              );
            })}

            {/* Git panel -- only visible in rich/normal mode */}
            {adapt.showFileTree && (
              <div style={{ marginTop: 24, borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: 16 }}>
                <div style={{
                  padding: "4px 16px 8px",
                  fontSize: 10, fontWeight: 700, color: "#475569",
                  textTransform: "uppercase", letterSpacing: "0.12em",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span>Source Control</span>
                  <span style={{
                    fontSize: 9, padding: "1px 5px", borderRadius: 8,
                    background: "rgba(99, 102, 241, 0.15)", color: "#6366f1",
                  }}>main*</span>
                </div>
                {[
                  { file: "M main.py",          color: "#f59e0b" },
                  { file: "M data_analysis.py", color: "#f59e0b" },
                  { file: "? algorithms.py",    color: "#34d399" },
                ].map(item => (
                  <div key={item.file} style={{
                    padding: "6px 16px",
                    fontSize: 12, color: "#94a3b8",
                    fontFamily: "'JetBrains Mono', monospace",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ color: item.color, fontWeight: 700, fontSize: 11 }}>
                      {item.file[0]}
                    </span>
                    <span>{item.file.slice(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CodeMirror editor canvas */}
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
            extensions={extensions}
            onChange={handleChange}
            readOnly={readOnly}
            basicSetup={{
              lineNumbers: adapt.showLineNumbers,
              foldGutter: adapt.showSidebar,
              highlightActiveLine: !readOnly,
              highlightSelectionMatches: true,
              autocompletion: !readOnly,
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

      {/* Status bar */}
      <div style={{
        height: adapt.showStatusBar ? 26 : 0,
        opacity: adapt.showStatusBar ? 1 : 0,
        background: "rgba(10, 13, 20, 0.95)",
        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 11, color: "#64748b",
        fontFamily: "'JetBrains Mono', monospace",
        flexShrink: 0,
        transition: `all ${adapt.animationDuration} cubic-bezier(0.16, 1, 0.3, 1)`,
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ color: "#94a3b8" }}>{activeFile}</span>
          <span style={{ color: "#475569" }}>•</span>
          <span>{activeFile.endsWith(".py") ? "Python 3.11" : "JavaScript ES2022"}</span>
          <span style={{ color: "#475569" }}>•</span>
          <span>UTF-8</span>
          {readOnly && <span style={{ color: "#f59e0b" }}>• read-only</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: loadColor, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: loadColor, boxShadow: `0 0 8px ${loadColor}` }} />
            NeuroFlow: {uiState} mode
          </span>
          <span>Ln 1, Col 1</span>
        </div>
      </div>
    </div>
  );
}
