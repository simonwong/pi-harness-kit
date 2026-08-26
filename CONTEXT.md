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
The Interface Zone containing the durable, recoverable record of user messages, assistant responses, thinking, and tool activity.
_Avoid_: Message list, chat cards

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
