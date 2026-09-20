# AudioSort

AudioSort is an audio processor that slices an audio file into equal chunks of a given 'window' size, sorts them by amplitude or frequency, and reassembles the chunks into a contiguous audio file.

Everything runs client-side via the Web Audio API and does not upload or perform server-side processing.

This is a fun way to perform granular synthesis that I haven't seen before, so I decided to make a web app for it!
