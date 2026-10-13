# VT Parser Structural Invariants (Phase 2)

## Methodology: VT100/VT220/xterm Escape Sequence Parser

Based on Paul Williams' DEC ANSI Parser specification (vt100.net/emu/dec_ansi_parser).

## Core Invariants

### 1. Two-Level Architecture (Block Scanner + State Machine)

**Invariant**: NOT all bytes go through the state machine. The parser has two levels:
- **Level 1**: Block scanner (ASCII fast path) — scans for special bytes
- **Level 2**: Scalar VT state machine — handles special bytes only

**Structural Properties**:
- ASCII printable bytes (0x20-0x7E) NEVER enter the state machine in steady state
- Block scanner accumulates runs of printable ASCII → `PrintRun(start_col, length, style)`
- When scanner finds special byte (ESC, C0 control, UTF-8 lead): switch to state machine
- State machine processes one byte at a time until back to Ground state
- After returning to Ground: resume block scanning

**Why This Invariant**:
- Terminal output is 95%+ printable ASCII in steady state
- State machine dispatch (table lookup + switch) is expensive per-byte
- Block scanning enables SIMD optimization later (Phase 13)
- PrintRun produces ONE dirty span, not N dirty cells

**Validation**:
- ASCII throughput must be >> escape sequence throughput
- Parser state transitions only occur on special bytes
- PrintRun calls produce contiguous dirty spans

### 2. State Machine Completeness (Every Byte, Every State)

**Invariant**: The parser specifies actions and transitions for EVERY incoming byte in EVERY state.

**Structural Properties**:
- States: Ground, Escape, CSI_Entry, CSI_Param, CSI_Intermediate, OSC, DCS, Utf8
- Actions: Print, Execute, Ignore, Collect, Param, EscDispatch, CsiDispatch, OscStart, OscPut, OscEnd, DcsHook, DcsPut, DcsUnhook, Clear, Error
- Transition table: `table[state][byte] → (action, next_state)`
- No undefined behavior — every byte has a defined action

**Why This Invariant**:
- PTY bytes can be random/pathological — parser must not crash
- DEC terminals exhibited consistent behavior for every input
- Completeness enables fuzzing and correctness testing

**Validation**:
- Fuzzing with random bytes never crashes
- Every state has 256 defined transitions
- Invalid sequences are gracefully ignored (not crash)

### 3. CSI Parameter Storage (Fixed Capacity, Zero Allocation)

**Invariant**: CSI parameters are stored in fixed-size arrays. No dynamic allocation in the common path.

**Structural Properties**:
```odin
CSI_Params :: struct {
    values: [16]u32,  // max 16 parameters (DEC limit)
    count:  u8,       // number of parameters collected
}
```
- Maximum 16 parameters (DEC specification)
- Parameters beyond 16th are silently ignored
- Each parameter is u32 (max value 2^32 - 1)
- Overflow → safely truncate or clamp

**Why This Invariant**:
- CSI sequences are high-frequency (SGR, CUP, etc.)
- Dynamic allocation per sequence is unacceptable
- 16 parameters covers 99.9% of real-world sequences

**Validation**:
- `ESC[1;2;3;...;16H` (16 params) → all stored
- `ESC[1;2;3;...;17H` (17 params) → 17th ignored, no crash
- Parameter value overflow → clamped, not crash

### 4. No Per-Character Callbacks (PrintRun, Not Print)

**Invariant**: Grid mutator receives runs of characters, not individual characters.

**Structural Properties**:
- `PrintRun(start_col, length, style)` — one call for N characters
- NOT `Print('h'); Print('e'); Print('l'); ...`
- Produces ONE dirty span: `[start_col, start_col + length)`
- Style is uniform across the run

**Why This Invariant**:
- Per-character callbacks produce N dirty spans → N damage marks
- PrintRun produces 1 dirty span → 1 damage mark
- Reduces damage tracking overhead by factor of N

**Validation**:
- "hello" (5 chars) → 1 PrintRun call, 1 dirty span
- NOT 5 Print calls, 5 dirty spans

### 5. Byte Classification (Lookup Table, Not Range Checks)

**Invariant**: Byte classification uses a 256-entry lookup table, not nested range checks.

