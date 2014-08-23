# uGravity

This client-side library allows one to submit planatary masses, 2D positions, and velocities (see sun-earth-moon.jsonp). It will then compute their positions over time using Newton's law of gravitation. To maximize accuracy, computations are done in a dedicated web worker, and positions are messaged back to be displayed on a canvas. The interactive canvas can be panned or zoomed by scrolling/dragging on a desktop machine and using gestures on mobile devices (similar to something like a google map). See [uGravity.com](https://ugravity.com/) for a UI to build a solar system.

See the sun-earth-moon.jsonp demo here: [http://sfarthin.github.io/ugravity/](http://sfarthin.github.io/ugravity/)

The code for the UI of uGravity is available here: [https://github.com/sfarthin/ugravity.com](https://github.com/sfarthin/ugravity.com).

## Mobile
Include the [hammerjs](http://eightmedia.github.io/hammer.js/) library for multitouch.
