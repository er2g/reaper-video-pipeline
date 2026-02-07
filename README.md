# Reaper Video Pipeline

Cross-platform desktop workflow for processing video audio through REAPER FX chains and merging the processed audio back into the source video.

## Workflow

1. Extract source audio from video
2. Route audio through REAPER project/FX chain
3. Render processed output
4. Recombine rendered audio with original video

## Features

- Native REAPER integration helpers
- Automatic extension/script setup support
- Real-time processing progress feedback
- Configurable export options

## Repository Structure

- `tauri-app/`: desktop UI application
- `reaper-extension/`: extension-side integration code
- `reaper-scripts/`: REAPER automation scripts
- `screenshots/`: UI preview images

## Notes

This project assumes a working local REAPER installation and FFmpeg availability.