**Structural Properties**:
```odin
Byte_Class :: enum u8 {
    PRINT,     // 0x20-0x7E (printable ASCII)
    C0,        // 0x00-0x1F (C0 controls)
    UTF8_LEAD, // 0xC0-0xFF (UTF-8 lead bytes)
    UTF8_CONT, // 0x80-0xBF (UTF-8 continuation bytes)
    ESC,       // 0x1B (escape)
    DIGIT,     // 0x30-0x39 (0-9)
    SEMI,      // 0x3B (;)
    COLON,     // 0x3A (:)
    INTERMEDIATE, // 0x20-0x2F (space to /)
    PRIVATE,   // 0x3C-0x3F (< = > ?)
    ALPHA,     // 0x40-0x7E (A-Z, a-z, etc.)
}

BYTE_CLASS: [256]Byte_Class = {...}
```
- Single table lookup: `class := BYTE_CLASS[byte]`
- No nested `if byte >= 0x20 && byte <= 0x7E` checks
- Compiler can optimize to single memory access

**Why This Invariant**:
- Byte classification is in the hottest loop
- Nested range checks are slower than table lookup
- Table is 256 bytes → fits in L1 cache

**Validation**:
- `BYTE_CLASS[0x41] == .ALPHA` (A)
- `BYTE_CLASS[0x1B] == .ESC`
- `BYTE_CLASS[0xC3] == .UTF8_LEAD`

### 6. UTF-8 Decoder (Separate State, Not Inline)

**Invariant**: UTF-8 decoding is a separate state machine, not inline in the VT parser.

**Structural Properties**:
```odin
UTF8_State :: enum u8 {
    Ground,  // expecting lead byte
    Byte2,   // expecting 1 continuation byte
    Byte3,   // expecting 2 continuation bytes
    Byte4,   // expecting 3 continuation bytes
}

UTF8_Decoder :: struct {
    state:  UTF8_State,
    buffer: [4]u8,
    len:    u8,
}
```
- ASCII (0x00-0x7F) NEVER enters UTF-8 decoder
- When byte >= 0x80: enter UTF-8 state
- Decode lead byte → determine sequence length
- Accumulate continuation bytes
- On complete sequence: emit rune, return to Ground
- On invalid sequence: emit replacement char (U+FFFD), return to Ground

**Why This Invariant**:
- UTF-8 decoding is orthogonal to VT state machine
- Separation enables independent testing
- Enables SIMD optimization later (Phase 13)

**Validation**:
- ASCII 'A' (0x41) → never enters UTF-8 decoder
- UTF-8 'é' (0xC3 0xA9) → 2-byte decode → rune U+00E9
- Invalid UTF-8 (0xC0 0x80) → replacement char U+FFFD

### 7. OSC/DCS Skipping (Recognize → Scan Delimiter → Discard)

**Invariant**: Sequences that don't affect visible state are recognized, scanned for delimiter, and discarded. No copy, allocate, parse, or construct.

**Structural Properties**:
- OSC (Operating System Command): `ESC ] ... ST`
- DCS (Device Control String): `ESC P ... ST`
- ST (String Terminator): `ESC \` or 0x9C
- When parser enters OSC/DCS state: scan for ST, discard payload
- No allocation, no parsing of payload content

**Why This Invariant**:
- Window title, clipboard, hyperlinks don't affect grid
- Copying/parsing payload wastes CPU and memory
- Scanning for delimiter is O(n) where n = payload length

**Validation**:
- `ESC ] 0 ; Window Title ESC \` → recognized, discarded
- `ESC P q ... ESC \` → recognized, discarded
- No allocation during OSC/DCS processing

### 8. Parser State Transitions (Compact, No Virtual Calls)

**Invariant**: State transitions are compact table lookups, not virtual calls or function pointers.

**Structural Properties**:
```odin
Parser_State :: enum u8 {
    Ground,
    Escape,
    CSI_Entry,
    CSI_Param,
    CSI_Intermediate,
    OSC,
    DCS,
    Utf8,
}

Transition :: struct {
    action: Action,
    next_state: Parser_State,
}

TRANSITION_TABLE: [256][8]Transition = {...}
```
- Table-driven: `transition := TRANSITION_TABLE[state][byte]`
- No virtual calls, no function pointers
- No event allocation per transition

**Why This Invariant**:
- State transitions are high-frequency
- Virtual calls add indirection overhead
- Event allocation per transition is unacceptable

**Validation**:
- Ground + 'A' (0x41) → (Print, Ground)
- Ground + ESC (0x1B) → (Clear, Escape)
- Escape + '[' (0x5B) → (Clear, CSI_Entry)

## Data Flow

```
PTY bytes
    ↓
