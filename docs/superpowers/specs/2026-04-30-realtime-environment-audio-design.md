# Realtime Environment Audio Design

Date: 2026-04-30

## Summary

Add realtime environment audio to the existing phone monitoring flow. When the monitoring phone starts a camera session, it should request microphone permission alongside camera permission and stream the phone's surrounding sound to the viewer through the existing WebRTC connection.

This feature is live-only. The app must not record audio, store audio files, upload audio recordings, or expose playback history.

## Goals

- Let the viewer hear the monitoring phone's surrounding environment during a live monitoring session.
- Enable environment audio by default when the monitoring phone starts monitoring.
- Keep audio on the existing WebRTC live connection.
- Preserve clear privacy indicators on the monitoring phone.
- Continue video monitoring if microphone permission is denied or unavailable.

## Non-Goals

- No phone call recording.
- No automatic answering of system phone calls.
- No background or hidden audio capture in the PWA.
- No saved audio files on the monitoring phone, viewer phone, or server.
- No cloud audio storage or playback timeline.
- No viewer-side recording feature.

## User Experience

### Camera Side

When the user starts monitoring, the camera side requests both camera and microphone permission. The camera preview remains visible, and the status text must make it clear that both video and environment audio are live when the microphone is active.

If microphone permission is blocked or the microphone is unavailable, the camera session should still start with video only. The UI should show a compact warning such as "Environment audio is off" while keeping the existing camera status and stop controls available.

Stopping monitoring must stop every media track, including both camera and microphone tracks.

### Viewer Side

The viewer should receive audio automatically once the WebRTC stream is live. Because browser autoplay rules may block audible playback until a user gesture, the viewer should provide a clear mute/unmute control near the live video.

The viewer should default to an understandable state:

- If playback with audio is allowed, live audio is audible.
- If the browser blocks audible autoplay, the viewer shows a compact prompt to tap the audio button.
- If the camera side has no microphone track, the viewer shows "Environment audio unavailable" without disrupting video.

The viewer must not offer recording, downloading, or saving audio.

## Architecture

### Camera Media Capture

The camera session should request media with video constraints from the existing video quality preference and `audio: true`. If the combined camera and microphone request fails because of microphone permission or hardware, the camera side should retry video-only capture and report audio as unavailable.

The camera session owns the full `MediaStream` lifecycle. Existing stream cleanup should stop all tracks, so the implementation should avoid keeping separate audio tracks outside the main stream unless a browser fallback requires it.

### WebRTC

The existing WebRTC sender path should add every track from the local stream to the peer connection. This should naturally include audio once the stream contains an audio track.

The signaling contract does not need to change. Audio rides on the same WebRTC media connection as video, and no server-side media processing is introduced.

### Viewer Playback

The remote media stream should be attached to the existing viewer video element. The viewer should expose local playback controls for audio, such as a mute/unmute button that toggles the media element's `muted` state.

Playback state belongs to the viewer UI only. Muting on the viewer must not affect whether the camera side is sending audio.

### Safety UI

The camera side must show a visible indication when environment audio is active. Suggested text:

- "Video and environment audio are live"
- "Environment audio is off" when microphone permission is denied or unavailable

The app should avoid hidden or ambiguous wording such as "listening silently".

## Error Handling

- Camera permission denied: keep the existing camera permission error behavior.
- Microphone permission denied: start video-only monitoring and show audio-off guidance.
- Microphone unavailable: start video-only monitoring and show audio unavailable guidance.
- Browser blocks viewer audible autoplay: keep live video visible and ask the viewer to tap the audio control.
- Remote stream has no audio track: show "Environment audio unavailable".
- Session stopped: stop all local media tracks and close the WebRTC connection.

## Privacy Boundaries

- Environment audio is live-only.
- No audio recordings are created.
- No audio is sent to the signaling server as stored data.
- No hidden monitoring mode is introduced.
- Monitoring-side UI must visibly state when microphone audio is active.
- The feature captures surrounding environment audio only, not system phone call audio.

## Testing

Add focused automated coverage for:

- Camera startup requests audio by default with the existing video constraints.
- If audio capture fails, camera startup falls back to video-only monitoring.
- Camera status text distinguishes audio live from audio unavailable.
- Stopping monitoring stops audio tracks as well as video tracks.
- Viewer receives a remote stream with audio and exposes mute/unmute playback behavior.
- Viewer handles a remote stream without audio without breaking video.

Manual validation should include:

- Start a camera session on a phone and confirm the browser asks for microphone permission.
- Join from a viewer and confirm live environment sound is audible after any required tap.
- Deny microphone permission and confirm video-only monitoring still works.
- Stop monitoring and confirm the microphone indicator disappears on the camera phone.

## Acceptance Criteria

- A normal camera session starts with video and realtime environment audio when permissions are granted.
- No audio is saved locally or in the cloud.
- Viewer playback includes a clear mute/unmute control.
- Video monitoring still works when microphone access fails.
- Monitoring-side UI clearly indicates microphone audio is active.
- Existing pairing, reconnect, video quality, battery, and keep-awake behavior remain intact.
