# Pi UI

The shared language for the Pi UI product family: pi-native enhancements that make terminal agent sessions easier to compose, follow, and inspect. Pi UI lives in the multi-product `pi-harness-kit` repository.

## Language

**Pi UI**:
The descriptive product family for UI/UX enhancements in this repository.
_Avoid_: Better Pi, Pi UI/UX Extension Suite

**Surface**:
A user-recognizable visual area that can anchor a package name, independent of the user-task boundary described by an Interface Zone.
_Avoid_: Interface Zone, component

**Capability**:
A candidate user-facing enhancement evaluated for inclusion in the Product Roadmap and a release scope.
_Avoid_: Feature idea, component

**Interface Zone**:
A product boundary defined by the user's task and the lifetime of its information, independent of screen position or package structure.
_Avoid_: UI section, package, component group

**Composer**:
The Interface Zone where a user organizes and submits intent to pi.
_Avoid_: Input box, editor package

**Transcript**:
The Interface Zone containing the durable, recoverable record of user messages, Assistant Reply Segments, Work Traces, and their evidence.
_Avoid_: Message list, chat cards

**Assistant Reply Segment**:
One non-empty block of user-visible text authored by the model; it excludes thinking and Tool Activity and need not be the final answer.
_Avoid_: Output, tool output, final response

**Work Trace**:
The ordered thinking and Tool Activity between a user message or Assistant Reply Segment and the next Assistant Reply Segment. Its first thinking block anchors the collapsed summary; expansion restores original components in place. Tool Activity owned by another extension may remain native.
_Avoid_: Thought, synthetic tool group, message output

**Thought Summary**:
The collapsed aggregate presentation anchored at the first thinking block of one Work Trace, including cumulative thinking duration and observed tool count.
_Avoid_: Thinking block, per-tool card, response summary

**Tool Activity**:
One observed tool invocation inside a Work Trace. Suite-owned renderers may fold under the Thought Summary; extension-owned renderers remain native when no safe presentation seam exists.
_Avoid_: Tool card, tool output

**Activity**:
The Interface Zone communicating truthful, transient state about work currently in progress.
_Avoid_: Working message, progress dashboard

**Inspector**:
The Interface Zone exposing diagnostic detail and controls on demand so the user can make an informed next action.
_Avoid_: Settings modal, debug panel

**Host Chrome**:
The scarce global frame supplied by pi, such as its header or footer, where a Capability may render without owning that product boundary.
_Avoid_: Activity Zone, shared package

**Native Escape Hatch**:
The guaranteed path for disabling suite enhancements and returning to pi's unmodified behavior.
_Avoid_: Reset button, fallback mode

**Release Scope**:
The finite set of Roadmap capabilities selected for one delivery effort; the current effort targets a local, daily-usable v1.
_Avoid_: Full Roadmap, backlog

**Release Horizon**:
An ordered product outcome after the current Release Scope, recorded as direction without silently joining the current effort.
_Avoid_: Phase, backlog