Block Scanner (ASCII fast path)
    ↓
┌───────────────────────────────────┐
│  All printable ASCII?             │
│  YES → PrintRun → terminal       │
│  NO  → find first special byte   │
└───────────────────────────────────┘
    ↓
VT State Machine (scalar)
    ↓
┌───────────────────────────────────┐
│  Ground state + printable?        │
│  → accumulate run                 │
│                                   │
│  ESC/CSI/OSC/DCS?                 │
│  → state transition               │
│                                   │
│  UTF-8 lead byte?                 │
│  → UTF-8 decoder                  │
└───────────────────────────────────┘
    ↓
Terminal Mutator
    ↓
┌───────────────────────────────────┐
│  PrintRun(chars, style)           │
│  → grid_set_cell (range)          │
│  → damage_mark_span               │
│  → cursor_advance                 │
└───────────────────────────────────┘
```

## MECE Completeness Matrix

| Input Type | Ground State | Escape State | CSI_Param State | OSC State | Utf8 State |
|------------|--------------|--------------|-----------------|-----------|------------|
| Printable ASCII (0x20-0x7E) | Result: PrintRun accumulated | Result: esc_dispatch, return to Ground | Result: csi_dispatch, return to Ground | Result: osc_put (accumulate) | Crack: invalid (return to Ground) |
| C0 Control (0x00-0x1F) | Result: execute (CR/LF/BS/TAB) | Result: execute, stay in Escape | Result: execute, stay in CSI_Param | Result: ignore | Result: execute, return to Ground |
| ESC (0x1B) | Result: clear, enter Escape | Result: clear, stay in Escape | Result: clear, enter Escape | Result: ignore | Result: clear, enter Escape |
| CSI Intro (0x5B '[') | — | Result: clear, enter CSI_Entry | — | — | — |
| CSI Digit (0x30-0x39) | — | — | Result: param (accumulate digit) | — | — |
| CSI Semi (0x3B ';') | — | — | Result: param (next parameter) | — | — |
| CSI Final (0x40-0x7E) | — | — | Result: csi_dispatch, return to Ground | — | — |
| OSC Intro (0x5D ']') | — | Result: osc_start, enter OSC | — | — | — |
| OSC End (ESC '\') | — | — | — | Result: osc_end, return to Ground | — |
| UTF-8 Lead (0xC0-0xFF) | Result: enter Utf8 state | Result: enter Utf8 state | Result: enter Utf8 state | Result: enter Utf8 state | Result: continue decode |
| UTF-8 Cont (0x80-0xBF) | Crack: invalid (replacement char) | Crack: invalid (return to Ground) | Crack: invalid (return to Ground) | Crack: invalid (return to Ground) | Result: accumulate, check complete |
| Invalid byte | Crack: ignore | Crack: ignore | Crack: ignore | Crack: ignore | Crack: replacement char |

## Implementation Order

1. **ascii_scan.odin** — Block scanner (ASCII fast path)
2. **utf8.odin** — UTF-8 decoder (separate state machine)
3. **vt.odin** — VT state machine (state transitions)
4. **csi.odin** — CSI parameter parsing and dispatch
5. **parser.odin** — Top-level parser API (integrates all components)
6. **tests/parser_test.odin** — Unit and integration tests

## Testing Strategy

**Unit Tests**:
1. ASCII fast path (printable runs)
2. Control characters (CR, LF, BS, TAB)
3. CSI sequences (SGR, CUP, CUU/CUD/CUF/CUB, EL, ED)
4. UTF-8 decoding (2-byte, 3-byte, 4-byte sequences)
5. OSC/DCS skipping
6. Parser state transitions
7. Invalid/truncated sequences

**Integration Tests**:
1. Simple text: "hello world"
2. Colored text: "ESC[31mRED ESC[0m"
3. Cursor movement: "ESC[2;5H" (move to row 2, col 5)
4. Erase operations: "ESC[K" (erase to end of line)
5. Scroll: "ESC[2S" (scroll up 2 lines)
6. Mixed: text + colors + cursor movement

**Correctness Oracle**:
- Parser input → semantic state → snapshot
- Compare expected cursor, cells, styles, scroll region
- Golden tests for common sequences

**Performance Tests** (using Phase 0 benchmark):
- Bytes/sec throughput
- Cycles/byte
- ASCII fast-path ratio
- CSI sequences/sec
