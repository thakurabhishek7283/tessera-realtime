# 3. Calls are a mesh, and only one side makes the first offer

Status: accepted

## Context

A call needs a connection between every pair of participants. The options are a mesh (everybody connects to everybody), a selective forwarding unit (SFU, everybody connects to a media server) or an MCU. An SFU scales further but needs a media server that the repository would have to run and document, which does not fit "works across two tabs with no backend". Signalling goes through the transport that every kit already uses.

The usual way to set up a connection safely is the "perfect negotiation" pattern: both sides may offer at any time, and when two offers collide the polite side rolls back its own. The first version of the connection code let both sides offer as soon as they saw each other. That works on paper, but in Chromium it left connections stuck about one time in three: the polite side had already started gathering ICE candidates for its own offer, rolled it back, and then never produced candidates for the answer. A second race came from applying a candidate while the description in front of it was still being set, which the browser rejects.

## Decision

- Calls are a mesh with a hard maximum of six people (default four). The transport's room limit is checked as well as the configured one.
- The peer with the smaller id is the impolite one and makes the first offer. The polite peer creates no transceivers until that offer arrives, then attaches its tracks to the transceivers the offer created and answers. Offers that cross later (an ICE restart on both sides at once) are still settled by perfect negotiation.
- Signals for one connection are applied one at a time, in arrival order.
- Both directions exist for audio and video from the start, so turning the camera on, switching a device or sharing the screen is a `replaceTrack`, never a renegotiation.

## Consequences

- Initial setup never collides, and the case that does collide is covered by a test with a simulated connection that follows the signalling state machine, plus two-browser tests against real WebRTC with Chromium's fake devices.
- Quality drops with every added person, because each one uploads a stream per peer. The documented limit is the honest answer; an SFU adapter would replace only the connection layer.
- The polite peer's first track attachment happens inside the answer, which is why the controller does not need to know who is who.
